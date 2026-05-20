import * as cheerio from "cheerio";
import { BaseAdapter } from "./base.js";
import { fetchHtml } from "../../lib/fetchHtml.js";
import { tryPlaywrightFallback } from "../../lib/playwrightRender.js";

const CATEGORIES = [
  "store-management", "marketing", "sales", "orders-and-shipping",
  "customer-support", "trust-and-security", "finances", "productivity",
  "inventory-management", "reporting",
];

const DELAY_MS = 1500;
const SHOPIFY_HOSTS = new Set(["apps.shopify.com"]);

export class ShopifyAppsAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "shopify-apps",
      name: "Shopify App Store",
      tier: 1,
      signalType: "marketplace",
    });
  }

  async *crawl(frontier, options) {
    const { fetchOpts = {}, maxItems = Infinity, deadline = Infinity } = options;
    let totalYielded = 0;

    for (const category of CATEGORIES) {
      if (Date.now() > deadline || totalYielded >= maxItems) break;

      const cursorKey = `shopify-apps:${category}`;
      const saved = frontier.getCursor(cursorKey);
      let page = saved?.cursorValue ? Number(saved.cursorValue) : 1;
      let categoryItems = saved?.itemsDiscovered ?? 0;

      while (true) {
        if (Date.now() > deadline || totalYielded >= maxItems) break;

        const url = page === 1
          ? `https://apps.shopify.com/browse/${category}`
          : `https://apps.shopify.com/browse/${category}?page=${page}`;

        let companies = [];

        try {
          let r = await fetchHtml(url, {
            timeout: 20000,
            cache: fetchOpts.cache,
            jitterHostState: fetchOpts.jitterHostState,
          });

          if ((!r.ok || !r.text || r.text.length < 600 || r.blockedHint) && process.env.PLAYWRIGHT === "1") {
            const pw = await tryPlaywrightFallback(url, { allowedHosts: SHOPIFY_HOSTS });
            if (pw?.text) r = { ...r, text: pw.text, ok: true };
          }

          if (!r.ok || !r.text || r.text.length < 200) break;

          const $ = cheerio.load(r.text);
          const appLinks = $('a[href*="/apps/"]').toArray();

          if (appLinks.length === 0) break;

          const seen = new Set();
          for (const el of appLinks) {
            const href = $(el).attr("href") || "";
            if (!href || !href.includes("/apps/") || href === "/apps/" || seen.has(href)) continue;

            const slug = href.split("/apps/")[1]?.split("?")[0]?.split("/")[0];
            if (!slug || slug === "browse") continue;
            seen.add(href);

            const name = $(el).text().trim().replace(/\s+/g, " ");
            const appUrl = `https://apps.shopify.com/apps/${slug}`;

            companies.push({
              name: name || slug.replace(/-/g, " "),
              website: appUrl,
              sourceTag: "Marketplace:Shopify",
              rawMetadata: { shopifyAppUrl: appUrl, category, page },
            });
          }
        } catch (err) {
          console.warn(`[shopify-apps] Error scraping ${category} page ${page}: ${err.message}`);
          break;
        }

        categoryItems += companies.length;
        totalYielded += companies.length;
        page += 1;

        frontier.saveCursor(cursorKey, {
          cursorValue: String(page),
          itemsDiscovered: categoryItems,
          status: "in_progress",
          metadata: { category },
        });

        yield { companies, cursor: `${category}:page=${page}`, done: false };

        await delay(DELAY_MS);
      }

      frontier.saveCursor(cursorKey, {
        cursorValue: String(page),
        itemsDiscovered: categoryItems,
        status: "done",
        metadata: { category },
      });
    }

    yield { companies: [], cursor: null, done: true };
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
