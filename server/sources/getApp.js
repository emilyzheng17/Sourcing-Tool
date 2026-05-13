import * as cheerio from "cheerio";
import { fetchHtml } from "../lib/fetchHtml.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { tryPlaywrightFallback } from "../lib/playwrightRender.js";

/** Category slug segments under getapp.com (single segment preferred). */
const GETAPP_PATHS = {
  "ERP & Operations": ["erp-software", "supply-chain-management-software"],
  "Fleet & Asset Management": ["fleet-management-software"],
  "Safety & Compliance Management": ["compliance-management-software"],
  "Field Service Management": ["field-service-management-software"],
  "Estimating & Bidding": ["construction-analytics-software"],
  "Supply Chain & Inventory": ["supply-chain-management-software"],
  "Dispatch & Logistics": ["transportation-management-systems"],
  "Environmental & Waste Management": ["waste-management-software"],
  "Structural & Engineering Design": ["structural-engineering-software"],
  "Project Management": ["construction-project-management"],
  "Maintenance Management (CMMS)": ["cmms-software"],
  "Weighbridge & Ticketing": "erp-software",
  "CRM & Sales": ["crm-software"],
  "HR & Workforce Management": ["hr-management-software"],
  "Business Intelligence & Reporting": ["business-intelligence-software"],
};

function pathList(activeProduct) {
  const raw = GETAPP_PATHS[activeProduct] ?? "erp-software";
  return Array.isArray(raw) ? raw : [raw];
}

function extractFromHtml(html, pathLabel) {
  const $ = cheerio.load(html);
  const rows = [];
  $("a[href*='/a/']").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.toLowerCase().includes("compare")) return;
    let abs;
    try {
      abs = new URL(href, "https://www.getapp.com").href;
    } catch {
      return;
    }
    if (!abs.includes("getapp.com")) return;
    let pathname = "";
    try {
      pathname = new URL(abs).pathname;
    } catch {
      return;
    }
    if (!pathname.includes("/a/")) return;
    const name = $(el).text().trim().split("\n")[0].trim();
    if (!name || name.length < 2) return;
    const cleanUrl = abs.split("?")[0];
    rows.push({
      name,
      website: cleanUrl,
      sourceTag: "GetApp",
      rawMetadata: { getAppUrl: cleanUrl, getAppCategory: pathLabel },
    });
  });
  return rows;
}

/**
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchGetApp(brief, fetchOpts = {}) {
  const paths = pathList(brief.activeProduct);
  const m = breadthMultiplier(brief);
  const maxPages = Math.min(10, 2 + 2 * m);
  const cap = Math.min(400, 80 * m);
  const merged = [];

  const baseFo = {
    timeout: 24000,
    cache: fetchOpts.cache,
    jitterHostState: fetchOpts.jitterHostState,
    maxAttempts: 4,
  };

  for (const pathSlug of paths) {
    const seg = pathSlug.replace(/^\/+|\/+$/g, "");
    for (let page = 1; page <= maxPages; page++) {
      const url =
        page <= 1 ? `https://www.getapp.com/${seg}/` : `https://www.getapp.com/${seg}/?page=${page}`;

      try {
        const r = await fetchHtml(url, baseFo);
        let text = r.text;
        if ((!r.ok || !text || text.length < 600 || r.blockedHint) && process.env.PLAYWRIGHT === "1") {
          const pw = await tryPlaywrightFallback(url);
          if (pw?.text) text = pw.text;
        }

        if (!text || text.length < 200) break;

        const pageItems = extractFromHtml(text, seg);
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
