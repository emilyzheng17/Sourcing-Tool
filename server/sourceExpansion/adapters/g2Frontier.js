import * as cheerio from "cheerio";
import { BaseAdapter } from "./base.js";
import { fetchHtml } from "../../lib/fetchHtml.js";
import { tryPlaywrightFallback } from "../../lib/playwrightRender.js";

const CATEGORIES = [
  "erp-systems", "crm-software", "hr-management", "accounting-software",
  "project-management-software", "help-desk-software", "marketing-automation",
  "business-intelligence-bi-software", "ecommerce-platforms", "fleet-management-software",
  "cmms-software", "field-service-management-software", "compliance",
  "supply-chain-management-software", "inventory-management-software",
  "construction-project-management-software", "transportation-management-systems",
  "waste-management", "manufacturing-management-software", "warehouse-management-software",
  "property-management-software", "dental-practice-management-software",
  "church-management-software", "camp-management-software", "gym-management-software",
  "restaurant-management-software", "salon-software", "veterinary-software",
  "legal-practice-management-software",
];

const DELAY_MS = 1500;
const G2_HOSTS = new Set(["www.g2.com", "g2.com"]);

export class G2FrontierAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "g2-frontier",
      name: "G2 Full Category Crawl",
      tier: 1,
      signalType: "marketplace",
    });
  }

  async *crawl(frontier, options) {
    const { fetchOpts = {}, maxItems = Infinity, deadline = Infinity } = options;
    let totalYielded = 0;

    for (const category of CATEGORIES) {
      if (Date.now() > deadline || totalYielded >= maxItems) break;

      const cursorKey = `g2-frontier:${category}`;
      const saved = frontier.getCursor(cursorKey);
      let page = saved?.cursorValue ? Number(saved.cursorValue) : 1;
      let categoryItems = saved?.itemsDiscovered ?? 0;

      while (true) {
        if (Date.now() > deadline || totalYielded >= maxItems) break;

        const url = `https://www.g2.com/categories/${category}?page=${page}`;
        let companies = [];

        try {
          let r = await fetchHtml(url, {
            timeout: 20000,
            cache: fetchOpts.cache,
            jitterHostState: fetchOpts.jitterHostState,
          });

          if ((!r.ok || !r.text || r.text.length < 600 || r.blockedHint) && process.env.PLAYWRIGHT === "1") {
            const pw = await tryPlaywrightFallback(url, { allowedHosts: G2_HOSTS });
            if (pw?.text) r = { ...r, text: pw.text, ok: true };
          }

          if (!r.ok || !r.text || r.text.length < 200) break;

          const $ = cheerio.load(r.text);
          const links = $('a[href*="/products/"]').toArray();

          if (links.length === 0) break;

          const seen = new Set();
          for (const el of links) {
            const href = $(el).attr("href") || "";
            const name = $(el).text().trim().replace(/\s+/g, " ");
            if (!href || seen.has(href)) continue;
            seen.add(href);

            const fullUrl = href.startsWith("http") ? href : `https://www.g2.com${href}`;
            companies.push({
              name: name || href.split("/products/")[1]?.replace(/-/g, " ") || "Unknown",
              website: fullUrl,
              sourceTag: `Marketplace:G2:${category}`,
              rawMetadata: { g2Url: fullUrl, category, page },
            });
          }
        } catch (err) {
          console.warn(`[g2-frontier] Error scraping ${url}: ${err.message}`);
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
