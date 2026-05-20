import * as cheerio from "cheerio";
import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";

const PAGE_SIZE = 50;
const DELAY_MS = 2000;

export class SalesforceAppExchangeAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "salesforce-appexchange",
      name: "Salesforce AppExchange",
      tier: 1,
      signalType: "marketplace",
    });
  }

  async *crawl(frontier, options) {
    const { fetchOpts = {}, maxItems = Infinity, deadline = Infinity } = options;
    let totalYielded = 0;

    const cursorKey = "salesforce-appexchange:offset";
    const saved = frontier.getCursor(cursorKey);
    let offset = saved?.cursorValue ? Number(saved.cursorValue) : 0;
    let itemsDiscovered = saved?.itemsDiscovered ?? 0;

    while (true) {
      if (Date.now() > deadline || totalYielded >= maxItems) break;

      let companies = [];
      let gotResults = false;

      // Try the search API first
      const apiUrl = `https://appexchange.salesforce.com/appxSearchService?searchContext=ALL&term=*&start=${offset}&num=${PAGE_SIZE}`;

      try {
        const { ok, text } = await fetchText(apiUrl, {
          timeout: 25000,
          cache: fetchOpts.cache,
          jitterHostState: fetchOpts.jitterHostState,
        });

        if (ok && text) {
          let data;
          try {
            data = JSON.parse(text);
          } catch {
            data = null;
          }

          const results = data?.results || data?.appxSearchResults || data?.listings;
          if (Array.isArray(results) && results.length > 0) {
            gotResults = true;

            for (const item of results) {
              const name = item.appName || item.name || item.title || "Unknown";
              const listingUrl = item.listingId
                ? `https://appexchange.salesforce.com/appxListingDetail?listingId=${item.listingId}`
                : item.url || null;
              const companyWebsite = item.companyUrl || item.website || item.vendorUrl || null;

              companies.push({
                name,
                website: companyWebsite || listingUrl || "https://appexchange.salesforce.com",
                sourceTag: "Marketplace:Salesforce",
                rawMetadata: {
                  listingId: item.listingId || null,
                  appExchangeUrl: listingUrl,
                  vendorName: item.companyName || item.vendor || null,
                },
              });
            }

            if (results.length < PAGE_SIZE) {
              itemsDiscovered += companies.length;
              totalYielded += companies.length;
              frontier.saveCursor(cursorKey, {
                cursorValue: String(offset + results.length),
                itemsDiscovered,
                status: "done",
              });
              yield { companies, cursor: null, done: true };
              return;
            }
          }
        }
      } catch (err) {
        console.warn(`[salesforce-appexchange] API error at offset ${offset}: ${err.message}`);
      }

      // Fallback: scrape the listing page
      if (!gotResults) {
        try {
          const pageNum = Math.floor(offset / PAGE_SIZE) + 1;
          const htmlUrl = `https://appexchange.salesforce.com/appxStore?type=App&page=${pageNum}`;
          const { ok, text } = await fetchText(htmlUrl, {
            timeout: 25000,
            cache: fetchOpts.cache,
            jitterHostState: fetchOpts.jitterHostState,
          });

          if (!ok || !text) break;

          const $ = cheerio.load(text);
          const listings = $('a[href*="appxListingDetail"], a[href*="/listing/"]').toArray();

          if (listings.length === 0) break;

          const seen = new Set();
          for (const el of listings) {
            const href = $(el).attr("href") || "";
            if (!href || seen.has(href)) continue;
            seen.add(href);

            const name = $(el).text().trim().replace(/\s+/g, " ");
            const fullUrl = href.startsWith("http")
              ? href
              : `https://appexchange.salesforce.com${href}`;

            companies.push({
              name: name || "Unknown",
              website: fullUrl,
              sourceTag: "Marketplace:Salesforce",
              rawMetadata: { appExchangeUrl: fullUrl, page: pageNum },
            });
          }

          if (companies.length === 0) break;
        } catch (err) {
          console.warn(`[salesforce-appexchange] Scrape error at offset ${offset}: ${err.message}`);
          break;
        }
      }

      itemsDiscovered += companies.length;
      totalYielded += companies.length;
      offset += PAGE_SIZE;

      frontier.saveCursor(cursorKey, {
        cursorValue: String(offset),
        itemsDiscovered,
        status: "in_progress",
      });

      yield { companies, cursor: `offset=${offset}`, done: false };

      await delay(DELAY_MS);
    }

    yield { companies: [], cursor: null, done: true };
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
