/**
 * Background enrichment worker for the Overnight Universe Builder.
 *
 * Polls the enrichment_queue for ENRICH_A and ENRICH_B jobs,
 * runs the corresponding enrichment stage, and updates the DB.
 * Stage B is gated by the config's stageBThreshold.
 */

import { enrichCandidateStageA, enrichCandidateStageB } from "../enrich.js";
import { startWorkerLoop } from "../lib/workerLoop.js";
import {
  claimEnrichmentJobs,
  completeEnrichmentJob,
  failEnrichmentJob,
  updateCompanyStatus,
  insertEnrichmentJob,
  insertCompanyEvent,
  getCompanyById,
  upsertCompany,
  getDb,
} from "../db.js";

const workers = new Map();

export function startEnrichmentWorker(jobId, config, env, emit, onDeadline) {
  const depth = config.depth || "standard";
  const stageBThreshold = config.stageBThreshold ?? 40;
  const concurrency = config.enrichConcurrency ?? 16;
  const deadline = typeof config.deadline === "number" ? config.deadline : null;

  const fetchCache = new Map();
  const jitterHostState = new Map();
  const fetchOpts = { cache: fetchCache, jitterHostState };

  const brief = {
    selectedVerticals: config.selectedVerticals || [],
    selectedProducts: config.selectedProducts || [],
    activeProduct: config.selectedProducts?.[0] || "B2B software",
    selectedTags: config.selectedTags || [],
  };

  let stopped = false;
  let inFlight = 0;

  async function processEnrichA(job) {
    const companyId = job.company_id;
    const candidate = buildCandidateFromRow(job);

    try {
      const stageA = await enrichCandidateStageA(candidate, brief, env, fetchOpts);

      if (!stageA) {
        getDb().transaction(() => {
          completeEnrichmentJob(job.id);
          updateCompanyStatus(companyId, "BASIC_ENRICHED", {
            last_enriched_at: new Date().toISOString(),
            is_rejected: 1,
          });
          insertCompanyEvent(companyId, "BASIC_ENRICHED", { skipped: true, reason: "pre-score reject" });
        })();
        emit({ type: "skipped", domain: job.domain, companyId });
        return;
      }

      const enrichedData = {
        cheapScore: stageA.cheapScore,
        cheapScoreReasons: stageA.cheapScoreReasons,
        homepageTextSample: stageA.homepageText?.slice(0, 4000),
        metaDescription: stageA.metaDescription,
        title: stageA.title,
      };

      const existingRow = getCompanyById(companyId);
      let existingData = {};
      try { existingData = JSON.parse(existingRow?.data || "{}"); } catch { /* */ }

      getDb().transaction(() => {
        upsertCompany({
          domain: job.domain,
          name: stageA.title || job.name,
          website: stageA.base,
          data: { ...existingData, ...enrichedData },
        });

        updateCompanyStatus(companyId, "BASIC_ENRICHED", {
          last_enriched_at: new Date().toISOString(),
          priority_score: stageA.cheapScore,
        });

        if (stageA.cheapScore >= stageBThreshold) {
          getDb().prepare(
            "UPDATE companies SET pool = 'universe' WHERE id = ? AND pool = 'prospect'"
          ).run(companyId);
        }

        completeEnrichmentJob(job.id);
        insertCompanyEvent(companyId, "BASIC_ENRICHED", { cheapScore: stageA.cheapScore });

        if (depth !== "metadata_only" && stageA.cheapScore >= stageBThreshold) {
          insertEnrichmentJob({
            companyId,
            jobType: "ENRICH_B",
            priority: stageA.cheapScore,
            thesisVersion: "v1",
          });
        }
      })();

      emit({ type: "enriched_a", domain: job.domain, companyId, cheapScore: stageA.cheapScore });
    } catch (e) {
      failEnrichmentJob(job.id, e.message);
      updateCompanyStatus(companyId, "FAILED", {
        error_message: e.message,
        enrichment_attempt_count: (job.attempt_count || 0) + 1,
      });
      emit({ type: "enrich_failed", domain: job.domain, companyId, error: e.message });
    }
  }

  async function processEnrichB(job) {
    const companyId = job.company_id;
    const candidate = buildCandidateFromRow(job);

    try {
      const stageA = await enrichCandidateStageA(candidate, brief, env, fetchOpts);
      if (!stageA) {
        getDb().transaction(() => {
          completeEnrichmentJob(job.id);
        })();
        emit({ type: "skipped", domain: job.domain, companyId });
        return;
      }

      const enriched = await enrichCandidateStageB(candidate, stageA, brief, env, fetchOpts);
      if (!enriched) {
        getDb().transaction(() => {
          completeEnrichmentJob(job.id);
        })();
        emit({ type: "skipped", domain: job.domain, companyId });
        return;
      }

      getDb().transaction(() => {
        upsertCompany({
          domain: enriched.domain,
          name: enriched.name,
          website: enriched.website,
          data: enriched,
        });

        updateCompanyStatus(companyId, "FULLY_ENRICHED", {
          last_enriched_at: new Date().toISOString(),
        });

        getDb().prepare(
          "UPDATE companies SET pool = 'universe' WHERE id = ? AND pool = 'prospect'"
        ).run(companyId);

        completeEnrichmentJob(job.id);
        insertCompanyEvent(companyId, "FULLY_ENRICHED", { domain: enriched.domain });

        insertEnrichmentJob({
          companyId,
          jobType: "CLASSIFY",
          priority: job.priority,
          thesisVersion: "v1",
        });
      })();

      emit({ type: "enriched_b", domain: enriched.domain, companyId });
    } catch (e) {
      failEnrichmentJob(job.id, e.message);
      updateCompanyStatus(companyId, "FAILED", {
        error_message: e.message,
        enrichment_attempt_count: (job.attempt_count || 0) + 1,
      });
      emit({ type: "enrich_failed", domain: job.domain, companyId, error: e.message });
    }
  }

  const loop = startWorkerLoop({
    jobId,
    pollIntervalMs: 2000,
    isStopped: () => stopped || (deadline != null && Date.now() > deadline),
    getDeadline: () => deadline ?? undefined,
    onDeadline: () => {
      stopped = true;
      emit({ type: "timeout", jobId });
      onDeadline?.();
    },
    async processBatch() {
      if (inFlight >= concurrency) return false;

      const jobsA = claimEnrichmentJobs("ENRICH_A", Math.min(concurrency - inFlight, Math.ceil(concurrency * 0.75)));
      const jobsB = claimEnrichmentJobs("ENRICH_B", Math.min(concurrency - inFlight - jobsA.length, Math.ceil(concurrency * 0.25)));
      const batch = [...jobsA, ...jobsB];
      if (!batch.length) return false;

      inFlight += batch.length;

      await Promise.all(
        batch.map(async (job) => {
          try {
            if (job.job_type === "ENRICH_A") await processEnrichA(job);
            else if (job.job_type === "ENRICH_B") await processEnrichB(job);
          } finally {
            inFlight -= 1;
          }
        }),
      );

      return true;
    },
  });

  workers.set(jobId, { loop, stop: () => { stopped = true; loop.stop(); } });
}

export function stopEnrichmentWorker(jobId) {
  const w = workers.get(jobId);
  if (w) {
    w.stop();
    workers.delete(jobId);
  }
}

function buildCandidateFromRow(row) {
  let data = {};
  try { data = JSON.parse(row.data || "{}"); } catch { /* */ }
  return {
    name: row.name || data.name,
    website: row.website || data.website,
    domain: row.domain,
    sourceTag: data.sourceTag || "overnight",
    sourceTags: data.sourceTags || ["overnight"],
    rawMetadata: data.rawMetadata || {},
    employees: data.employees,
    foundedYear: data.foundedYear,
    revenue: data.revenue,
    matchedProducts: data.matchedProducts || [],
  };
}
