/**
 * Source Expansion Orchestrator.
 *
 * Runs adapters by tier, manages concurrency, handles resume,
 * and persists candidates into the existing pipeline via DB functions.
 */

import { randomUUID } from "crypto";
import pLimit from "p-limit";
import { normalizeBatch } from "./normalize.js";
import { computePriority, ENRICHMENT_THRESHOLD } from "./prioritizer.js";
import { ensureFrontierTable, getCursor, saveCursor } from "./frontier.js";
import {
  createBuildJob,
  updateBuildJobStatus,
  updateBuildJobStats,
  upsertDiscoveredCompany,
  insertCompanySource,
  insertEnrichmentJob,
  insertCompanyEvent,
} from "../db.js";

const stopSignals = new Map();

/**
 * @param {object} opts
 * @param {import('./adapters/base.js').BaseAdapter[]} opts.adapters
 * @param {NodeJS.ProcessEnv} opts.env
 * @param {number} [opts.maxCandidates=100000]
 * @param {number} [opts.maxRunTimeHours=12]
 * @param {number} [opts.tierConcurrency=3]
 * @param {boolean} [opts.resume=true]
 * @param {(evt: object) => void} [opts.emit]
 * @returns {Promise<string>} jobId
 */
export async function runOrchestrator(opts) {
  const {
    adapters,
    env,
    maxCandidates = 100_000,
    maxRunTimeHours = 12,
    tierConcurrency = 3,
    resume = true,
    verbose = false,
    emit = () => {},
  } = opts;

  ensureFrontierTable();

  const jobId = randomUUID();
  const deadline = Date.now() + maxRunTimeHours * 60 * 60 * 1000;

  const jobConfig = {
    type: "source-expansion",
    maxCandidates,
    maxRunTimeHours,
    adapterCount: adapters.length,
    adapterIds: adapters.map((a) => a.id),
  };

  createBuildJob(jobId, jobConfig);
  emit({ type: "expansion:started", jobId, adapterCount: adapters.length });

  const stats = {
    discovered: 0,
    skipped: 0,
    errors: 0,
    adaptersDone: 0,
    adaptersTotal: adapters.length,
    byAdapter: {},
  };

  const globalSeen = new Set();
  let stopped = false;
  stopSignals.set(jobId, () => {
    stopped = true;
  });

  const fetchCache = new Map();
  const jitterHostState = new Map();
  const fetchOpts = { cache: fetchCache, jitterHostState };

  const tiers = groupByTier(adapters);
  try {
    for (const tier of [1, 2, 3]) {
    const tierAdapters = tiers.get(tier);
    if (!tierAdapters?.length) continue;
    if (stopped || Date.now() > deadline || stats.discovered >= maxCandidates) break;

    emit({ type: "expansion:tier_start", tier, adapterCount: tierAdapters.length });

    const limit = pLimit(Math.min(tierConcurrency, tierAdapters.length));

    await Promise.all(
      tierAdapters.map((adapter) =>
        limit(async () => {
          if (stopped || Date.now() > deadline || stats.discovered >= maxCandidates) return;

          const adapterStats = { discovered: 0, skipped: 0, errors: 0 };
          stats.byAdapter[adapter.id] = adapterStats;

          const frontier = {
            getCursor: (key) => getCursor(adapter.id, key),
            saveCursor: (key, update) => saveCursor(adapter.id, key, update),
          };

          try {
            emit({ type: "expansion:adapter_start", adapterId: adapter.id, tier });

            const gen = adapter.crawl(frontier, {
              fetchOpts,
              env,
              maxItems: maxCandidates - stats.discovered,
              deadline,
            });

            for await (const batch of gen) {
              if (stopped || Date.now() > deadline || stats.discovered >= maxCandidates) break;

              const rawCount = (batch.companies || []).length;
              const normalized = normalizeBatch(batch.companies || [], adapter.meta, { verbose: verbose || process.env.EXPANSION_VERBOSE === "1" });

              if (verbose || process.env.EXPANSION_VERBOSE === "1") {
                const rejected = rawCount - normalized.length;
                console.error(`[${adapter.id}] batch: ${rawCount} raw → ${normalized.length} after normalize (${rejected} rejected)`);
              }

              for (const candidate of normalized) {
                if (stopped || Date.now() > deadline || stats.discovered >= maxCandidates) break;
                if (globalSeen.has(candidate.domain)) {
                  adapterStats.skipped++;
                  stats.skipped++;
                  continue;
                }
                globalSeen.add(candidate.domain);

                try {
                  const { priorityScore, reasons } = computePriority(candidate);

                  const companyId = upsertDiscoveredCompany({
                    domain: candidate.domain,
                    name: candidate.name,
                    website: candidate.website,
                    batchId: jobId,
                    priorityScore,
                    pool: "prospect",
                  });

                  for (const tag of candidate.sourceTags) {
                    insertCompanySource({
                      companyId,
                      sourceTag: tag,
                      sourceUrl: candidate.website,
                      rawMetadata: candidate.rawMetadata,
                      batchId: jobId,
                    });
                  }

                  insertCompanyEvent(companyId, "DISCOVERED", {
                    batchId: jobId,
                    source: "expansion",
                    adapterId: adapter.id,
                    sourceTier: adapter.tier,
                    priorityScore,
                    reasons,
                  });

                  if (priorityScore >= ENRICHMENT_THRESHOLD) {
                    insertEnrichmentJob({
                      companyId,
                      jobType: "ENRICH_A",
                      priority: priorityScore,
                      thesisVersion: "v1",
                    });
                  }

                  stats.discovered++;
                  adapterStats.discovered++;
                } catch (e) {
                  stats.errors++;
                  adapterStats.errors++;
                }
              }

              if (batch.cursor != null) {
                frontier.saveCursor("main", {
                  cursorValue: batch.cursor,
                  itemsDiscovered: adapterStats.discovered,
                  status: batch.done ? "DONE" : "RUNNING",
                });
              }

              if (stats.discovered % 50 === 0 || batch.done) {
                updateBuildJobStats(jobId, stats);
                emit({
                  type: "expansion:progress",
                  ...stats,
                  adapterId: adapter.id,
                });
              }
            }

            saveCursor(adapter.id, "main", {
              status: "DONE",
              itemsDiscovered: adapterStats.discovered,
            });

            stats.adaptersDone++;
            emit({
              type: "expansion:adapter_done",
              adapterId: adapter.id,
              ...adapterStats,
            });
          } catch (e) {
            stats.errors++;
            adapterStats.errors++;
            saveCursor(adapter.id, "main", {
              status: "FAILED",
              metadata: { error: e.message },
            });
            emit({
              type: "expansion:adapter_error",
              adapterId: adapter.id,
              error: e.message,
            });
          }
        }),
      ),
    );

    emit({ type: "expansion:tier_done", tier });
  }

    updateBuildJobStats(jobId, stats);
    if (stopped) {
      updateBuildJobStatus(jobId, "STOPPED");
      emit({ type: "expansion:stopped", jobId, ...stats });
    } else {
      updateBuildJobStatus(jobId, "DONE");
      emit({ type: "expansion:done", jobId, ...stats });
    }

    return jobId;
  } finally {
    stopSignals.delete(jobId);
  }
}

export function stopOrchestrator(jobId) {
  const stop = stopSignals.get(jobId);
  if (!stop) return false;
  stop();
  return true;
}

/** @param {import('./adapters/base.js').BaseAdapter[]} adapters */
function groupByTier(adapters) {
  const map = new Map();
  for (const a of adapters) {
    const tier = a.tier || 3;
    if (!map.has(tier)) map.set(tier, []);
    map.get(tier).push(a);
  }
  return map;
}
