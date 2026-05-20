import * as cheerio from "cheerio";
import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";

const PAGE_SIZE = 50;
const DELAY_MS = 1500;

export class HubspotMarketplaceAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "hubspot-marketplace",
      name: "HubSpot Ecosystem Marketplace",
      tier: 1,
      signalType: "marketplace",
    });
  }

  async *crawl(frontier, options) {
    const { fetchOpts = {}, maxItems = Infinity, deadline = Infinity } = options;
    let totalYielded = 0;

    const cursorKey = "hubspot-marketplace:page";
    const saved = frontier.getCursor(cursorKey);
    let page = saved?.cursorValue ? Number(saved.cursorValue) : 1;
    let itemsDiscovered = saved?.itemsDiscovered ?? 0;

    while (true) {
      if (Date.now() > deadline || totalYielded >= maxItems) break;

      let companies = [];

      // Try the JSON API first
      const apiUrl = `https://ecosystem.hubspot.com/marketplace/api/apps?page=${page}&limit=${PAGE_SIZE}`;
      let usedApi = false;

      try {
        const { ok, text } = await fetchText(apiUrl, {
          timeout: 20000,
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

          if (data && Array.isArray(data.results || data.apps || data.data)) {
            usedApi = true;
            const items = data.results || data.apps || data.data;
            if (items.length === 0) break;

            for (const app of items) {
              const name = app.name || app.title || "Unknown";
              const website = app.website || app.companyUrl || app.url || app.link || null;
              const appUrl = app.slug
                ? `https://ecosystem.hubspot.com/marketplace/apps/${app.slug}`
                : null;

              companies.push({
                name,
                website: website || appUrl || "https://ecosystem.hubspot.com",
                sourceTag: "Marketplace:HubSpot",
                rawMetadata: {
                  hubspotAppUrl: appUrl,
                  vendorName: app.companyName || app.vendor || null,
                  appId: app.id || null,
                },
              });
            }

            if (items.length < PAGE_SIZE) {
              itemsDiscovered += companies.length;
              totalYielded += companies.length;
              frontier.saveCursor(cursorKey, {
                cursorValue: String(page),
                itemsDiscovered,
                status: "done",
              });
              yield { companies, cursor: null, done: true };
              return;
            }
          }
        }
      } catch (err) {
        console.warn(`[hubspot-marketplace] API error page ${page}: ${err.message}`);
      }

      // Fallback: scrape the HTML listing page
      if (!usedApi) {
        try {
          const htmlUrl = `https://ecosystem.hubspot.com/marketplace/apps?page=${page}`;
          const { ok, text } = await fetchText(htmlUrl, {
            timeout: 20000,
            cache: fetchOpts.cache,
            jitterHostState: fetchOpts.jitterHostState,
          });

          if (!ok || !text) break;

          const $ = cheerio.load(text);
          const appCards = $('a[href*="/marketplace/apps/"]').toArray();

          if (appCards.length === 0) break;

          const seen = new Set();
          for (const el of appCards) {
            const href = $(el).attr("href") || "";
            if (!href || seen.has(href) || href === "/marketplace/apps/") continue;
            seen.add(href);

            const name = $(el).text().trim().replace(/\s+/g, " ");
            const fullUrl = href.startsWith("http")
              ? href
              : `https://ecosystem.hubspot.com${href}`;

            companies.push({
              name: name || href.split("/apps/")[1]?.replace(/-/g, " ") || "Unknown",
              website: fullUrl,
              sourceTag: "Marketplace:HubSpot",
              rawMetadata: { hubspotAppUrl: fullUrl, page },
            });
          }

          if (companies.length === 0) break;
        } catch (err) {
          console.warn(`[hubspot-marketplace] Scrape error page ${page}: ${err.message}`);
          break;
        }
      }

      itemsDiscovered += companies.length;
      totalYielded += companies.length;
      page += 1;

      frontier.saveCursor(cursorKey, {
        cursorValue: String(page),
        itemsDiscovered,
        status: "in_progress",
      });

      yield { companies, cursor: `page=${page}`, done: false };

      await delay(DELAY_MS);
    }

    yield { companies: [], cursor: null, done: true };
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
