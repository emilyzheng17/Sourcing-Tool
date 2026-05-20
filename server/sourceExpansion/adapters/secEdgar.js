import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";

const SEARCH_QUERIES = [
  "vertical software",
  "saas platform",
  "b2b software",
  "enterprise software",
  "cloud platform",
];
const PAGE_SIZE = 100;

export class SecEdgarAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "us-sec-edgar",
      name: "US SEC EDGAR",
      tier: 2,
      signalType: "registry",
    });
  }

  async *crawl(frontier, options) {
    const email = options.env.SEC_EDGAR_EMAIL || "sourcing-tool@example.com";
    let yielded = 0;

    for (let qi = 0; qi < SEARCH_QUERIES.length; qi++) {
      if (Date.now() > options.deadline || yielded >= options.maxItems) break;

      const query = SEARCH_QUERIES[qi];
      const cursorKey = `edgar-q-${qi}`;
      const saved = frontier.getCursor(cursorKey);
      let offset = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 0;

      while (true) {
        if (Date.now() > options.deadline || yielded >= options.maxItems) break;

        const url =
          `https://efts.sec.gov/LATEST/search-index` +
          `?q=${encodeURIComponent(`"${query}"`)}&forms=10-K&from=${offset}`;

        let data;
        try {
          const res = await fetchText(url, {
            timeout: 25000,
            headers: {
              "User-Agent": `SourcingTool/1.0 (${email})`,
              Accept: "application/json",
            },
            cache: options.fetchOpts.cache,
            jitterHostState: options.fetchOpts.jitterHostState,
          });
          if (!res.ok) {
            console.warn(`[${this.id}] Endpoint returned ${res.status} for query "${query}" offset ${offset} — adapter may need URL update`);
            break;
          }
          data = JSON.parse(res.text);
        } catch (err) {
          console.warn(`[${this.id}] Fetch error for "${query}": ${err.message}`);
          break;
        }

        const hits = data?.hits?.hits || data?.hits || [];
        if (hits.length === 0) break;

        const seen = new Set();
        const companies = [];

        for (const hit of hits) {
          const source = hit._source || hit;
          const name = source.entity_name || source.display_names?.[0] || "";
          if (!name || seen.has(name)) continue;
          seen.add(name);

          const cik = source.entity_id || source.cik || "";
          const registryUrl = cik
            ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K&dateb=&owner=include&count=40`
            : `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(name)}`;

          companies.push({
            name,
            website: registryUrl,
            sourceTag: "Registry:US-SEC",
            country: "US",
            description: `10-K filer — "${query}"`,
            rawMetadata: {
              fileNumber: source.file_num,
              fileDate: source.file_date,
              formType: source.form_type || "10-K",
              cik,
              publicCompany: true,
              registryUrl,
              needsWebsiteResolution: true,
            },
          });
        }

        yielded += companies.length;
        offset += hits.length;

        frontier.saveCursor(cursorKey, {
          cursorValue: String(offset),
          itemsDiscovered: yielded,
          status: "running",
        });

        yield { companies, cursor: String(offset), done: false };

        if (hits.length < PAGE_SIZE) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    yield { companies: [], cursor: null, done: true };
  }
}
