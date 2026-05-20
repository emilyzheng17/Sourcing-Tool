import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";

const SEARCH_TERMS = ["software", "it", "saas", "erp", "cloud"];

export class CvrAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "dk-cvr",
      name: "Denmark CVR",
      tier: 1,
      signalType: "registry",
    });
  }

  async *crawl(frontier, options) {
    let yielded = 0;
    const saved = frontier.getCursor("main");
    let termIndex = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 0;

    for (let i = termIndex; i < SEARCH_TERMS.length; i++) {
      if (Date.now() > options.deadline) break;
      if (yielded >= options.maxItems) break;

      const term = SEARCH_TERMS[i];
      const url = `https://cvrapi.dk/api?country=dk&search=${encodeURIComponent(term)}`;

      let data;
      try {
        const res = await fetchText(url, {
          timeout: 20000,
          headers: { "User-Agent": "SourcingTool/1.0" },
          cache: options.fetchOpts.cache,
          jitterHostState: options.fetchOpts.jitterHostState,
        });
        if (!res.ok) {
          console.warn(`[${this.id}] HTTP ${res.status} for term "${term}"`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        data = JSON.parse(res.text);
      } catch (err) {
        console.warn(`[${this.id}] Fetch error for "${term}": ${err.message}`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }

      const results = Array.isArray(data) ? data : data.results || [data];

      const companies = results.map((item) => ({
        name: item.name,
        website: item.domain || `https://${item.name?.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.dk`,
        sourceTag: "Registry:DK-CVR",
        country: "DK",
        foundedYear: item.founded ? parseInt(String(item.founded).slice(0, 4), 10) : undefined,
        description: item.industrydesc || undefined,
        rawMetadata: {
          vat: item.vat,
          city: item.city,
          address: item.address,
          zipcode: item.zipcode,
          employees: item.employees,
          phone: item.phone,
        },
      }));

      yielded += companies.length;

      frontier.saveCursor("main", {
        cursorValue: String(i + 1),
        itemsDiscovered: yielded,
        status: i + 1 >= SEARCH_TERMS.length ? "done" : "running",
      });

      yield { companies, cursor: String(i + 1), done: false };

      await new Promise((r) => setTimeout(r, 2000));
    }

    yield { companies: [], cursor: null, done: true };
  }
}
