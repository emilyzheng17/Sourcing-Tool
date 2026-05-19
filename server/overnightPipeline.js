/**
 * Overnight Universe Builder — permissive discovery pipeline.
 *
 * Discovers companies from all 13 sources without filter rejection,
 * persists every candidate immediately, computes a cheap priority score,
 * and inserts enrichment queue jobs for the background workers to pick up.
 */

import { randomUUID } from "crypto";
import { discoverMergedCandidatesStreaming } from "./lib/candidateDiscovery.js";
import { normalizeDomain, isLikelyCompanyDomain } from "./lib/domains.js";
import { cheapPreScore } from "./lib/cheapPreScore.js";
import {
  createBuildJob,
  updateBuildJobStatus,
  updateBuildJobStats,
  upsertDiscoveredCompany,
  insertCompanySource,
  insertEnrichmentJob,
  insertCompanyEvent,
  countPendingJobs,
} from "./db.js";
import { startEnrichmentWorker, stopEnrichmentWorker } from "./workers/enrichmentWorker.js";
import { startClassificationWorker, stopClassificationWorker } from "./workers/classificationWorker.js";
import queueSignal from "./lib/queueSignal.js";

const activeJobs = new Map();

export function getActiveJob(jobId) {
  return activeJobs.get(jobId);
}

export function listActiveJobs() {
  return [...activeJobs.values()].map((j) => ({ jobId: j.jobId, status: j.status }));
}

function parseMaxRunTimeMs(config) {
  const hours = Math.min(24, Math.max(1, Number(config?.maxRunTimeHours) || 8));
  return hours * 60 * 60 * 1000;
}

function finishBuildOnTimeout(jobId, jobState, emitAll) {
  if (!jobState || jobState.finished) return;
  jobState.finished = true;
  jobState.status = "done";
  stopEnrichmentWorker(jobId);
  stopClassificationWorker(jobId);
  updateBuildJobStats(jobId, jobState.stats || {});
  updateBuildJobStatus(jobId, "DONE");
  emitAll({ type: "build:timeout", ...(jobState.stats || {}) });
}

function finishBuildComplete(jobId, jobState, emitAll) {
  if (!jobState || jobState.finished) return;
  jobState.finished = true;
  jobState.status = "done";
  stopEnrichmentWorker(jobId);
  stopClassificationWorker(jobId);
  updateBuildJobStats(jobId, jobState.stats || {});
  updateBuildJobStatus(jobId, "DONE");
  emitAll({ type: "build:done", ...(jobState.stats || {}) });
}

/**
 * @param {object} config
 * @param {string[]} config.selectedVerticals
 * @param {string[]} config.selectedProducts
 * @param {number}   config.maxCandidates
 * @param {string}   config.depth           - "metadata_only" | "standard" | "deep"
 * @param {number}   config.stageBThreshold - min priority_score to promote to Stage B
 * @param {boolean}  config.useOllama
 * @param {string}   config.breadth         - "focused" | "broad" | "exhaustive"
 * @param {NodeJS.ProcessEnv} env
 * @param {(evt: object) => void} emit
 */
