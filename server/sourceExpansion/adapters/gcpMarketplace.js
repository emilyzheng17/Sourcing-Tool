import { BaseAdapter } from "./base.js";
import { fetchHtml } from "../../lib/fetchHtml.js";
import { tryPlaywrightFallback } from "../../lib/playwrightRender.js";
import * as cheerio from "cheerio";

const CATEGORIES = ["analytics", "security", "databases", "developer-tools", "ai-machine-learning", "business-intelligence"];
const PAGE_SIZE = 24;
const GCP_HOSTS = new Set(["cloud.google.com"]);

export class GcpMarketplaceAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "gcp-marketplace",
      name: "Google Cloud Marketplace",
      tier: 2,
      signalType: "marketplace",
    });
  }

  async *crawl(frontier, options) {
    let yielded = 0;
    let consecutiveEmpty = 0;

    for (const category of CATEGORIES) {
      if (Date.now() > options.deadline) break;
      if (yielded >= options.maxItems) break;

      const cursorKey = `gcp-mp-${category}`;
      const saved = frontier.getCursor(cursorKey);
      let page = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 1;

      while (true) {
        if (Date.now() > options.deadline || yielded >= options.maxItems) break;

        const companies = await this._fetchCategory(category, page, options);
        if (companies.length === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 3 && yielded === 0) {
            console.warn(`[${this.id}] GCP Marketplace is entirely JS-rendered — HTML scraping yields no results. Consider enabling PLAYWRIGHT=1`);
            yield { companies: [], cursor: null, done: true };
            return;
          }
          break;
        }

        consecutiveEmpty = 0;
        yielded += companies.length;
        page += 1;

        frontier.saveCursor(cursorKey, {
          cursorValue: String(page),
          itemsDiscovered: yielded,
          status: "running",
        });

        yield { companies, cursor: String(page), done: false };

        if (companies.length < PAGE_SIZE) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    yield { companies: [], cursor: null, done: true };
  }

  async _fetchCategory(category, page, options) {
    const url =
      `https://cloud.google.com/marketplace/browse?category=${encodeURIComponent(category)}&filter=solution-type:service&page=${page}`;

    try {
      let r = await fetchHtml(url, {
        timeout: 20000,
        cache: options.fetchOpts.cache,
        jitterHostState: options.fetchOpts.jitterHostState,
      });

      if ((!r.ok || !r.text || r.text.length < 600 || r.blockedHint) && process.env.PLAYWRIGHT === "1") {
        const pw = await tryPlaywrightFallback(url, { allowedHosts: GCP_HOSTS });
        if (pw?.text) r = { ...r, text: pw.text, ok: true };
      }

      if (!r.ok || !r.text || r.text.length < 200) {
        if (!r.ok) console.warn(`[${this.id}] Endpoint returned ${r.status} for category="${category}" page=${page} — adapter may need URL update`);
        return [];
      }

      const $ = cheerio.load(r.text);
      const companies = [];

      $(".marketplace-item, .cfc-card, [data-category] article, .mp-card, .listing-card").each((_, el) => {
        const productName =
          $(el).find("h3, h2, .card-title, .listing-title").first().text().trim();
        const vendor =
          $(el).find(".vendor, .publisher, .card-subtitle, .listing-vendor").first().text().trim();
        const href = $(el).find("a").first().attr("href") || "";
        const productUrl = href.startsWith("http")
          ? href
          : href ? `https://cloud.google.com${href}` : "";

        if (productName || vendor) {
          companies.push({
            name: vendor || productName,
            website: productUrl,
            sourceTag: "Marketplace:GCP",
            rawMetadata: { productName, vendor, productUrl, category },
          });
        }
      });

      if (companies.length === 0) {
        return this._parseJsonLd($);
      }

      return companies;
    } catch (err) {
      console.error(`[${this.id}] Error fetching category="${category}" page=${page}: ${err.message}`);
      return [];
    }
  }

  _parseJsonLd($) {
    const companies = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html());
        const items = Array.isArray(data) ? data : data.itemListElement || [];
        for (const item of items) {
          const name = item.name || item.item?.name;
          const url = item.url || item.item?.url || "";
          if (name) {
            companies.push({
              name,
              website: url,
              sourceTag: "Marketplace:GCP",
              rawMetadata: { productName: name, productUrl: url },
            });
          }
        }
      } catch { /* skip malformed JSON-LD */ }
    });
    return companies;
  }
}
