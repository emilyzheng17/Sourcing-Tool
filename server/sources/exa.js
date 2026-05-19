import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { getCached, putCached } from "../lib/dbCache.js";

const EXA_CACHE_TTL_DAYS = 3;

async function exaFetchOnce(query, numResults, key) {
  const cacheKey = `exa:${query}`;
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
      type: "neural",
      numResults,
      contents: { text: false },
    }),
  });
  if (!res.ok) {
    putCached(cacheKey, "exa", false, null);
    return [];
  }
  const data = await res.json();
  const results = data.results || [];
  putCached(cacheKey, "exa", true, results);
  return results;
}

export async function searchExa(brief, env) {
  const key = env.EXA_API_KEY;
  if (!key) return [];
  const verts = brief.selectedVerticals?.length ? brief.selectedVerticals : ["industrial B2B"];
  const verticalLead = verts[0];
  const q = `${verticalLead} ${brief.activeProduct} B2B vertical software`;
  const m = breadthMultiplier(brief);
  const numResults = Math.min(150, 40 * m);
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
    }
    const domainSeen = new Set();
    return out.filter((x) => {
      const d = normalizeDomain(x.website);
      if (domainSeen.has(d)) return false;
      domainSeen.add(d);
      return true;
    });
  } catch {
    return [];
  }
}
