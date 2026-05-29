/**
 * Merge + filter logic shared by HTTP pipeline + CLI runners.
 */

import { fanOutSourcesIncremental } from "../sources/index.js";
import {
  normalizeDomain,
  mergeSourceTags,
  isLikelyCompanyDomain,
  isDirectoryListingHost,
} from "./domains.js";
import { createApiCallBudgets } from "./apiCallBudget.js";
import { generateDiscoveryQueries } from "./llmQueryGen.js";

const MAX_MERGE_CAP = 5000;

export function primaryKey(c) {
  const d = normalizeDomain(c.website);
  if (!d) return "";
  if (isDirectoryListingHost(d)) {
    const slug = (c.name || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
    return `listing:${slug}`;
  }
  return d;
}

export function mergeCandidates(buckets) {
  const map = new Map();
  for (const arr of Object.values(buckets)) {
    for (const c of arr || []) {
      if (!c?.website) continue;
      const key = primaryKey(c);
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...c, sourceTags: [c.sourceTag].filter(Boolean) });
      } else {
        existing.sourceTags = mergeSourceTags(existing.sourceTags, [c.sourceTag].filter(Boolean));
        if (!existing.name && c.name) existing.name = c.name;
        existing.rawMetadata = { ...existing.rawMetadata, ...c.rawMetadata };
      }
    }
  }
  return [...map.values()];
}

/** @param {Map<string, object>} map */
export function mergeFlatInto(map, c) {
  if (!c?.website) return;
  const key = primaryKey(c);
  if (!key) return;
  const incomingTags = Array.isArray(c.sourceTags) ? c.sourceTags : [c.sourceTag].filter(Boolean);
  const incomingMp = Array.isArray(c.matchedProducts) ? c.matchedProducts : [];
  const existing = map.get(key);
  if (!existing) {
    map.set(key, {
      ...c,
      sourceTags: [...incomingTags],
      matchedProducts: [...new Set(incomingMp)],
    });
  } else {
    existing.sourceTags = mergeSourceTags(existing.sourceTags, incomingTags);
    existing.matchedProducts = [...new Set([...(existing.matchedProducts || []), ...incomingMp])];
    if (!existing.name && c.name) existing.name = c.name;
    existing.rawMetadata = { ...existing.rawMetadata, ...c.rawMetadata };
  }
}

export function mergeFlatCandidates(list) {
  const map = new Map();
  for (const c of list) mergeFlatInto(map, c);
  return [...map.values()];
}

/**
 * Post-merge eligibility (same rules as historical discoverMergedCandidates filter + slice cap).
 * @param {object} c
 * @param {Set<string>} exclude
 */
export function passesPostMergeFilters(c, exclude) {
  const d = normalizeDomain(c.website);
  if (!d) return false;
  if (exclude.has(d)) return false;
  if (isDirectoryListingHost(d)) return true;
  return isLikelyCompanyDomain(d);
}

function tagsForProduct(brief, product) {
  if (product == null) {
    if (Array.isArray(brief.selectedTags)) return brief.selectedTags;
    return [];
  }
  const by = brief.selectedTagsByProduct;
  if (by && typeof by === "object" && by[product]) {
    return Object.values(by[product])
      .flat()
      .filter(Boolean);
  }
  if (brief.activeProduct === product && Array.isArray(brief.selectedTags) && brief.selectedTags.length) {
    return brief.selectedTags;
  }
  if (Array.isArray(brief.selectedTags)) return brief.selectedTags;
  return [];
}

/**
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 * @param {(e: object) => void} [emit]
 * @param {{ deadline?: number, exclude?: Set<string> }} [options]
 * @param {(key: string, getLatest: () => object | undefined) => void} [onEligibleCandidate]
 * @returns {Promise<{ merged: object[], timedOut: boolean, deduped: Map<string, object> }>}
 */
