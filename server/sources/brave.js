import pLimit from "p-limit";
import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { buildSearchQueries } from "../queryTemplates.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { getCached, putCached } from "../lib/dbCache.js";

const BRAVE_CACHE_TTL_DAYS = 3;
const BRAVE_QUERY_CONCURRENCY = 4;

async function fetchBraveQueryResults(q, key) {
  try {
    const cacheKey = `brave:${q}`;
    let results;
    const cached = getCached(cacheKey, BRAVE_CACHE_TTL_DAYS);
    if (cached && cached.ok) {
      results = cached.payload || [];
    } else if (cached) {
      return [];
    } else {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": key,
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        putCached(cacheKey, "brave", false, null);
        return [];
      }
      const data = await res.json();
      results = data.web?.results || data.results || [];
      putCached(cacheKey, "brave", true, results);
    }
    const out = [];
    for (const r of results) {
      const u = r.url || r.link;
      if (!u) continue;
      const domain = normalizeDomain(u);
      if (!isLikelyCompanyDomain(domain)) continue;
      out.push({
        name: r.title || domain,
        website: u.split("?")[0],
        sourceTag: "Brave",
        rawMetadata: { query: q, snippet: r.description || "" },
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function searchBrave(brief, env) {
  const key = env.BRAVE_API_KEY;
  if (!key) return [];
  const m = breadthMultiplier(brief);
  const maxQueries = Math.min(56, 28 * m);
  const maxResults = Math.min(500, 180 * m);
  const baseQueries = buildSearchQueries(brief);
  const extras = Array.isArray(brief.additionalSearchQueries)
    ? brief.additionalSearchQueries.map(String).filter(Boolean)
    : [];
  const seenQ = new Set();
  const queries = [...baseQueries, ...extras].filter((q) => {
    const k = q.toLowerCase();
    if (seenQ.has(k)) return false;
    seenQ.add(k);
    return true;
  }).slice(0, maxQueries);

  const queryLimit = pLimit(BRAVE_QUERY_CONCURRENCY);
  const batches = await Promise.all(
    queries.map((q) => queryLimit(() => fetchBraveQueryResults(q, key))),
  );
  const all = batches.flat();
  return dedupeDomain(all).slice(0, maxResults);
}

function dedupeDomain(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    const d = normalizeDomain(x.website);
    if (seen.has(d)) return false;
    seen.add(d);
    return true;
  });
}
