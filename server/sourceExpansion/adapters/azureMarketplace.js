import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";
import * as cheerio from "cheerio";

const SEARCH_TERMS = ["software", "erp", "crm", "saas", "analytics", "compliance"];
const PAGE_SIZE = 50;

export class AzureMarketplaceAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "azure-marketplace",
      name: "Microsoft Azure Marketplace",
      tier: 2,
      signalType: "marketplace",
    });
  }

  async *crawl(frontier, options) {
    let yielded = 0;

    for (const term of SEARCH_TERMS) {
      if (Date.now() > options.deadline) break;
      if (yielded >= options.maxItems) break;

      const cursorKey = `azure-mp-${term}`;
      const saved = frontier.getCursor(cursorKey);
      let page = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 1;

      while (true) {
        if (Date.now() > options.deadline || yielded >= options.maxItems) break;

        const companies = await this._fetchPage(term, page, options);
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

  async _fetchPage(term, page, options) {
    const apiUrl =
      `https://azuremarketplace.microsoft.com/api/search?query=${encodeURIComponent(term)}&page=${page}`;

    try {
      const res = await fetchText(apiUrl, {
        timeout: 20000,
        cache: options.fetchOpts.cache,
        jitterHostState: options.fetchOpts.jitterHostState,
      });

      if (res.ok) {
        const parsed = this._tryParseJson(res.text);
        if (parsed && Array.isArray(parsed.results || parsed.items || parsed.data)) {
          const items = parsed.results || parsed.items || parsed.data;
          return items.map((item) => ({
            name: item.publisherDisplayName || item.publisher || item.displayName || item.title,
            website: item.detailUrl || item.url || "",
            sourceTag: "Marketplace:Azure",
            rawMetadata: {
              productName: item.displayName || item.title,
              publisher: item.publisherDisplayName || item.publisher,
              category: item.category,
              searchTerm: term,
            },
          })).filter((c) => c.name);
        }
      }

      return await this._scrapeFallback(term, page, options);
    } catch (err) {
      console.error(`[${this.id}] Error fetching term="${term}" page=${page}: ${err.message}`);
      return [];
    }
  }

  async _scrapeFallback(term, page, options) {
    const url =
      `https://azuremarketplace.microsoft.com/en-us/marketplace/apps?search=${encodeURIComponent(term)}&page=${page}`;

    try {
      const res = await fetchText(url, {
        timeout: 20000,
        cache: options.fetchOpts.cache,
        jitterHostState: options.fetchOpts.jitterHostState,
      });
      if (!res.ok) return [];

      const $ = cheerio.load(res.text);
      const companies = [];

      $(".mp-tile, .card, [data-bi-area=\"body\"] article, .marketplace-card").each((_, el) => {
        const name =
          $(el).find("h3, h4, .tile-title, .card-title").first().text().trim();
        const publisher =
          $(el).find(".publisher, .tile-publisher, .card-subtitle").first().text().trim();
        const href = $(el).find("a").first().attr("href") || "";
        const detailUrl = href.startsWith("http") ? href : href ? `https://azuremarketplace.microsoft.com${href}` : "";

        if (name || publisher) {
          companies.push({
            name: publisher || name,
            website: detailUrl,
            sourceTag: "Marketplace:Azure",
            rawMetadata: { productName: name, publisher, detailUrl, searchTerm: term },
          });
        }
      });

      return companies;
    } catch (err) {
      console.error(`[${this.id}] Scrape fallback error: ${err.message}`);
      return [];
    }
  }

  _tryParseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
