import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";
import * as cheerio from "cheerio";

const SEARCH_TERMS = ["software", "technology", "saas", "cloud"];
const PAGE_SIZE = 25;

export class NzCompaniesOfficeAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "nz-companies-office",
      name: "New Zealand Companies Office",
      tier: 2,
      signalType: "registry",
    });
  }

  async *crawl(frontier, options) {
    let yielded = 0;

    for (const term of SEARCH_TERMS) {
      if (Date.now() > options.deadline) break;
      if (yielded >= options.maxItems) break;

      const cursorKey = `nz-co-${term}`;
      const saved = frontier.getCursor(cursorKey);
      let offset = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 0;

      while (true) {
        if (Date.now() > options.deadline || yielded >= options.maxItems) break;

        const companies = await this._fetchPage(term, offset, options);
        if (companies.length === 0) break;

        yielded += companies.length;
        offset += companies.length;

        frontier.saveCursor(cursorKey, {
          cursorValue: String(offset),
          itemsDiscovered: yielded,
          status: "running",
        });

        yield { companies, cursor: String(offset), done: false };

        if (companies.length < PAGE_SIZE) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    yield { companies: [], cursor: null, done: true };
  }

  async _fetchPage(term, offset, options) {
    const url =
      `https://app.companiesoffice.govt.nz/companies/app/ui/pages/companies/search` +
      `?q=${encodeURIComponent(term)}&start=${offset}&limit=${PAGE_SIZE}`;

    try {
      const res = await fetchText(url, {
        timeout: 20000,
        cache: options.fetchOpts.cache,
        jitterHostState: options.fetchOpts.jitterHostState,
      });
      if (!res.ok) {
        console.error(`[${this.id}] HTTP ${res.status} for term="${term}" offset=${offset}`);
        return [];
      }

      const jsonData = this._tryParseJson(res.text);
      if (jsonData) {
        return this._parseJsonResponse(jsonData, term);
      }

      return this._parseHtmlResponse(res.text, term);
    } catch (err) {
      console.error(`[${this.id}] Error fetching term="${term}" offset=${offset}: ${err.message}`);
      return [];
    }
  }

  _parseJsonResponse(data, term) {
    const items = data.companies || data.results || data.items || [];
    return items.map((item) => ({
      name: item.companyName || item.name || "",
      website: "",
      sourceTag: "Registry:NZ-CO",
      country: "NZ",
      rawMetadata: {
        companyNumber: item.companyNumber || item.nzbn || "",
        status: item.companyStatus || item.status || "",
        searchTerm: term,
        registryUrl: item.companyNumber
          ? `https://app.companiesoffice.govt.nz/companies/app/ui/pages/companies/${item.companyNumber}`
          : "",
      },
    })).filter((c) => c.name);
  }

  _parseHtmlResponse(html, term) {
    const $ = cheerio.load(html);
    const companies = [];

    $("table tbody tr, .search-result, .company-row, [data-company-number]").each((_, el) => {
      const cells = $(el).find("td");
      const name = cells.eq(0).text().trim() ||
        $(el).find(".company-name, a").first().text().trim();
      const companyNumber = cells.eq(1).text().trim() ||
        $(el).attr("data-company-number") || "";
      const status = cells.eq(2).text().trim() || "";

      if (name && name.length > 2) {
        companies.push({
          name,
          website: "",
          sourceTag: "Registry:NZ-CO",
          country: "NZ",
          rawMetadata: {
            companyNumber,
            status,
            searchTerm: term,
            registryUrl: companyNumber
              ? `https://app.companiesoffice.govt.nz/companies/app/ui/pages/companies/${companyNumber}`
              : "",
          },
        });
      }
    });

    return companies;
  }

  _tryParseJson(text) {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}