export async function discoverMergedCandidatesStreaming(
  brief,
  env,
  fetchOpts,
  emit,
  options,
  onEligibleCandidate = null,
) {
  const emitFn = typeof emit === "function" ? emit : () => {};
  const exclude = options.exclude ?? new Set((brief.excludeDomains || []).map((x) => normalizeDomain(x)).filter(Boolean));
  const deadline = options.deadline ?? Number.POSITIVE_INFINITY;

  const maxCompanies = Math.min(MAX_MERGE_CAP, Math.max(50, parseInt(String(brief.maxCompanies ?? 1000), 10) || 1000));

  const products =
    brief.selectedProducts?.length > 0
      ? brief.selectedProducts
      : brief.activeProduct
        ? [brief.activeProduct]
        : [null];

  const verticalContexts = brief.selectedVerticals?.length > 0 ? brief.selectedVerticals : [null];

  let timedOut = false;
  let capReached = false;
  const deduped = new Map();
  /** @type {Record<string, number>} */
  const bucketTotals = {};
  const queuedKeys = new Set();
  const directoryRanForProduct = new Set();

  const llmQueries = await generateDiscoveryQueries(brief, env, emitFn);
  let discoveryBrief = brief;
  if (llmQueries) {
    discoveryBrief = {
      ...brief,
      additionalSearchQueries: [
        ...new Set([
          ...(brief.additionalSearchQueries || []),
          ...llmQueries.searchQueries,
        ]),
      ],
      recommendationExaQueries: [
        ...new Set([
          ...(brief.recommendationExaQueries || []),
          ...llmQueries.exaQueries,
        ]),
      ],
    };
  }

  const apiBudgets = createApiCallBudgets(discoveryBrief);
  const discoveryFetchOpts = {
    ...(fetchOpts || {}),
    apiBudgets,
  };

  function tryEnqueueForKey(key) {
    if (!onEligibleCandidate) return;
    if (!key || queuedKeys.has(key)) return;
    if (queuedKeys.size >= maxCompanies) return;
    const latest = deduped.get(key);
    if (!latest || !passesPostMergeFilters(latest, exclude)) return;
    queuedKeys.add(key);
    onEligibleCandidate(key, () => deduped.get(key));
  }

  function ingestCandidates(list, product) {
    for (const c of list || []) {
      const cc = product
        ? { ...c, matchedProducts: [...new Set([...(c.matchedProducts || []), product])] }
        : c;
      mergeFlatInto(deduped, cc);
      const k = primaryKey(cc);
      tryEnqueueForKey(k);
    }
  }

  for (const vctx of verticalContexts) {
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }
    if (queuedKeys.size >= maxCompanies) {
      capReached = true;
      break;
    }
    const verticalLabel = vctx == null ? "broad" : vctx;
    const selectedVerticalsForPass = vctx == null ? [] : [vctx];

    for (const product of products) {
      if (Date.now() > deadline) {
        timedOut = true;
        break;
      }
      if (queuedKeys.size >= maxCompanies) {
        capReached = true;
        break;
      }

      const activeProduct = product ?? discoveryBrief.activeProduct ?? "B2B software";
      const productKey = String(activeProduct);
      const skipDirectorySources = directoryRanForProduct.has(productKey);

      const subBrief = {
        ...discoveryBrief,
        activeProduct,
        selectedTags: tagsForProduct(discoveryBrief, product),
        selectedVerticals: selectedVerticalsForPass,
      };
      emitFn({
        type: "log",
        message: skipDirectorySources
          ? `Fan-out: [${verticalLabel}] × ${product ?? "broad"} — paid search + PE (directories skipped, already ran for product)`
          : `Fan-out: [${verticalLabel}] × ${product ?? "broad"} — directories, Brave, Exa, Apollo, Crunchbase, Tavily…`,
      });

      /** @type {Record<string, number>} */
      const passBucketTotals = {};
      await fanOutSourcesIncremental(
        subBrief,
        env,
        { ...discoveryFetchOpts, skipDirectorySources },
        (sourceKey, arr) => {
        const n = arr?.length || 0;
        passBucketTotals[sourceKey] = n;
        bucketTotals[sourceKey] = (bucketTotals[sourceKey] ?? 0) + n;
        ingestCandidates(arr, product);
        emitFn({
          type: "log",
          message: `Source ready [${verticalLabel}] (${product ?? "broad"}) ${sourceKey}: ${n}`,
        });
      },
      );
      emitFn({
        type: "log",
        message: `Sources raw [${verticalLabel}] (${product ?? "broad"}): ${JSON.stringify(passBucketTotals)}`,
      });

      if (!skipDirectorySources) {
        directoryRanForProduct.add(productKey);
      }
    }
  }

  if (capReached) {
    emitFn({
      type: "log",
      message: `Discovery stopped early: ${queuedKeys.size} candidates queued (cap ${maxCompanies})`,
    });
  }

  emitFn({
    type: "log",
    message: `Sources raw aggregated (all passes, pre-dedupe): ${JSON.stringify(bucketTotals)}`,
  });
  emitFn({
    type: "log",
    message: `API budget remaining — Apollo: ${apiBudgets.apollo.remaining}, Crunchbase: ${apiBudgets.crunchbase.remaining}`,
  });

  let merged = [...deduped.values()].filter((c) => passesPostMergeFilters(c, exclude));

  emitFn({ type: "log", message: `Merged unique domains: ${merged.length}` });

  const limitRun = Math.min(merged.length, maxCompanies);
  merged = merged.slice(0, limitRun);

  return { merged, timedOut, deduped };
}

/**
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 * @param {(e: object) => void} [emit]
 * @param {{ deadline?: number, exclude?: Set<string> }} [options]
 * @returns {Promise<{ merged: object[], timedOut: boolean }>}
 */
export async function discoverMergedCandidates(brief, env, fetchOpts, emit, options = {}) {
  const { merged, timedOut } = await discoverMergedCandidatesStreaming(brief, env, fetchOpts, emit, options, null);
  return { merged, timedOut };
}
