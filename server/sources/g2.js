import * as cheerio from "cheerio";
import { fetchText } from "../lib/fetchText.js";

const G2_CATEGORY_SLUGS = {
  "ERP & Operations": "erp-systems",
  "Fleet & Asset Management": "fleet-management-software",
  "Safety & Compliance Management": "compliance",
  "Field Service Management": "field-service-management-software",
  "Estimating & Bidding": "construction-estimating",
  "Supply Chain & Inventory": "supply-chain-management-software",
  "Dispatch & Logistics": "transportation-management-systems",
  "Environmental & Waste Management": "waste-management",
  "Structural & Engineering Design": "structural-engineering",
  "Project Management": "construction-project-management-software",
  "Maintenance Management (CMMS)": "cmms-software",
  "Weighbridge & Ticketing": "erp-systems",
  "CRM & Sales": "crm-software",
  "HR & Workforce Management": "hr-management",
  "Business Intelligence & Reporting": "business-intelligence-bi-software",
};

export async function searchG2(brief) {
  const slug = G2_CATEGORY_SLUGS[brief.activeProduct] || "erp-systems";
  const url = `https://www.g2.com/categories/${slug}`;
  const out = [];
  try {
    const { ok, text } = await fetchText(url, { timeout: 20000 });
    if (!ok || !text) return out;
    const $ = cheerio.load(text);
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
      out.push({
        name,
        website: abs,
        sourceTag: "G2",
        rawMetadata: { g2Url: abs, category: slug },
      });
    });
  } catch {
    /* blocked or layout change */
  }
  return dedupeByName(out).slice(0, 60);
}

function dedupeByName(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    const k = x.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
