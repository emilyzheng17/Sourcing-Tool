import { BaseAdapter } from "./base.js";
import { fetchHtml } from "../../lib/fetchHtml.js";
import { tryPlaywrightFallback } from "../../lib/playwrightRender.js";
import * as cheerio from "cheerio";

const CATEGORIES = ["business-technology-platform", "erp", "crm", "supply-chain", "hr"];
const PAGE_SIZE = 20;
const SAP_HOSTS = new Set(["store.sap.com"]);

export class SapStoreAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "sap-store",
      name: "SAP Store",
      tier: 2,
      signalType: "marketplace",
    });
  }

  async *crawl(frontier, options) {
    let yielded = 0;

    for (const category of CATEGORIES) {
      if (Date.now() > options.deadline) break;
      if (yielded >= options.maxItems) break;

      const cursorKey = `sap-store-${category}`;
      const saved = frontier.getCursor(cursorKey);
      let page = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 1;

      while (true) {
        if (Date.now() > options.deadline || yielded >= options.maxItems) break;

        const companies = await this._fetchPage(category, page, options);
        if (companies.length === 0) break;

        yielded += companies.length;
        page += 1;

        frontier.saveCursor(cursorKey, {
          cursorValue: String(page),
          itemsDiscovered: yielded,
          status: "running",
        });

        yield { companies, cursor: String(page), done: false };

        if (companies.length < PAGE_SIZE) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    yield { companies: [], cursor: null, done: true };
  }

  async _fetchPage(category, page, options) {
    const url = `https://store.sap.com/dcp/en/search/${category}?page=${page}`;

    try {
      let r = await fetchHtml(url, {
        timeout: 20000,
        cache: options.fetchOpts.cache,
        jitterHostState: options.fetchOpts.jitterHostState,
      });

      if ((!r.ok || !r.text || r.text.length < 600 || r.blockedHint) && process.env.PLAYWRIGHT === "1") {
        const pw = await tryPlaywrightFallback(url, { allowedHosts: SAP_HOSTS });
        if (pw?.text) r = { ...r, text: pw.text, ok: true };
      }

      if (!r.ok || !r.text || r.text.length < 200) {
        if (!r.ok) console.warn(`[${this.id}] Endpoint returned ${r.status} for category="${category}" page=${page} — adapter may need URL update`);
        return [];
      }

      const $ = cheerio.load(r.text);
      const companies = [];

      $(".search-result-item, .product-card, .dcp-card, article.listing, [data-product]").each((_, el) => {
        const productName =
          $(el).find("h3, h2, .product-title, .card-title, .dcp-card__title").first().text().trim();
        const vendor =
          $(el).find(".vendor-name, .publisher, .dcp-card__vendor, .partner-name").first().text().trim();
        const href = $(el).find("a").first().attr("href") || "";
        const productUrl = href.startsWith("http") ? href : href ? `https://store.sap.com${href}` : "";

        if (productName || vendor) {
          companies.push({
            name: vendor || productName,
            website: productUrl,
            sourceTag: "Marketplace:SAP",
            rawMetadata: { productName, vendor, productUrl, category },
          });
        }
      });

      return companies;
    } catch (err) {
      console.error(`[${this.id}] Error fetching category="${category}" page=${page}: ${err.message}`);
      return [];
    }
  }
}
