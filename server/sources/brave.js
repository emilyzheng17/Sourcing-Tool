import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { buildSearchQueries } from "../queryTemplates.js";
import { breadthMultiplier } from "../lib/breadth.js";

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
  const all = [];
  for (const q of queries) {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": key,
        },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const results = data.web?.results || data.results || [];
      for (const r of results) {
        const u = r.url || r.link;
        if (!u) continue;
        const domain = normalizeDomain(u);
        if (!isLikelyCompanyDomain(domain)) continue;
        all.push({
          name: r.title || domain,
          website: u.split("?")[0],
          sourceTag: "Brave",
          rawMetadata: { query: q, snippet: r.description || "" },
        });
      }
    } catch {
      /* ignore */
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
