import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";

const BUSINESS_LINES = ["62010", "62020", "62090", "63110"];
const PAGE_SIZE = 100;

export class PrhAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "fi-prh",
      name: "Finland PRH",
      tier: 1,
      signalType: "registry",
    });
  }

  async *crawl(frontier, options) {
    let yielded = 0;

    for (const lineCode of BUSINESS_LINES) {
      if (Date.now() > options.deadline) break;
      if (yielded >= options.maxItems) break;

      const cursorKey = `prh-line-${lineCode}`;
      const saved = frontier.getCursor(cursorKey);
      let resultsFrom = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 0;

      while (true) {
        if (Date.now() > options.deadline || yielded >= options.maxItems) break;

        const url =
          `https://avoindata.prh.fi/bis/v1` +
          `?totalResults=true&maxResults=${PAGE_SIZE}&businessLineCode=${lineCode}&resultsFrom=${resultsFrom}`;

        let data;
        try {
          const res = await fetchText(url, {
            timeout: 25000,
            cache: options.fetchOpts.cache,
            jitterHostState: options.fetchOpts.jitterHostState,
          });
          if (!res.ok) {
            console.warn(`[${this.id}] HTTP ${res.status} for businessLineCode ${lineCode} offset ${resultsFrom} — adapter may need URL update`);
            break;
          }
          data = JSON.parse(res.text);
        } catch (err) {
          console.warn(`[${this.id}] Fetch error for businessLineCode ${lineCode}: ${err.message}`);
          break;
        }

        const results = data?.results || [];
        if (results.length === 0) break;

        const companies = results.map((item) => {
          const regDate = item.registrationDate || "";
          const hasRealWebsite = !!item.website;
          const registryUrl = `https://avoindata.prh.fi/bis/v1/${item.businessId}`;
          return {
            name: item.name,
            website: item.website || registryUrl,
            sourceTag: "Registry:FI-PRH",
            country: "FI",
            foundedYear: regDate ? parseInt(regDate.slice(0, 4), 10) : undefined,
            description: `${item.companyForm || ""} — businessLineCode ${lineCode}`.trim(),
            rawMetadata: {
              businessId: item.businessId,
              companyForm: item.companyForm,
              registrationDate: regDate,
              businessLine: lineCode,
              registryUrl,
              needsWebsiteResolution: !hasRealWebsite,
            },
          };
        });

        yielded += companies.length;
        resultsFrom += results.length;

        frontier.saveCursor(cursorKey, {
          cursorValue: String(resultsFrom),
          itemsDiscovered: yielded,
          status: "running",
        });

        yield { companies, cursor: String(resultsFrom), done: false };

        if (results.length < PAGE_SIZE) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    yield { companies: [], cursor: null, done: true };
  }
}
