import * as cheerio from "cheerio";
import { fetchHtml } from "../lib/fetchHtml.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { tryPlaywrightFallback } from "../lib/playwrightRender.js";
import { extractFromNextData } from "./portfolioHarvest.js";

/**
 * TrustRadius category hub slugs (see https://www.trustradius.com/{slug}).
 * @type {Record<string, string[]>}
 */
const TR_HUB_SLUGS = {
  "ERP & Operations": ["erp", "inventory-management"],
  "Fleet & Asset Management": ["fleet-management", "asset-management"],
  "Safety & Compliance Management": ["compliance", "environmental-health-and-safety"],
  "Field Service Management": ["field-service-management", "field-service"],
  "Estimating & Bidding": ["construction-estimating", "quantity-takeoff"],
  "Supply Chain & Inventory": ["supply-chain-management", "warehouse-management"],
  "Dispatch & Logistics": ["logistics-transportation", "transportation-management"],
  "Environmental & Waste Management": ["waste-management", "environmental-management"],
  "Structural & Engineering Design": ["computer-aided-design", "structural-engineering"],
  "Project Management": ["project-management", "construction-project-management"],
  "Maintenance Management (CMMS)": ["cmms", "maintenance-management"],
  "Weighbridge & Ticketing": ["erp", "inventory-management"],
  "CRM & Sales": ["crm", "sales-performance-management"],
  "HR & Workforce Management": ["human-resources", "payroll"],
  "Business Intelligence & Reporting": ["business-intelligence", "reporting"],
};

function hubList(activeProduct) {
  const raw = TR_HUB_SLUGS[activeProduct] ?? ["erp"];
  return Array.isArray(raw) ? raw : [raw];
}

function isProductListingHref(href) {
  if (!href || typeof href !== "string") return false;
  if (!href.includes("/products/")) return false;
  if (href.includes("/competitors")) return false;
  if (href.includes("/compare")) return false;
  return true;
}

/**
 * @param {string} html
 * @param {string} hubLabel
 */
function extractFromPage(html, hubLabel) {
  const out = [];
  const seen = new Set();

  const push = (name, abs) => {
    if (!isProductListingHref(abs)) return;
    let u;
    try {
      u = new URL(abs, "https://www.trustradius.com").href.split("?")[0];
    } catch {
      return;
    }
    if (!u.includes("trustradius.com/products/")) return;
    const key = u.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const cleanName = (name || "").trim().split("\n")[0].trim() || u.split("/").filter(Boolean).pop() || "Unknown";
    out.push({
      name: cleanName.slice(0, 120),
      website: u,
      sourceTag: "TrustRadius",
      rawMetadata: { trustRadiusHub: hubLabel, trustRadiusUrl: u },
    });
  };

  for (const row of extractFromNextData(html)) {
    const href = typeof row === "string" ? row : row?.website || row?.url || row?.href;
    if (typeof href === "string" && isProductListingHref(href)) {
      const name = typeof row === "object" && row?.name ? String(row.name) : "";
      push(name, href);
    }
  }

  const $ = cheerio.load(html);
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!isProductListingHref(href)) return;
    const name = $(el).text().trim().split("\n")[0].trim();
    try {
      push(name, new URL(href, "https://www.trustradius.com").href);
    } catch {
      /* ignore */
    }
  });

  return out;
}

/**
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchTrustRadius(brief, fetchOpts = {}) {
  const slugs = hubList(brief.activeProduct);
  const m = breadthMultiplier(brief);
  const maxPages = Math.min(12, 2 + 3 * m);
  const cap = Math.min(700, 110 * m);
  const merged = [];

  const baseFo = {
    timeout: 26000,
    cache: fetchOpts.cache,
    jitterHostState: fetchOpts.jitterHostState,
    maxAttempts: 4,
  };

  for (const slug of slugs) {
    let stagnant = 0;
    let prevSig = "";
    for (let page = 1; page <= maxPages; page++) {
      const url =
        page <= 1
          ? `https://www.trustradius.com/${slug}`
          : `https://www.trustradius.com/${slug}?page=${page}`;

      try {
        const r = await fetchHtml(url, baseFo);
        let text = r.text;
        if ((!r.ok || !text || text.length < 800 || r.blockedHint) && process.env.PLAYWRIGHT === "1") {
          const pw = await tryPlaywrightFallback(url);
          if (pw?.text) text = pw.text;
        }
        if (!text || text.length < 400) break;

        const pageItems = extractFromPage(text, slug);
        const sig = pageItems
          .slice(0, 5)
          .map((x) => x.website)
          .join("|");
        if (sig && sig === prevSig) {
          stagnant += 1;
          if (stagnant >= 2) break;
        } else {
          stagnant = 0;
          prevSig = sig;
        }
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
      const k = x.website.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, cap);
}