export async function startUniverseBuild(config, env, emit) {
  const jobId = randomUUID();
  const depth = config.depth || "standard";
  const stageBThreshold = config.stageBThreshold ?? (depth === "deep" ? 55 : 40);
  const useOllama = !!(config.useOllama && depth === "deep");
  const maxCandidates = Math.min(50000, Math.max(100, parseInt(String(config.maxCandidates ?? 5000), 10) || 5000));
  const maxRunTimeMs = parseMaxRunTimeMs(config);
  const deadline = Date.now() + maxRunTimeMs;

  const jobConfig = {
    ...config,
    depth,
    stageBThreshold,
    useOllama,
    maxCandidates,
    maxRunTimeHours: maxRunTimeMs / (60 * 60 * 1000),
    deadline,
  };

  createBuildJob(jobId, jobConfig);

  const stats = {
    discovered: 0,
    basicEnriched: 0,
    fullyEnriched: 0,
    classified: 0,
    failed: 0,
    skipped: 0,
  };

  const jobState = {
    jobId,
    status: "running",
    stats,
    deadline,
    finished: false,
    subscribers: new Set(),
    abortController: new AbortController(),
  };
  activeJobs.set(jobId, jobState);

  const emitAll = (evt) => {
    try { emit(evt); } catch { /* */ }
    for (const fn of jobState.subscribers) {
      try { fn(evt); } catch { /* */ }
    }
  };

  emitAll({ type: "build:started", jobId });

  const brief = {
    selectedVerticals: config.selectedVerticals || [],
    selectedProducts: config.selectedProducts || [],
    maxCompanies: maxCandidates,
    breadth: config.breadth || "exhaustive",
    activeProduct: config.selectedProducts?.[0] || "B2B software",
    selectedTags: config.selectedTags || [],
    selectedTagsByProduct: config.selectedTagsByProduct || {},
  };

  const fetchCache = new Map();
  const jitterHostState = new Map();
  const fetchOpts = { cache: fetchCache, jitterHostState };

  const discovered = new Set();

  try {
    // Start background workers before discovery so they can process jobs
    // as candidates arrive — pipeline overlap.
    startEnrichmentWorker(
      jobId,
      jobConfig,
      env,
      (evt) => {
        if (evt.type === "timeout") {
          finishBuildOnTimeout(jobId, jobState, emitAll);
          return;
        }
        if (evt.type === "enriched_a") stats.basicEnriched += 1;
        if (evt.type === "enriched_b") stats.fullyEnriched += 1;
        if (evt.type === "enrich_failed") stats.failed += 1;
        if (evt.type === "skipped") stats.skipped += 1;
        updateBuildJobStats(jobId, stats);
        emitAll({ type: `build:${evt.type}`, ...evt, ...stats });
      },
      () => finishBuildOnTimeout(jobId, jobState, emitAll),
    );

    if (depth !== "metadata_only") {
      startClassificationWorker(
        jobId,
        jobConfig,
        env,
        (evt) => {
          if (evt.type === "timeout") {
            finishBuildOnTimeout(jobId, jobState, emitAll);
            return;
          }
          if (evt.type === "classified") stats.classified += 1;
          if (evt.type === "classify_failed") stats.failed += 1;
          updateBuildJobStats(jobId, stats);
          emitAll({ type: `build:${evt.type}`, ...evt, ...stats });
        },
        () => finishBuildOnTimeout(jobId, jobState, emitAll),
      );
    }

    const { timedOut: discoveryTimedOut } = await discoverMergedCandidatesStreaming(
      brief,
      env,
      fetchOpts,
      (evt) => emitAll({ ...evt, type: evt.type === "log" ? "build:log" : `build:${evt.type}` }),
      { deadline, exclude: new Set() },
      (_key, getLatest) => {
        const c = getLatest();
        if (!c) return;

        const domain = normalizeDomain(c.website || c.domain || "");
        if (!domain || discovered.has(domain)) return;

        if (!isLikelyCompanyDomain(domain)) return;
        discovered.add(domain);

        const tags = c.sourceTags || [c.sourceTag].filter(Boolean);
        const { cheapScore } = cheapPreScore({
          homepageText: "",
          title: c.name || "",
          metaDescription: c.rawMetadata?.shortDescription || "",
          candidate: c,
          brief,
        });

        const companyId = upsertDiscoveredCompany({
          domain,
          name: c.name,
          website: c.website,
          batchId: jobId,
          priorityScore: cheapScore,
        });

        for (const tag of tags) {
          insertCompanySource({
            companyId,
            sourceTag: tag,
            sourceUrl: c.sourceUrl || c.website,
            rawMetadata: c.rawMetadata,
            batchId: jobId,
          });
        }

        insertEnrichmentJob({
          companyId,
          jobType: "ENRICH_A",
          priority: cheapScore,
          thesisVersion: "v1",
        });

        insertCompanyEvent(companyId, "DISCOVERED", {
          batchId: jobId,
          sourceTags: tags,
          cheapScore,
        });

        stats.discovered += 1;
        if (stats.discovered % 25 === 0 || stats.discovered <= 5) {
          updateBuildJobStats(jobId, stats);
          emitAll({
            type: "build:progress",
            ...stats,
            latestDomain: domain,
            latestName: c.name,
          });
        }
      },
    );

    updateBuildJobStats(jobId, stats);
    emitAll({
      type: "build:discovery_done",
      ...stats,
    });

    if (Date.now() >= deadline || discoveryTimedOut) {
      finishBuildOnTimeout(jobId, jobState, emitAll);
      return jobId;
    }

    // Wait for workers to drain all remaining enrichment_queue jobs.
    // Wake on queueSignal or poll every 5 s as a fallback.
    await new Promise((resolve) => {
      const DRAIN_POLL_MS = 5000;

      function check() {
        if (jobState.finished) { resolve(); return; }
        if (Date.now() >= deadline) { finishBuildOnTimeout(jobId, jobState, emitAll); resolve(); return; }

        const pending = countPendingJobs(jobId);
        if (pending === 0) {
          finishBuildComplete(jobId, jobState, emitAll);
          resolve();
          return;
        }

        const onEnqueued = () => {
          clearTimeout(fallback);
          // Re-check shortly after the signal — give workers time to claim & complete
          setTimeout(check, 200);
        };
        const fallback = setTimeout(() => {
          queueSignal.removeListener("enqueued", onEnqueued);
          check();
        }, DRAIN_POLL_MS);
        queueSignal.once("enqueued", onEnqueued);
      }

      check();
    });

  } catch (e) {
    updateBuildJobStatus(jobId, "ERROR");
    jobState.status = "error";
    emitAll({ type: "build:error", message: e.message || String(e) });
  }

  return jobId;
}

export function pauseBuild(jobId) {
  const job = activeJobs.get(jobId);
  if (job) job.status = "paused";
  updateBuildJobStatus(jobId, "PAUSED");
}

export function resumeBuild(jobId) {
  const job = activeJobs.get(jobId);
  if (job) job.status = "running";
  updateBuildJobStatus(jobId, "RUNNING");
}

export function stopBuild(jobId) {
  const job = activeJobs.get(jobId);
  if (job) {
    job.status = "stopped";
    job.finished = true;
    job.abortController?.abort();
  }
  stopEnrichmentWorker(jobId);
  stopClassificationWorker(jobId);
  updateBuildJobStatus(jobId, "STOPPED");
}
