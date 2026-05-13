/**
 * Merge + filter logic shared by HTTP pipeline + CLI runners.
 */

import { fanOutSources } from "../sources/index.js";
import { normalizeDomain, mergeSourceTags, isLikelyCompanyDomain } from "./domains.js";

const DEFAULT_PRODUCT = "ERP & Operations";
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

export function mergeFlatCandidates(list) {
  const map = new Map();
  for (const c of list) {
    if (!c?.website) continue;
    const key = primaryKey(c);
    if (!key) continue;
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
  return [...map.values()];
}

function tagsForProduct(brief, product) {
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

  const maxCompanies = Math.min(MAX_MERGE_CAP, Math.max(50, parseInt(String(brief.maxCompanies ?? 500), 10) || 500));

  const products =
    brief.selectedProducts?.length > 0
      ? brief.selectedProducts
      : brief.activeProduct
        ? [brief.activeProduct]
        : [DEFAULT_PRODUCT];

  /** Single broad pass (no explicit vertical) uses [] → queryTemplates + tradeAssocs defaults */
  const verticalContexts =
    brief.selectedVerticals?.length > 0 ? brief.selectedVerticals : [null];

  let timedOut = false;
  const flatTagged = [];
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
        activeProduct: product,
        selectedTags: tagsForProduct(brief, product),
        selectedVerticals: selectedVerticalsForPass,
      };
      emitFn({
        type: "log",
        message: `Fan-out: [${verticalLabel}] × ${product} — directories, Brave, Exa, Apollo, Crunchbase, Tavily…`,
      });
      const buckets = await fanOutSources(subBrief, env, fetchOpts);
      const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v?.length || 0]));
      for (const [k, n] of Object.entries(counts)) bucketTotals[k] = (bucketTotals[k] ?? 0) + n;
      emitFn({ type: "log", message: `Sources raw [${verticalLabel}] (${product}): ${JSON.stringify(counts)}` });

      const mergedPart = mergeCandidates(buckets).map((c) => ({
        ...c,
        matchedProducts: [...new Set([...(c.matchedProducts || []), product])],
      }));
      flatTagged.push(...mergedPart);
    }
  }

  emitFn({
    type: "log",
    message: `Sources raw aggregated (all passes, pre-dedupe): ${JSON.stringify(bucketTotals)}`,
  });

  let merged = mergeFlatCandidates(flatTagged);
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
