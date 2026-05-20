import { BaseAdapter } from "./base.js";
import { fetchHtml } from "../../lib/fetchHtml.js";
import { tryPlaywrightFallback } from "../../lib/playwrightRender.js";
import * as cheerio from "cheerio";

const SEARCH_TERMS = ["erp", "crm", "compliance", "fleet management", "field service", "analytics"];
const PAGE_SIZE = 20;
const AWS_HOSTS = new Set(["aws.amazon.com", "www.aws.amazon.com"]);

export class AwsMarketplaceAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "aws-marketplace",
      name: "AWS Marketplace",
      tier: 2,
      signalType: "marketplace",
    });
  }

  async *crawl(frontier, options) {
    let yielded = 0;
    let firstPageFailed = true;

    for (const term of SEARCH_TERMS) {
      if (Date.now() > options.deadline) break;
      if (yielded >= options.maxItems) break;

      const cursorKey = `aws-mp-${term}`;
      const saved = frontier.getCursor(cursorKey);
      let page = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 1;

      while (true) {
        if (Date.now() > options.deadline || yielded >= options.maxItems) break;

        const companies = await this._fetchPage(term, page, options);
        if (companies.length > 0) firstPageFailed = false;
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

    if (firstPageFailed && yielded === 0) {
      console.warn(`[${this.id}] All pages returned 0 results — AWS Marketplace is a JS SPA, Playwright fallback may be required`);
    }

    yield { companies: [], cursor: null, done: true };
  }

  async _fetchPage(term, page, options) {
    const encoded = encodeURIComponent(term);
    const url =
      `https://aws.amazon.com/marketplace/search/results` +
      `?searchTerms=${encoded}+software&FULFILLMENT_OPTION_TYPE=SAAS&page=${page}`;

    try {
      let r = await fetchHtml(url, {
        timeout: 20000,
        cache: options.fetchOpts.cache,
        jitterHostState: options.fetchOpts.jitterHostState,
      });

      if ((!r.ok || !r.text || r.text.length < 600 || r.blockedHint) && process.env.PLAYWRIGHT === "1") {
        const pw = await tryPlaywrightFallback(url, { allowedHosts: AWS_HOSTS });
        if (pw?.text) r = { ...r, text: pw.text, ok: true };
      }

      if (!r.ok || !r.text || r.text.length < 200) {
        if (!r.ok) console.warn(`[${this.id}] Endpoint returned ${r.status} for term="${term}" page=${page} — adapter may need URL update`);
        return [];
      }

      const $ = cheerio.load(r.text);
      const companies = [];

      $('[data-testid="search-result"], .mp-product-card, article, .awsui-card').each((_, el) => {
        const name =
          $(el).find('h2, h3, .mp-product-title, [data-testid="product-title"]').first().text().trim() ||
          $(el).find("a").first().text().trim();
        const vendor =
          $(el).find('.mp-vendor-name, [data-testid="vendor-name"], .vendor').first().text().trim();
        const href = $(el).find("a").first().attr("href") || "";
        const productUrl = href.startsWith("http") ? href : href ? `https://aws.amazon.com${href}` : "";

        if (name) {
          companies.push({
            name: vendor || name,
            website: productUrl,
            sourceTag: "Marketplace:AWS",
            rawMetadata: { productName: name, vendor, productUrl, searchTerm: term },
          });
        }
      });

      return companies;
    } catch (err) {
      console.error(`[${this.id}] Error fetching term="${term}" page=${page}: ${err.message}`);
      return [];
    }
  }
}
