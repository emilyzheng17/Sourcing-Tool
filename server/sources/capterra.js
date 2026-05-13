import * as cheerio from "cheerio";
import { fetchText } from "../lib/fetchText.js";

const CAPTERRA_PATHS = {
  "ERP & Operations": "erp-software",
  "Fleet & Asset Management": "fleet-management-software",
  "Safety & Compliance Management": "compliance-software",
  "Field Service Management": "field-service-management-software",
  "Estimating & Bidding": "construction-estimating-software",
  "Supply Chain & Inventory": "supply-chain-management-software",
  "Dispatch & Logistics": "transportation-management-software",
  "Environmental & Waste Management": "waste-management-software",
  "Structural & Engineering Design": "structural-engineering-software",
  "Project Management": "construction-management-software",
  "Maintenance Management (CMMS)": "cmms-software",
  "Weighbridge & Ticketing": "erp-software",
  "CRM & Sales": "crm-software",
  "HR & Workforce Management": "hr-software",
  "Business Intelligence & Reporting": "business-intelligence-software",
};

export async function searchCapterra(brief) {
  const path = CAPTERRA_PATHS[brief.activeProduct] || "erp-software";
  const url = `https://www.capterra.com/${path}/`;
  const out = [];
  try {
    const { ok, text } = await fetchText(url, { timeout: 20000 });
    if (!ok || !text) return out;
    const $ = cheerio.load(text);
    $("a[href*='/p/']").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      let abs;
      try {
        abs = new URL(href, "https://www.capterra.com").href;
      } catch {
        return;
      }
      const name = $(el).text().trim().split("\n")[0].trim();
      if (!name || name.length < 2) return;
      out.push({
        name,
        website: abs,
        sourceTag: "Capterra",
        rawMetadata: { capterraUrl: abs },
      });
    });
  } catch {
    /* ignore */
  }
  const seen = new Set();
  return out
    .filter((x) => {
      const k = x.name.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 60);
}
