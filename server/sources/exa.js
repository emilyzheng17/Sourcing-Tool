import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { getCached, putCached } from "../lib/dbCache.js";

const EXA_CACHE_TTL_DAYS = 3;
const EXA_MAX_NUM_RESULTS = 100;

async function exaFetchOnce(query, numResults, key) {
  const cacheKey = `exa:v2:${query}`;
  const cached = getCached(cacheKey, EXA_CACHE_TTL_DAYS);
  if (cached) return cached.ok ? (cached.payload || []) : [];

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    const snippet = raw.slice(0, 200).replace(/\s+/g, " ");
    console.warn(`[exa] HTTP ${res.status} query="${String(query).slice(0, 80)}" ${snippet}`);
    putCached(cacheKey, "exa", false, null);
    return [];
  }
  const data = await res.json();
  const results = data.results || [];
  putCached(cacheKey, "exa", true, results);
  return results;
}

/** Fixture helper — parse Exa search results from raw API response. */
export function testParseExaResults(data, query = "") {
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
      sourceTag: "Exa",
      rawMetadata: { exaId: r.id, exaQuery: query },
    });
  }
  return out;
}

export async function searchExa(brief, env) {
  const key = env.EXA_API_KEY;
  if (!key) return [];
  const verts = brief.selectedVerticals?.length ? brief.selectedVerticals : ["industrial B2B"];
  const verticalLead = verts[0];
  const q = `${verticalLead} ${brief.activeProduct} B2B vertical software`;
  const m = breadthMultiplier(brief);
  const numResults = Math.min(EXA_MAX_NUM_RESULTS, 40 * m);
  const extraQueries = Array.isArray(brief.recommendationExaQueries)
    ? brief.recommendationExaQueries.map(String).filter(Boolean).slice(0, 3)
    : [];

  const queries = [q, ...extraQueries];
  const seen = new Set();
  const out = [];
  try {
    for (const query of queries) {
      if (!query || seen.has(query)) continue;
      seen.add(query);
      const results = await exaFetchOnce(query, numResults, key);
      out.push(...testParseExaResults({ results }, query));
    }
    const domainSeen = new Set();
    return out.filter((x) => {
      const d = normalizeDomain(x.website);
      if (domainSeen.has(d)) return false;
      domainSeen.add(d);
      return true;
    });
  } catch (err) {
    console.warn(`[exa] search error: ${err?.message || err}`);
    return [];
  }
}
