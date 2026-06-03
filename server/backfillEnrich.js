/**
 * Backfill enrichment for existing DB rows with no thesis score.
 * Re-runs Stage A/B + rule-based scoring; soft-rejects hard failures.
 */

import PQueue from "p-queue";
import { enrichCandidateStageA, enrichCandidateStageB } from "./enrich.js";
import { scoreThesis, applyManualOverrides } from "./score.js";
import {
  countBackfillCandidates,
  iterateBackfillCandidates,
  upsertCompany,
  setRejected,
  rowToCompany,
} from "./db.js";
import { resetFetchCacheAccounting } from "./lib/fetchText.js";

const PERMISSIVE_BRIEF = {
  selectedVerticals: [],
  selectedProducts: [],
  selectedTags: [],
  activeProduct: null,
};

const activeJobs = new Map();

function buildCandidateFromRow(row) {
  let data = {};
  try {
    data = JSON.parse(row.data || "{}");
  } catch {
    /* ignore */
  }
  const website =
    row.website ||
    data.website ||
    (row.domain ? `https://${row.domain}` : null);
  return {
    name: row.name || data.name || row.domain,
    website,
    domain: row.domain,
    sourceTag: data.sourceTag || "backfill",
    sourceTags: data.sourceTags || ["backfill"],
    rawMetadata: data.rawMetadata || {},
    employees: data.employees,
    foundedYear: data.foundedYear,
    revenue: data.revenue,
    matchedProducts: data.matchedProducts || [],
  };
}

/**
 * @param {object} row
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {object} fetchOpts
 */
export async function processBackfillRow(row, brief, env, fetchOpts) {
  const candidate = buildCandidateFromRow(row);
  if (!candidate.website && !candidate.domain) {
    setRejected(row.id, true);
    return { outcome: "removed", reason: "no website or domain" };
  }

  const stageA = await enrichCandidateStageA(candidate, brief, env, fetchOpts);
  if (!stageA) {
    setRejected(row.id, true);
    return { outcome: "removed", reason: "stage A reject" };
  }

  const enriched = await enrichCandidateStageB(candidate, stageA, brief, env, fetchOpts);
  if (!enriched) {
    setRejected(row.id, true);
    return { outcome: "removed", reason: "stage B reject" };
  }

  let scored = {
    ...enriched,
    sourceTags: enriched.sourceTags || candidate.sourceTags || ["backfill"],
  };
  const ruleScore = scoreThesis(scored, brief);
  let thesisPts = ruleScore.thesisScore;
  thesisPts = Math.max(0, Math.min(100, Math.round(thesisPts)));
  scored = { ...scored, ...ruleScore, score: thesisPts };

  scored = applyManualOverrides(scored, {
    manual_mission_critical: row.manual_mission_critical,
    manual_vertically_integrated: row.manual_vertically_integrated,
    manual_proprietary: row.manual_proprietary,
  });

  const payload = {
    ...scored,
    sources: [
      ...(scored.openCorporates?.ocUrl ? [scored.openCorporates.ocUrl] : []),
      scored.website,
    ].filter(Boolean),
  };

  const savedRow = upsertCompany({
    domain: scored.domain,
    name: scored.name,
    website: scored.website,
    data: payload,
    isSaved: !!row.is_saved,
  });

  return {
    outcome: "enriched",
    company: rowToCompany(savedRow),
    score: thesisPts,
    domain: scored.domain,
    name: scored.name,
  };
}

/**
 * @param {string} jobId
 * @param {object} [config]
 * @param {NodeJS.ProcessEnv} env
 * @param {(evt: object) => void} emit
 */
export async function runBackfillEnrich(jobId, config, env, emit) {
  const concurrency = Math.min(12, Math.max(1, parseInt(String(config?.concurrency ?? 6), 10) || 6));
  const brief = {
    ...PERMISSIVE_BRIEF,
    selectedVerticals: config?.selectedVerticals || [],
    selectedProducts: config?.selectedProducts || [],
    activeProduct: config?.selectedProducts?.[0] || null,
  };

  const rows = [...iterateBackfillCandidates()];
  const total = rows.length;

  const stats = {
    total,
    scanned: 0,
    enriched: 0,
    removed: 0,
    failed: 0,
  };

  const jobState = { stopped: false };
  activeJobs.set(jobId, jobState);

  emit({ type: "backfill:started", jobId, ...stats });

  if (total === 0) {
    emit({ type: "backfill:done", jobId, ...stats, stopped: false });
    activeJobs.delete(jobId);
    return stats;
  }

  const fetchCache = new Map();
  const jitterHostState = new Map();
  const fetchOpts = { cache: fetchCache, jitterHostState };
  const queue = new PQueue({ concurrency });

  try {
    await Promise.all(
      rows.map((row) =>
        queue.add(async () => {
          if (jobState.stopped) return;

          const label = row.name || row.domain || String(row.id);
          try {
            const result = await processBackfillRow(row, brief, env, fetchOpts);
            stats.scanned += 1;
            if (result.outcome === "enriched") {
              stats.enriched += 1;
              emit({
                type: "backfill:log",
                message: `Enriched (${result.score}): ${label}`,
              });
              emit({
                type: "backfill:company",
                company: result.company,
              });
            } else {
              stats.removed += 1;
              emit({
                type: "backfill:log",
                message: `Removed (${result.reason}): ${label}`,
              });
            }
          } catch (e) {
            stats.scanned += 1;
            stats.failed += 1;
            emit({
              type: "backfill:log",
              message: `Failed: ${label} — ${e.message}`,
            });
          }

          emit({
            type: "backfill:progress",
            jobId,
            ...stats,
            processed: stats.scanned,
          });
        }),
      ),
    );
  } finally {
    fetchCache.clear();
    resetFetchCacheAccounting(fetchCache);
    activeJobs.delete(jobId);
  }

  emit({
    type: "backfill:done",
    jobId,
    ...stats,
    stopped: !!jobState.stopped,
  });

  return stats;
}

export function getBackfillPreviewCount() {
  return countBackfillCandidates();
}

export function stopBackfillJob(jobId) {
  const job = activeJobs.get(jobId);
  if (job) job.stopped = true;
  return !!job;
}
