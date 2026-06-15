import pLimit from "p-limit";
import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { buildSearchQueries } from "../queryTemplates.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { getCached, putCached } from "../lib/dbCache.js";

const SEARXNG_CACHE_TTL_DAYS = 3;
const SEARXNG_QUERY_CONCURRENCY = 4;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function envInt(value, fallback) {
  const n = parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

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
async function fetchSearxQueryResults(baseUrl, q) {
  try {
    const cacheKey = `searxng:${q}`;
    const cached = getCached(cacheKey, SEARXNG_CACHE_TTL_DAYS);
    let results;
    if (cached && cached.ok) {
      results = cached.payload || [];
    } else if (cached) {
      return [];
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
        return [];
      }
      const data = await res.json();
      results = data.results || [];
      putCached(cacheKey, "searxng", true, results);
    }
    return testParseSearxResults({ results }, q);
  } catch {
    return [];
  }
}

export async function searchSearxng(brief, env) {
  const baseUrl = String(env.SEARXNG_URL || "").trim().replace(/\/$/, "");
  if (!baseUrl) return [];

  const m = breadthMultiplier(brief);
  // Self-hosted SearxNG is keyless and free — lean on it.
  // Defaults scaled up from the original 20*m / 150*m. Env overrides raise the hard cap.
  const queryCap = envInt(env.SEARXNG_MAX_QUERIES, 200);
  const resultCap = envInt(env.SEARXNG_MAX_RESULTS, 2000);
  const maxQueries = Math.min(queryCap, 80 * m);
  const maxResults = Math.min(resultCap, 600 * m);

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

  const limit = pLimit(SEARXNG_QUERY_CONCURRENCY);
  const batches = await Promise.all(
    queries.map((q) => limit(() => fetchSearxQueryResults(baseUrl, q))),
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
