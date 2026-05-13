import * as cheerio from "cheerio";
import { fetchHtml } from "../lib/fetchHtml.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { tryPlaywrightFallback } from "../lib/playwrightRender.js";

/** @type {Record<string, string | string[]>} */
const G2_CATEGORY_SLUGS = {
  "ERP & Operations": ["erp-systems", "distribution-software"],
  "Fleet & Asset Management": ["fleet-management-software", "motor-carrier-operations-mco-software"],
  "Safety & Compliance Management": ["compliance", "ehs-management-software"],
  "Field Service Management": ["field-service-management-software"],
  "Estimating & Bidding": ["construction-estimating"],
  "Supply Chain & Inventory": ["supply-chain-management-software", "inventory-management-software"],
  "Dispatch & Logistics": ["transportation-management-systems", "routing-software"],
  "Environmental & Waste Management": ["waste-management"],
  "Structural & Engineering Design": ["structural-engineering"],
  "Project Management": ["construction-project-management-software"],
  "Maintenance Management (CMMS)": ["cmms-software"],
  "Weighbridge & Ticketing": "erp-systems",
  "CRM & Sales": ["crm-software"],
  "HR & Workforce Management": ["hr-management"],
  "Business Intelligence & Reporting": ["business-intelligence-bi-software"],
};

function slugList(activeProduct) {
  const raw = G2_CATEGORY_SLUGS[activeProduct] ?? "erp-systems";
  return Array.isArray(raw) ? raw : [raw];
}

function extractProducts($) {
  const pageItems = [];
  $("a[href*='/products/']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let abs;
    try {
      abs = new URL(href, "https://www.g2.com").href;
    } catch {
      return;
    }
    if (!abs.includes("/products/")) return;
    const name = $(el).text().trim().split("\n")[0].trim();
    if (!name || name.length < 2) return;
    pageItems.push({
      name,
      website: abs,
      sourceTag: "G2",
      rawMetadata: { g2Url: abs },
    });
  });
  return pageItems;
}

/**
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchG2(brief, fetchOpts = {}) {
  const slugs = slugList(brief.activeProduct);
  const m = breadthMultiplier(brief);
  const maxPages = Math.min(20, 4 + 5 * m);
  const cap = Math.min(700, 120 * m);
  const merged = [];

  const baseFo = {
    timeout: 24000,
    cache: fetchOpts.cache,
    jitterHostState: fetchOpts.jitterHostState,
    maxAttempts: 4,
  };

  for (const slug of slugs) {
    for (let page = 1; page <= maxPages; page++) {
      const url =
        page <= 1
          ? `https://www.g2.com/categories/${slug}`
          : `https://www.g2.com/categories/${slug}?page=${page}`;

      try {
        const r = await fetchHtml(url, baseFo);

        let text = r.text;
        if ((!r.ok || !text || text.length < 600 || r.blockedHint) && process.env.PLAYWRIGHT === "1") {
          const pw = await tryPlaywrightFallback(url);
          if (pw?.text) text = pw.text;
        }

        if (!text || text.length < 200) break;

        const $ = cheerio.load(text);
        const pageItems = extractProducts($);
        if (pageItems.length === 0) break;
        merged.push(...pageItems);
      } catch {
        break;
      }
    }
  }

  const seen = new Set();
  return merged
    .filter((x) => {
      const k = x.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, cap);
}

/** Fixture aid — parse category HTML for /products/ anchors. */
export function testParseG2Listings(html) {
  const $ = cheerio.load(html);
  const pageItems = [];
  $("a[href*='/products/']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let abs;
    try {
      abs = new URL(href, "https://www.g2.com").href;
    } catch {
      return;
    }
    if (!abs.includes("/products/")) return;
    const name = $(el).text().trim().split("\n")[0].trim();
    if (!name || name.length < 2) return;
    pageItems.push({ name, website: abs, sourceTag: "G2", rawMetadata: { g2Url: abs } });
  });
  return pageItems;
}
