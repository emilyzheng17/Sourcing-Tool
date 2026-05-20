import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";

const SEARCH_TERMS = ["software", "saas", "cloud", "ict", "erp"];
const PAGE_SIZE = 50;

export class KvkAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "nl-kvk",
      name: "Netherlands KvK",
      tier: 2,
      signalType: "registry",
    });
  }

  async *crawl(frontier, options) {
    const apiKey = options.env.KVK_API_KEY;
    if (!apiKey) {
      console.warn(`[${this.id}] No KVK_API_KEY — skipping`);
      yield { companies: [], cursor: null, done: true };
      return;
    }

    let yielded = 0;

    for (const term of SEARCH_TERMS) {
      if (Date.now() > options.deadline) break;
      if (yielded >= options.maxItems) break;

      const cursorKey = `kvk-${term}`;
      const saved = frontier.getCursor(cursorKey);
      let page = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 1;

      while (true) {
        if (Date.now() > options.deadline || yielded >= options.maxItems) break;

        const companies = await this._fetchPage(term, page, apiKey, options);
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

  async _fetchPage(term, page, apiKey, options) {
    const url =
      `https://api.kvk.nl/api/v1/zoeken` +
      `?handelsnaam=${encodeURIComponent(term)}&pagina=${page}&resultatenPerPagina=${PAGE_SIZE}`;

    try {
      const res = await fetchText(url, {
        timeout: 20000,
        headers: { apikey: apiKey },
        cache: options.fetchOpts.cache,
        jitterHostState: options.fetchOpts.jitterHostState,
      });

      if (!res.ok) {
        console.error(`[${this.id}] HTTP ${res.status} for term="${term}" page=${page}`);
        return [];
      }

      const data = JSON.parse(res.text);
      const resultaten = data.resultaten || [];

      return resultaten.map((item) => ({
        name: item.handelsnaam || item.naam || "",
        website: "",
        sourceTag: "Registry:NL-KVK",
        country: "NL",
        rawMetadata: {
          kvkNummer: item.kvkNummer,
          plaats: item.plaats || item.adres?.plaats || "",
          type: item.type,
          searchTerm: term,
        },
      })).filter((c) => c.name);
    } catch (err) {
      console.error(`[${this.id}] Error fetching term="${term}" page=${page}: ${err.message}`);
      return [];
    }
  }
}
