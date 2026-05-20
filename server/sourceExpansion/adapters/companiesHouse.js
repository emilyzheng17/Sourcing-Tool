import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";

const SIC_CODES = ["62011", "62012", "62020", "62090", "63110", "63120"];
const PAGE_SIZE = 100;

export class CompaniesHouseAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "uk-companies-house",
      name: "UK Companies House",
      tier: 1,
      signalType: "registry",
    });
  }

  async *crawl(frontier, options) {
    const apiKey = options.env.COMPANIES_HOUSE_API_KEY;
    if (!apiKey) {
      console.warn(`[${this.id}] No COMPANIES_HOUSE_API_KEY — skipping`);
      yield { companies: [], cursor: null, done: true };
      return;
    }

    const authHeader = "Basic " + Buffer.from(`${apiKey}:`).toString("base64");
    let yielded = 0;

    for (const sic of SIC_CODES) {
      if (Date.now() > options.deadline) break;
      if (yielded >= options.maxItems) break;

      const cursorKey = `ch-sic-${sic}`;
      const saved = frontier.getCursor(cursorKey);
      let startIndex = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 0;

      while (true) {
        if (Date.now() > options.deadline || yielded >= options.maxItems) break;

        const url =
          `https://api.company-information.service.gov.uk/advanced-search/companies` +
          `?sic_codes=${sic}&size=${PAGE_SIZE}&start_index=${startIndex}&company_status=active`;

        let data;
        try {
          const res = await fetchText(url, {
            timeout: 20000,
            headers: { Authorization: authHeader },
            cache: options.fetchOpts.cache,
            jitterHostState: options.fetchOpts.jitterHostState,
          });
          if (!res.ok) {
            console.warn(`[${this.id}] HTTP ${res.status} for SIC ${sic} at offset ${startIndex}`);
            break;
          }
          data = JSON.parse(res.text);
        } catch (err) {
          console.warn(`[${this.id}] Fetch error for SIC ${sic}: ${err.message}`);
          break;
        }

        const items = data.items || [];
        if (items.length === 0) break;

        const companies = items.map((item) => {
          const registryUrl = `https://find-and-update.company-information.service.gov.uk/company/${item.company_number}`;
          return {
            name: item.company_name,
            website: registryUrl,
            sourceTag: "Registry:UK-CH",
            country: "GB",
            foundedYear: item.date_of_creation ? parseInt(item.date_of_creation.slice(0, 4), 10) : undefined,
            description: `SIC ${sic} — ${item.company_status || "active"}`,
            rawMetadata: {
              companyNumber: item.company_number,
              registryUrl,
              sicCode: sic,
              companyStatus: item.company_status,
              needsWebsiteResolution: true,
            },
          };
        });

        yielded += companies.length;
        startIndex += items.length;

        frontier.saveCursor(cursorKey, {
          cursorValue: String(startIndex),
          itemsDiscovered: yielded,
          status: "running",
        });

        yield { companies, cursor: String(startIndex), done: false };

        if (items.length < PAGE_SIZE) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    yield { companies: [], cursor: null, done: true };
  }
}
