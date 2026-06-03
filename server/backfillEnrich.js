/**
 * Backfill enrichment for existing DB rows with no thesis score.
 * Re-runs Stage A/B + rule-based scoring; soft-rejects hard failures.
 */

import PQueue from "p-queue";
import { enrichCandidateStageA, enrichCandidateStageB } from "./enrich.js";
import { scoreThesis, applyManualOverrides } from "./score.js";
import {
  countBackfillCandidates,
  listBackfillCandidateIds,
  getCompanyById,
  updateCompanyById,
  setRejected,
  rowToCompany,
} from "./db.js";
import { normalizeDomain } from "./lib/domains.js";
import { resetFetchCacheAccounting } from "./lib/fetchText.js";

const PERMISSIVE_BRIEF = {
  selectedVerticals: [],
  selectedProducts: [],
  selectedTags: [],
  activeProduct: null,
};

const TASK_TIMEOUT_MS = 120_000;
const activeJobs = new Map();

function withTaskTimeout(fn, ms = TASK_TIMEOUT_MS) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("task timeout")), ms);
    }),
  ]);
}

function safeEmit(emit, evt) {
  try {
    emit(evt);
  } catch {
    /* never crash the job on SSE subscriber errors */
  }
}

function coerceWebsite(row, data) {
  const raw = row.website ?? data.website ?? null;
  if (raw != null && typeof raw === "string" && raw.trim()) {
    const trimmed = raw.trim();
    return trimmed.startsWith("http") ? trimmed : `https://${trimmed.replace(/^\/\//, "")}`;
  }
  if (row.domain) return `https://${row.domain}`;
  return null;
}

function buildCandidateFromRow(row) {
  let data = {};
  try {
    data = JSON.parse(row.data || "{}");
  } catch {
    /* ignore */
  }
  const website = coerceWebsite(row, data);
  return {
    name: row.name || data.name || row.domain || "Unknown",
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

function buildPersistPayload(scored, row) {
  const canonicalDomain = row.domain || scored.domain;
  return {
    ...scored,
    domain: canonicalDomain,
    sources: [
      ...(scored.openCorporates?.ocUrl ? [scored.openCorporates.ocUrl] : []),
      scored.website,
    ].filter(Boolean),
  };
}

/**
 * @param {object} row
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {object} fetchOpts
 */
export async function processBackfillRow(row, brief, env, fetchOpts) {
  if (!row?.id) {
    throw new Error("Invalid company row");
  }

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

  const payload = buildPersistPayload(scored, row);
  const upsertDomain = row.domain || normalizeDomain(payload.website || "");
  if (!upsertDomain) {
    setRejected(row.id, true);
    return { outcome: "removed", reason: "no domain after enrich" };
  }
  payload.domain = upsertDomain;

  const savedRow = updateCompanyById(row.id, {
    name: scored.name,
    website: scored.website,
    data: payload,
  });
  if (!savedRow) {
    setRejected(row.id, true);
    return { outcome: "removed", reason: "row missing on save" };
  }

  return {
    outcome: "enriched",
    company: rowToCompany(savedRow),
    score: thesisPts,
    domain: upsertDomain,
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

  const ids = listBackfillCandidateIds();
  const total = ids.length;

  const stats = {
    total,
    scanned: 0,
    enriched: 0,
    removed: 0,
    failed: 0,
  };

  const jobState = { stopped: false };
  activeJobs.set(jobId, jobState);

  safeEmit(emit, { type: "backfill:started", jobId, ...stats });

  if (total === 0) {
    safeEmit(emit, { type: "backfill:done", jobId, ...stats, stopped: false });
    activeJobs.delete(jobId);
    return stats;
  }

  const fetchCache = new Map();
  const jitterHostState = new Map();
  const fetchOpts = { cache: fetchCache, jitterHostState };
  const queue = new PQueue({ concurrency });

  try {
    for (const id of ids) {
      if (jobState.stopped) break;

      await queue.add(async () => {
        if (jobState.stopped) return;

        const row = getCompanyById(id);
        if (!row) return;

        const label = row.name || row.domain || String(row.id);
        try {
          const result = await withTaskTimeout(() =>
            processBackfillRow(row, brief, env, fetchOpts),
          );
          stats.scanned += 1;
          if (result.outcome === "enriched") {
            stats.enriched += 1;
            safeEmit(emit, {
              type: "backfill:log",
              message: `Enriched (${result.score}): ${label}`,
            });
            safeEmit(emit, {
              type: "backfill:company",
              id: row.id,
              domain: result.domain,
              name: result.name,
              score: result.score,
            });
          } else {
            stats.removed += 1;
            safeEmit(emit, {
              type: "backfill:log",
              message: `Removed (${result.reason}): ${label}`,
            });
          }
        } catch (e) {
          stats.scanned += 1;
          stats.failed += 1;
          safeEmit(emit, {
            type: "backfill:log",
            message: `Failed: ${label} — ${e.message || String(e)}`,
          });
        }

        safeEmit(emit, {
          type: "backfill:progress",
          jobId,
          ...stats,
          processed: stats.scanned,
        });
      });
    }

    await queue.onIdle();
  } finally {
    fetchCache.clear();
    resetFetchCacheAccounting(fetchCache);
    activeJobs.delete(jobId);
  }

  safeEmit(emit, {
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
