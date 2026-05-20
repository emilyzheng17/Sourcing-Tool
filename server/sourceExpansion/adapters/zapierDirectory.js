import { BaseAdapter } from "./base.js";
import { fetchHtml } from "../../lib/fetchHtml.js";
import { tryPlaywrightFallback } from "../../lib/playwrightRender.js";
import * as cheerio from "cheerio";

const PAGE_SIZE = 50;
const ZAPIER_HOSTS = new Set(["zapier.com", "www.zapier.com"]);

export class ZapierDirectoryAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "zapier-directory",
      name: "Zapier Integration Directory",
      tier: 2,
      signalType: "ecosystem",
    });
  }

  async *crawl(frontier, options) {
    let yielded = 0;

    const cursorKey = "zapier-dir-page";
    const saved = frontier.getCursor(cursorKey);
    let page = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 1;

    while (true) {
      if (Date.now() > options.deadline || yielded >= options.maxItems) break;

      const companies = await this._fetchPage(page, options);
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
      await new Promise((r) => setTimeout(r, 2000));
    }

    yield { companies: [], cursor: null, done: true };
  }

  async _fetchPage(page, options) {
    const url = `https://zapier.com/apps?page=${page}`;

    try {
      let r = await fetchHtml(url, {
        timeout: 20000,
        cache: options.fetchOpts.cache,
        jitterHostState: options.fetchOpts.jitterHostState,
      });

      if ((!r.ok || !r.text || r.text.length < 600 || r.blockedHint) && process.env.PLAYWRIGHT === "1") {
        const pw = await tryPlaywrightFallback(url, { allowedHosts: ZAPIER_HOSTS });
        if (pw?.text) r = { ...r, text: pw.text, ok: true };
      }

      if (!r.ok || !r.text || r.text.length < 200) {
        if (!r.ok) console.warn(`[${this.id}] Endpoint returned ${r.status} for page=${page} — adapter may need URL update`);
        return [];
      }

      const $ = cheerio.load(r.text);
      const companies = [];

      $("a[href*='/apps/'], .app-card, .integration-card, [data-testid='app-card']").each((_, el) => {
        const appName = $(el).find("span, h3, h4, .app-name").first().text().trim() || $(el).text().trim();
        const href = $(el).attr("href") || $(el).find("a").first().attr("href") || "";
        const appUrl = href.startsWith("http") ? href : href ? `https://zapier.com${href}` : "";

        if (appName && appName.length < 100) {
          companies.push({
            name: appName,
            website: appUrl,
            sourceTag: "Ecosystem:Zapier",
            rawMetadata: { appName, zapierUrl: appUrl },
          });
        }
      });

      const seen = new Set();
      return companies.filter((c) => {
        const key = c.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } catch (err) {
      console.error(`[${this.id}] Error fetching page=${page}: ${err.message}`);
      return [];
    }
  }
}
