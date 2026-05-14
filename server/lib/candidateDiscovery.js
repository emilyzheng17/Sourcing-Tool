/**
 * Merge + filter logic shared by HTTP pipeline + CLI runners.
 */

import { fanOutSources } from "../sources/index.js";
import { normalizeDomain, mergeSourceTags, isLikelyCompanyDomain } from "./domains.js";

const MAX_MERGE_CAP = 5000;

export function primaryKey(c) {
  const d = normalizeDomain(c.website);
  if (!d) return "";
  if (
    d.includes("g2.com") ||
    d.includes("capterra.com") ||
    d.includes("getapp.com") ||
    d.includes("trustradius.com")
  ) {
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
 * @returns {Promise<{ merged: object[], timedOut: boolean }>}
 */
export async function discoverMergedCandidates(brief, env, fetchOpts, emit, options = {}) {
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

  /** Single broad pass (no explicit vertical) uses [] → queryTemplates + tradeAssocs defaults */
  const verticalContexts =
    brief.selectedVerticals?.length > 0 ? brief.selectedVerticals : [null];

  let timedOut = false;
  /** Dedupe while fanning out so multi-vertical × multi-product runs do not retain huge duplicate arrays. */
  const deduped = new Map();
  /** @type {Record<string, number>} */
  const bucketTotals = {};
  for (const vctx of verticalContexts) {
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }
    const verticalLabel = vctx == null ? "broad" : vctx;
    const selectedVerticalsForPass = vctx == null ? [] : [vctx];

    for (const product of products) {
      if (Date.now() > deadline) {
        timedOut = true;
        break;
      }
      const subBrief = {
        ...brief,
        activeProduct: product ?? brief.activeProduct ?? "B2B software",
        selectedTags: tagsForProduct(brief, product),
        selectedVerticals: selectedVerticalsForPass,
      };
      emitFn({
        type: "log",
        message: `Fan-out: [${verticalLabel}] × ${product ?? "broad"} — directories, Brave, Exa, Apollo, Crunchbase, Tavily…`,
      });
      const buckets = await fanOutSources(subBrief, env, fetchOpts);
      const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v?.length || 0]));
      for (const [k, n] of Object.entries(counts)) bucketTotals[k] = (bucketTotals[k] ?? 0) + n;
      emitFn({
        type: "log",
        message: `Sources raw [${verticalLabel}] (${product ?? "broad"}): ${JSON.stringify(counts)}`,
      });

      const mergedPart = mergeCandidates(buckets).map((c) =>
        product
          ? { ...c, matchedProducts: [...new Set([...(c.matchedProducts || []), product])] }
          : c,
      );
      for (const c of mergedPart) mergeFlatInto(deduped, c);
    }
  }

  emitFn({
    type: "log",
    message: `Sources raw aggregated (all passes, pre-dedupe): ${JSON.stringify(bucketTotals)}`,
  });

  let merged = [...deduped.values()];
  merged = merged.filter((c) => {
    const d = normalizeDomain(c.website);
    if (!d) return false;
    if (exclude.has(d)) return false;
    if (
      d.includes("g2.com") ||
      d.includes("capterra.com") ||
      d.includes("getapp.com") ||
      d.includes("trustradius.com")
    )
      return true;
    return isLikelyCompanyDomain(d);
  });

  emitFn({ type: "log", message: `Merged unique domains: ${merged.length}` });

  const limitRun = Math.min(merged.length, maxCompanies);
  merged = merged.slice(0, limitRun);

  return { merged, timedOut };
}
