import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { buildSearchQueries } from "../queryTemplates.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { getCached, putCached } from "../lib/dbCache.js";

const SEARXNG_CACHE_TTL_DAYS = 3;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * SearxNG metasearch — keyless when self-hosted.
 * Requires JSON format enabled: search.formats: [html, json]
 * @see https://docs.searxng.org/
 *
 * Response shape: { results: [{ url, title, content }] }
 *
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 */
export async function searchSearxng(brief, env) {
  const baseUrl = String(env.SEARXNG_URL || "").trim().replace(/\/$/, "");
  if (!baseUrl) return [];

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

  const all = [];

  for (const q of queries) {
    try {
      const cacheKey = `searxng:${q}`;
      let results;

      const cached = getCached(cacheKey, SEARXNG_CACHE_TTL_DAYS);
      if (cached && cached.ok) {
        results = cached.payload || [];
      } else if (cached) {
        continue;
      } else {
        const params = new URLSearchParams({
          q,
          format: "json",
          categories: "general",
          language: "en",
        });
        const res = await fetch(`${baseUrl}/search?${params}`, {
          headers: { Accept: "application/json", "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(20000),
        });

        if (!res.ok) {
          putCached(cacheKey, "searxng", false, null);
          continue;
        }

        const data = await res.json();
        results = data.results || [];
        putCached(cacheKey, "searxng", true, results);
      }

      all.push(...testParseSearxResults({ results }, q));
    } catch {
      /* ignore per-query failures */
    }
  }

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

/** Fixture helper — parse SearxNG results from raw API response. */
export function testParseSearxResults(data, query = "") {
  const results = data.results || [];
  const out = [];
  for (const r of results) {
    const u = r.url;
    if (!u) continue;
    const domain = normalizeDomain(u);
    if (!isLikelyCompanyDomain(domain)) continue;
    out.push({
      name: r.title || domain,
      website: u.split("?")[0],
      sourceTag: "SearxNG",
      rawMetadata: { query, snippet: r.content || "" },
    });
  }
  return out;
}
