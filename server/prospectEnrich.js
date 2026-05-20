/**
 * Prospect enrichment pipeline.
 *
 * Enqueues selected prospects for enrichment and starts background
 * workers (reusing enrichmentWorker / classificationWorker) scoped
 * to a new build_jobs entry for progress tracking.
 */

import { randomUUID } from "crypto";
import {
  createBuildJob,
  updateBuildJobStatus,
  updateBuildJobStats,
  enqueueProspectEnrichment,
  listTopProspectIds,
  countPendingProspectJobs,
} from "./db.js";
import { startEnrichmentWorker, stopEnrichmentWorker } from "./workers/enrichmentWorker.js";
import { startClassificationWorker, stopClassificationWorker } from "./workers/classificationWorker.js";
import queueSignal from "./lib/queueSignal.js";

const activeProspectJobs = new Map();

export function getActiveProspectJob(jobId) {
  return activeProspectJobs.get(jobId);
}

/**
 * @param {object} config
 * @param {number[]} [config.ids]           Explicit prospect IDs to enrich
 * @param {boolean}  [config.all]           Enrich top prospects by priority
 * @param {number}   [config.maxCandidates] Max to enqueue when all=true (default 1000)
 * @param {number}   [config.minPriority]   Min priority_score filter (default 0)
 * @param {string}   [config.depth]         "metadata_only" | "standard" | "deep"
 * @param {number}   [config.stageBThreshold]
 * @param {number}   [config.maxRunTimeHours]
 * @param {NodeJS.ProcessEnv} env
 * @param {(evt: object) => void} emit
 */
export function startProspectEnrich(config, env, emit) {
  const jobId = randomUUID();
  const depth = config.depth || "standard";
  const stageBThreshold = config.stageBThreshold ?? (depth === "deep" ? 55 : 40);
  const maxRunTimeHours = Math.min(24, Math.max(0.5, Number(config.maxRunTimeHours) || 4));
  const deadline = Date.now() + maxRunTimeHours * 60 * 60 * 1000;

  let ids = [];
  if (Array.isArray(config.ids) && config.ids.length) {
    ids = config.ids.map((x) => parseInt(String(x), 10)).filter(Number.isFinite);
  } else {
    const max = Math.min(50000, Math.max(1, parseInt(String(config.maxCandidates ?? 1000), 10) || 1000));
    const minP = Number(config.minPriority) || 0;
    ids = listTopProspectIds(max, minP);
  }

  const enqueued = enqueueProspectEnrichment(ids);
  const pending = countPendingProspectJobs();
  const queuedWork = pending > 0 ? pending : enqueued;

  const jobConfig = {
    type: "prospect-enrich",
    depth,
    stageBThreshold,
    maxRunTimeHours,
    deadline,
    requestedCount: ids.length,
    enqueuedCount: enqueued,
    pendingCount: pending,
  };

  createBuildJob(jobId, jobConfig);

  const stats = {
    enqueued: queuedWork,
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
  };
  activeProspectJobs.set(jobId, jobState);

  const emitAll = (evt) => {
    try { emit(evt); } catch { /* */ }
    for (const fn of jobState.subscribers) {
      try { fn(evt); } catch { /* */ }
    }
  };

  emitAll({ type: "prospect:started", jobId, enqueued: queuedWork });

  if (queuedWork === 0) {
    jobState.finished = true;
    jobState.status = "done";
    updateBuildJobStats(jobId, stats);
    updateBuildJobStatus(jobId, "DONE");
    emitAll({ type: "prospect:done", jobId, ...stats });
    return jobId;
  }

  const workerConfig = {
    ...config,
    depth,
    stageBThreshold,
    deadline,
    enrichConcurrency: config.enrichConcurrency ?? 12,
    selectedVerticals: config.selectedVerticals || [],
    selectedProducts: config.selectedProducts || [],
    selectedTags: config.selectedTags || [],
  };

  function finish() {
    if (jobState.finished) return;
    jobState.finished = true;
    jobState.status = "done";
    stopEnrichmentWorker(jobId);
    stopClassificationWorker(jobId);
    updateBuildJobStats(jobId, stats);
    updateBuildJobStatus(jobId, "DONE");
    emitAll({ type: "prospect:done", jobId, ...stats });
  }

  startEnrichmentWorker(
    jobId,
    workerConfig,
    env,
    (evt) => {
      if (evt.type === "timeout") { finish(); return; }
      if (evt.type === "enriched_a") stats.basicEnriched += 1;
      if (evt.type === "enriched_b") stats.fullyEnriched += 1;
      if (evt.type === "enrich_failed") stats.failed += 1;
      if (evt.type === "skipped") stats.skipped += 1;
      updateBuildJobStats(jobId, stats);
      emitAll({ type: `prospect:${evt.type}`, ...evt, ...stats });
    },
    () => finish(),
  );

  if (depth !== "metadata_only") {
    startClassificationWorker(
      jobId,
      workerConfig,
      env,
      (evt) => {
        if (evt.type === "timeout") { finish(); return; }
        if (evt.type === "classified") stats.classified += 1;
        if (evt.type === "classify_failed") stats.failed += 1;
        updateBuildJobStats(jobId, stats);
        emitAll({ type: `prospect:${evt.type}`, ...evt, ...stats });
      },
      () => finish(),
    );
  }

  // Drain check: when the global prospect queue is empty, finish.
  (async () => {
    const DRAIN_POLL_MS = 5000;
    while (!jobState.finished) {
      if (Date.now() >= deadline) { finish(); return; }
      const pending = countPendingProspectJobs();
      if (pending === 0) { finish(); return; }
      await new Promise((resolve) => {
        const onEnqueued = () => { clearTimeout(fallback); setTimeout(resolve, 200); };
        const fallback = setTimeout(() => {
          queueSignal.removeListener("enqueued", onEnqueued);
          resolve();
        }, DRAIN_POLL_MS);
        queueSignal.once("enqueued", onEnqueued);
      });
    }
  })();

  return jobId;
}

export function stopProspectEnrich(jobId) {
  const job = activeProspectJobs.get(jobId);
  if (job) {
    job.finished = true;
    job.status = "stopped";
  }
  stopEnrichmentWorker(jobId);
  stopClassificationWorker(jobId);
  updateBuildJobStatus(jobId, "STOPPED");
}
