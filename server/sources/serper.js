import pLimit from "p-limit";
import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { buildSearchQueries } from "../queryTemplates.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { getCached, putCached } from "../lib/dbCache.js";

const SERPER_CACHE_TTL_DAYS = 3;
const SERPER_QUERY_CONCURRENCY = 4;

/**
 * Serper.dev Google Search API — drop-in companion to the Brave adapter.
 * API docs: https://serper.dev/
 * Free tier: 2,500 queries/month. Paid: $50 / 50K queries.
 *
 * Response shape: { organic: [{ link, title, snippet }] }
 *
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 */
async function fetchSerperQueryResults(q, key) {
  try {
    const cacheKey = `serper:${q}`;
    let results;

    const cached = getCached(cacheKey, SERPER_CACHE_TTL_DAYS);
    if (cached && cached.ok) {
      results = cached.payload || [];
    } else if (cached) {
      return [];
    } else {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": key,
        },
        body: JSON.stringify({ q, num: 10 }),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        putCached(cacheKey, "serper", false, null);
        return [];
      }

      const data = await res.json();
      results = data.organic || [];
      putCached(cacheKey, "serper", true, results);
    }

    const out = [];
    for (const r of results) {
      const u = r.link;
      if (!u) continue;
      const domain = normalizeDomain(u);
      if (!isLikelyCompanyDomain(domain)) continue;
      out.push({
        name: r.title || domain,
        website: u.split("?")[0],
        sourceTag: "Serper",
        rawMetadata: { query: q, snippet: r.snippet || "" },
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function searchSerper(brief, env) {
  const key = env.SERPER_API_KEY;
  if (!key) return [];

  const m = breadthMultiplier(brief);
  const maxQueries = Math.min(40, 20 * m);
  const maxResults = Math.min(400, 150 * m);

  const baseQueries = buildSearchQueries(brief);
  const extras = Array.isArray(brief.additionalSearchQueries)
    ? brief.additionalSearchQueries.map(String).filter(Boolean)
    : [];

  const seenQ = new Set();
  const queries = [...baseQueries, ...extras]
    .filter((q) => {
      const k = q.toLowerCase();
      if (seenQ.has(k)) return false;
      seenQ.add(k);
      return true;
    })
    .slice(0, maxQueries);

  const queryLimit = pLimit(SERPER_QUERY_CONCURRENCY);
  const batches = await Promise.all(
    queries.map((q) => queryLimit(() => fetchSerperQueryResults(q, key))),
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

/** Fixture helper — parse Serper organic results from raw API response. */
export function testParseSerperResults(data) {
  const results = data.organic || [];
  const out = [];
  for (const r of results) {
    const u = r.link;
    if (!u) continue;
    const domain = normalizeDomain(u);
    if (!isLikelyCompanyDomain(domain)) continue;
    out.push({
      name: r.title || domain,
      website: u.split("?")[0],
      sourceTag: "Serper",
      rawMetadata: { snippet: r.snippet || "" },
    });
  }
  return out;
}
