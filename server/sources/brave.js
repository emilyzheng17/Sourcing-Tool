import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { buildSearchQueries } from "../queryTemplates.js";

export async function searchBrave(brief, env) {
  const key = env.BRAVE_API_KEY;
  if (!key) return [];
  const queries = buildSearchQueries(brief).slice(0, 20);
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
  return dedupeDomain(all).slice(0, 120);
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
