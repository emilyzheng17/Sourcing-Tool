import * as cheerio from "cheerio";
import { fetchText } from "../lib/fetchText.js";
import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { breadthMultiplier } from "../lib/breadth.js";

/**
 * Map vertical → public pages that often list vendors/partners (best-effort).
 * Many pages are HTML-heavy; scraper extracts external http(s) links as weak candidates.
 */
const VERTICAL_URLS = {
  "Metals & Mining": [
    "https://www.nssga.org/",
    "https://www.nma.org/",
    "https://www.gold.org/"
  ],
  "Bulk Materials": ["https://www.nssga.org/"],
  "Bulk Liquids": ["https://www.api.org/"],
  "Forestry & Lumber": ["https://www.afandpa.org/"],
  "Structure Design & Analysis": ["https://www.asce.org/"],
  "Contractor Solutions": ["https://www.agc.org/"],
  "Equipment & Parts": ["https://www.aem.org/"],
  "Waste & Recycling": ["https://isri.org/"],
  "Safety & Compliance": ["https://www.osha.gov/"],
};

function extractLinks(html, baseUrl, vertical) {
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
    if (domain === baseHost) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    const text = $(el).text().trim();
    out.push({
      name: text.length > 1 && text.length < 100 ? text : domain.split(".")[0],
      website: abs.split("?")[0],
      sourceTag: `Assoc:${vertical}`,
      rawMetadata: { vertical, baseUrl },
    });
  }
  return out;
}

/**
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchTradeAssocs(brief, fetchOpts = {}) {
  const verticals = brief.selectedVerticals?.length ? brief.selectedVerticals : Object.keys(VERTICAL_URLS);
  const all = [];
  for (const v of verticals) {
    const urls = VERTICAL_URLS[v];
    if (!urls) continue;
    for (const url of urls) {
      try {
        const { ok, text } = await fetchText(url, {
          timeout: 20000,
          cache: fetchOpts.cache,
          jitterHostState: fetchOpts.jitterHostState,
        });
        if (!ok || !text) continue;
        all.push(...extractLinks(text, url, v));
      } catch {
        /* ignore */
      }
    }
  }
  const m = breadthMultiplier(brief);
  const cap = Math.min(200, 80 * m);
  return all.slice(0, cap);
}
