import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";
import { fetchHtml } from "../../lib/fetchHtml.js";

const SEARCH_TERMS = ["software", "saas", "technology platform", "cloud computing"];

export class AsicAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "au-abn",
      name: "Australia ASIC / ABN Lookup",
      tier: 1,
      signalType: "registry",
    });
  }

  async *crawl(frontier, options) {
    const guid = options.env.ABN_LOOKUP_GUID;
    let yielded = 0;
    const saved = frontier.getCursor("main");
    let termIndex = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 0;

    for (let i = termIndex; i < SEARCH_TERMS.length; i++) {
      if (Date.now() > options.deadline || yielded >= options.maxItems) break;

      const term = SEARCH_TERMS[i];
      let companies;

      if (guid) {
        companies = await this._fetchViaApi(term, guid, options);
      } else {
        companies = await this._fetchViaScrape(term, options);
      }

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

  async _fetchViaApi(term, guid, options) {
    const url =
      `https://abr.business.gov.au/json/MatchingNames.aspx` +
      `?name=${encodeURIComponent(term)}&maxResults=100&guid=${guid}`;

    try {
      const res = await fetchText(url, {
        timeout: 20000,
        cache: options.fetchOpts.cache,
        jitterHostState: options.fetchOpts.jitterHostState,
      });
      if (!res.ok) {
        console.warn(`[${this.id}] API HTTP ${res.status} for "${term}"`);
        return [];
      }

      const jsonStr = res.text.replace(/^callback\(/, "").replace(/\)$/, "");
      const data = JSON.parse(jsonStr);
      const names = data?.Names || [];

      return names.map((item) => ({
        name: item.Name || item.BusinessName || "",
        website: `https://${(item.Name || "").toLowerCase().replace(/[^a-z0-9]+/g, "")}.com.au`,
        sourceTag: "Registry:AU-ABN",
        country: "AU",
        description: item.NameType || undefined,
        rawMetadata: {
          abn: item.Abn,
          abnStatus: item.AbnStatus,
          state: item.State,
          postcode: item.Postcode,
          score: item.Score,
        },
      }));
    } catch (err) {
      console.warn(`[${this.id}] API error for "${term}": ${err.message}`);
      return [];
    }
  }

  async _fetchViaScrape(term, options) {
    const url =
      `https://abr.business.gov.au/Search/ResultsActive` +
      `?SearchText=${encodeURIComponent(term + " company")}`;

    try {
      const res = await fetchHtml(url, {
        timeout: 20000,
        cache: options.fetchOpts.cache,
        jitterHostState: options.fetchOpts.jitterHostState,
      });
      if (!res.ok || res.blockedHint) {
        console.warn(`[${this.id}] Scrape HTTP ${res.status} for "${term}"`);
        return [];
      }

      return parseAbnResults(res.text);
    } catch (err) {
      console.warn(`[${this.id}] Scrape error for "${term}": ${err.message}`);
      return [];
    }
  }
}

function parseAbnResults(html) {
  const companies = [];
  const rowRegex = /<td[^>]*>[\s\S]*?<a[^>]+href="[^"]*Abn=(\d+)"[^>]*>([^<]+)<\/a>[\s\S]*?<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(html)) !== null) {
    const abn = match[1];
    const name = match[2].trim();
    if (name) {
      companies.push({
        name,
        website: `https://${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com.au`,
        sourceTag: "Registry:AU-ABN",
        country: "AU",
        rawMetadata: { abn },
      });
    }
  }
  return companies;
}
