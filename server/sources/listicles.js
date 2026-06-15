import { fetchText } from "../lib/fetchText.js";
import { searchWebQuery } from "../lib/webSearch.js";
import { extractExternalLinks } from "./portfolioHarvest.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { normalizeDomain } from "../lib/domains.js";

/**
 * Vertical-templated "best/top [vertical] software" buyer-guide queries.
 * @param {object} brief
 */
export function buildListicleQueries(brief) {
  const verts =
    Array.isArray(brief?.selectedVerticals) && brief.selectedVerticals.length
      ? brief.selectedVerticals
      : ["industrial B2B"];
  const product = brief?.activeProduct || "software";
  const out = [];
  for (const v of verts) {
    out.push(`best ${v} ${product} software`);
    out.push(`top ${v} software companies`);
    out.push(`${v} software buyers guide`);
  }
  const seen = new Set();
  return out.filter((q) => {
    const k = q.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * "Best [vertical] software" listicle harvesting — reuses the shared web-search
 * layer (Serper/Tavily/Brave) to find buyer-guide article pages, then extracts
 * vendor outbound links from each page via the portfolio Cheerio extractor.
 * Net-new comes from parsing result PAGES, not the result URLs themselves.
 * Degrades to [] when no search key is configured.
 *
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchListicles(brief, env, fetchOpts = {}) {
  const e = env || process.env;
  const m = breadthMultiplier(brief);
  const maxQueries = Math.min(9, 3 * m);
  const maxArticles = Math.min(24, 6 * m);
  const cap = Math.min(300, 120 * m);

  const queries = buildListicleQueries(brief).slice(0, maxQueries);

  const articleUrls = [];
  const seenUrl = new Set();
  for (const q of queries) {
    if (articleUrls.length >= maxArticles) break;
    let results = [];
    try {
      results = await searchWebQuery(q, e);
    } catch {
      results = [];
    }
    for (const r of results) {
      const url = r?.url;
      if (!url || seenUrl.has(url)) continue;
      seenUrl.add(url);
      articleUrls.push({ url, query: q });
      if (articleUrls.length >= maxArticles) break;
    }
  }

  const out = [];
  const seenDomain = new Set();
  for (const { url, query } of articleUrls) {
    try {
      const { ok, text } = await fetchText(url, {
        timeout: 22000,
        cache: fetchOpts.cache,
        jitterHostState: fetchOpts.jitterHostState,
      });
      if (!ok || !text) continue;
      const links = extractExternalLinks(text, url, "Listicle", { listicleUrl: url, listicleQuery: query });
      for (const cand of links) {
        const d = normalizeDomain(cand.website);
        if (!d || seenDomain.has(d)) continue;
        seenDomain.add(d);
        out.push(cand);
        if (out.length >= cap) return out;
      }
    } catch {
      /* ignore per-article failures */
    }
  }
  return out.slice(0, cap);
}
