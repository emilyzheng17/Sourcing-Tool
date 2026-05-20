import * as cheerio from "cheerio";
import { BaseAdapter } from "./base.js";
import { fetchHtml } from "../../lib/fetchHtml.js";
import { tryPlaywrightFallback } from "../../lib/playwrightRender.js";

const CATEGORIES = [
  "erp-software", "crm-software", "hr-software", "accounting-software",
  "project-management-software", "help-desk-software", "marketing-automation-software",
  "business-intelligence-software", "fleet-management-software", "cmms-software",
  "field-service-management-software", "compliance-software",
  "supply-chain-management-software", "inventory-management-software",
  "construction-management-software", "transportation-management-software",
  "waste-management-software", "manufacturing-management-software",
  "warehouse-management-software", "property-management-software", "dental-software",
  "church-management-software", "camp-management-software", "gym-management-software",
  "restaurant-management-software", "salon-software", "veterinary-software",
  "legal-case-management-software",
];

const DELAY_MS = 1500;
const CAPTERRA_HOSTS = new Set(["www.capterra.com", "capterra.com"]);

export class CapterraFrontierAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "capterra-frontier",
      name: "Capterra Full Category Crawl",
      tier: 1,
      signalType: "marketplace",
    });
  }

  async *crawl(frontier, options) {
    const { fetchOpts = {}, maxItems = Infinity, deadline = Infinity } = options;
    let totalYielded = 0;

    for (const category of CATEGORIES) {
      if (Date.now() > deadline || totalYielded >= maxItems) break;

      const cursorKey = `capterra-frontier:${category}`;
      const saved = frontier.getCursor(cursorKey);
      let page = saved?.cursorValue ? Number(saved.cursorValue) : 1;
      let categoryItems = saved?.itemsDiscovered ?? 0;

      while (true) {
        if (Date.now() > deadline || totalYielded >= maxItems) break;

        const url = page === 1
          ? `https://www.capterra.com/${category}/`
          : `https://www.capterra.com/${category}/?page=${page}`;

        let companies = [];

        try {
          let r = await fetchHtml(url, {
            timeout: 20000,
            cache: fetchOpts.cache,
            jitterHostState: fetchOpts.jitterHostState,
          });

          if ((!r.ok || !r.text || r.text.length < 600 || r.blockedHint) && process.env.PLAYWRIGHT === "1") {
            const pw = await tryPlaywrightFallback(url, { allowedHosts: CAPTERRA_HOSTS });
            if (pw?.text) r = { ...r, text: pw.text, ok: true };
          }

          if (!r.ok || !r.text || r.text.length < 200) break;

          const $ = cheerio.load(r.text);
          const links = $('a[href*="/p/"]').toArray();

          if (links.length === 0) break;

          const seen = new Set();
          for (const el of links) {
            const href = $(el).attr("href") || "";
            const name = $(el).text().trim().replace(/\s+/g, " ");
            if (!href || seen.has(href)) continue;
            seen.add(href);

            const fullUrl = href.startsWith("http") ? href : `https://www.capterra.com${href}`;
            companies.push({
              name: name || href.split("/p/")[1]?.replace(/-/g, " ") || "Unknown",
              website: fullUrl,
              sourceTag: `Marketplace:Capterra:${category}`,
              rawMetadata: { capterraUrl: fullUrl, category, page },
            });
          }
        } catch (err) {
          console.warn(`[capterra-frontier] Error scraping ${url}: ${err.message}`);
          break;
        }

        categoryItems += companies.length;
        totalYielded += companies.length;
        page += 1;

        frontier.saveCursor(cursorKey, {
          cursorValue: String(page),
          itemsDiscovered: categoryItems,
          status: "in_progress",
          metadata: { category },
        });

        yield { companies, cursor: `${category}:page=${page}`, done: false };

        await delay(DELAY_MS);
      }

      frontier.saveCursor(cursorKey, {
        cursorValue: String(page),
        itemsDiscovered: categoryItems,
        status: "done",
        metadata: { category },
      });
    }

    yield { companies: [], cursor: null, done: true };
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
