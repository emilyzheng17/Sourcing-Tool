import { BaseAdapter } from "./base.js";
import { fetchHtml } from "../../lib/fetchHtml.js";
import * as cheerio from "cheerio";

const SEARCH_TERMS = ["software", "IT", "cloud", "SaaS", "Datenverarbeitung"];
const PAGE_SIZE = 25;

export class HandelsregisterAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "de-handelsregister",
      name: "Germany Handelsregister",
      tier: 2,
      signalType: "registry",
    });
  }

  async *crawl(frontier, options) {
    let yielded = 0;
    let firstTermFailed = true;

    for (const term of SEARCH_TERMS) {
      if (Date.now() > options.deadline) break;
      if (yielded >= options.maxItems) break;

      const cursorKey = `de-hr-${term}`;
      const saved = frontier.getCursor(cursorKey);
      let page = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 1;

      while (true) {
        if (Date.now() > options.deadline || yielded >= options.maxItems) break;

        const companies = await this._fetchPage(term, page, options);
        if (companies.length > 0) firstTermFailed = false;
        if (companies.length === 0) {
          if (firstTermFailed && page === 1 && term === SEARCH_TERMS[0]) {
            console.warn(`[${this.id}] Handelsregister portal does not support direct keyword search via URL — adapter needs API key or different approach`);
            yield { companies: [], cursor: null, done: true };
            return;
          }
          break;
        }

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

  async _fetchPage(term, page, options) {
    const url =
      `https://www.handelsregister.de/rp_web/search.xhtml` +
      `?searchterm=${encodeURIComponent(term)}&page=${page}`;

    try {
      const r = await fetchHtml(url, {
        timeout: 20000,
        cache: options.fetchOpts.cache,
        jitterHostState: options.fetchOpts.jitterHostState,
      });

      if (!r.ok || !r.text || r.text.length < 200) {
        if (!r.ok) console.warn(`[${this.id}] Endpoint returned ${r.status} for term="${term}" page=${page} — adapter may need URL update`);
        return [];
      }

      const $ = cheerio.load(r.text);
      const companies = [];

      $("table tbody tr, .result-row, .company-entry, [data-company]").each((_, el) => {
        const cells = $(el).find("td");
        const name = cells.eq(0).text().trim() ||
          $(el).find(".company-name, h3, h4").first().text().trim();
        const regNumber = cells.eq(1).text().trim() || "";
        const city = cells.eq(2).text().trim() ||
          $(el).find(".city, .location").first().text().trim();

        if (name && name.length > 2) {
          const registryUrl = `https://www.handelsregister.de/rp_web/search.xhtml?searchterm=${encodeURIComponent(name)}`;
          companies.push({
            name,
            website: registryUrl,
            sourceTag: "Registry:DE-HR",
            country: "DE",
            rawMetadata: {
              registrationNumber: regNumber,
              city,
              searchTerm: term,
              registryUrl,
              needsWebsiteResolution: true,
            },
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
