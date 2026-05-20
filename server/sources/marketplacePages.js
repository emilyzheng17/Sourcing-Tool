import * as cheerio from "cheerio";
import { fetchText } from "../lib/fetchText.js";
import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { MARKETPLACE_PAGES } from "./marketplacePages.data.js";

/**
 * @param {string} html
 * @param {string} baseUrl
 * @param {string} marketplaceName
 */
export function extractMarketplaceLinks(html, baseUrl, marketplaceName) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const out = [];
  const baseHost = normalizeDomain(baseUrl);
  for (const el of $("a[href]").toArray()) {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:")) continue;
    let abs;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(abs)) continue;
    const domain = normalizeDomain(abs);
    if (!isLikelyCompanyDomain(domain)) continue;
    if (domain === baseHost || domain.endsWith(`.${baseHost}`)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    const text = $(el).text().trim().replace(/\s+/g, " ");
    out.push({
      name: text.length > 1 && text.length < 100 ? text : domain.split(".")[0],
      website: abs.split("?")[0],
      sourceTag: `Marketplace:${marketplaceName}`,
      rawMetadata: { marketplace: marketplaceName, baseUrl },
    });
  }
  return out;
}

/**
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchMarketplacePages(brief, fetchOpts = {}) {
  const verticals = brief.selectedVerticals?.length ? brief.selectedVerticals : null;
  const m = breadthMultiplier(brief);
  const cap = Math.min(180, 60 * m);
  const all = [];

  for (const row of MARKETPLACE_PAGES) {
    if (verticals && !verticals.includes(row.vertical)) continue;
    try {
      const { ok, text } = await fetchText(row.pageUrl, {
        timeout: 22000,
        cache: fetchOpts.cache,
        jitterHostState: fetchOpts.jitterHostState,
      });
      if (!ok || !text) continue;
      all.push(...extractMarketplaceLinks(text, row.pageUrl, row.name));
    } catch {
      /* ignore */
    }
  }

  return all.slice(0, cap);
}
