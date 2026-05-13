import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { breadthMultiplier } from "../lib/breadth.js";

/**
 * Tavily search API — optional second search surface (domains only).
 * @see https://docs.tavily.com/
 */
export async function searchTavily(brief, env) {
  const key = env.TAVILY_API_KEY;
  if (!key) return [];

  const verts = brief.selectedVerticals?.length ? brief.selectedVerticals : ["industrial B2B"];
  const v = verts[0];
  const product = brief.activeProduct || "B2B software";
  const m = breadthMultiplier(brief);
  const maxResults = Math.min(25, 8 + 5 * m);
  const maxQueries = Math.min(6, 2 + 2 * m);

  const tags = (Array.isArray(brief.selectedTags) ? brief.selectedTags : []).slice(0, 4);
  const queries = [
    `${v} ${product} software company official website`,
    `${product} industrial vertical SaaS vendor`,
    ...tags.map((t) => `${v} ${product} ${t} software`),
  ].slice(0, maxQueries);

  const seen = new Set();
  const out = [];

  for (const query of queries) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: key,
          query,
          search_depth: "basic",
          max_results: maxResults,
          include_answer: false,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const results = data.results || [];
      for (const r of results) {
        const u = r.url;
        if (!u) continue;
        const domain = normalizeDomain(u);
        if (!isLikelyCompanyDomain(domain)) continue;
        const k = domain.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({
          name: r.title || domain,
          website: u.split("?")[0],
          sourceTag: "Tavily",
          rawMetadata: { tavilyQuery: query, tavilyScore: r.score },
        });
      }
    } catch {
      /* ignore */
    }
  }

  const cap = Math.min(400, 100 * m);
  return out.slice(0, cap);
}
