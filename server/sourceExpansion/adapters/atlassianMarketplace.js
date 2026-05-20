import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";

const PAGE_SIZE = 50;
const DELAY_MS = 1000;

export class AtlassianMarketplaceAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "atlassian-marketplace",
      name: "Atlassian Marketplace",
      tier: 1,
      signalType: "marketplace",
    });
  }

  async *crawl(frontier, options) {
    const { fetchOpts = {}, maxItems = Infinity, deadline = Infinity } = options;
    let totalYielded = 0;

    const cursorKey = "atlassian-marketplace:offset";
    const saved = frontier.getCursor(cursorKey);
    let offset = saved?.cursorValue ? Number(saved.cursorValue) : 0;
    let itemsDiscovered = saved?.itemsDiscovered ?? 0;

    while (true) {
      if (Date.now() > deadline || totalYielded >= maxItems) break;

      const url = `https://marketplace.atlassian.com/rest/2/addons?limit=${PAGE_SIZE}&offset=${offset}`;
      let companies = [];

      try {
        const { ok, text } = await fetchText(url, {
          timeout: 20000,
          cache: fetchOpts.cache,
          jitterHostState: fetchOpts.jitterHostState,
        });

        if (!ok || !text) break;

        let data;
        try {
          data = JSON.parse(text);
        } catch {
          console.warn(`[atlassian-marketplace] Invalid JSON at offset ${offset}`);
          break;
        }

        const addons = data?._embedded?.addons;
        if (!Array.isArray(addons) || addons.length === 0) break;

        for (const addon of addons) {
          const name = addon?.name || addon?.key || "Unknown";
          const marketplaceUrl = addon?._links?.alternate?.href
            ? `https://marketplace.atlassian.com${addon._links.alternate.href}`
            : null;
          const vendorName = addon?.vendor?.name || null;
          const vendorUrl = addon?.vendor?._links?.alternate?.href || null;

          companies.push({
            name: vendorName || name,
            website: vendorUrl || marketplaceUrl || `https://marketplace.atlassian.com`,
            sourceTag: "Marketplace:Atlassian",
            rawMetadata: {
              addonKey: addon?.key,
              addonName: name,
              vendorName,
              marketplaceUrl,
              vendorUrl,
            },
          });
        }

        if (addons.length < PAGE_SIZE) {
          itemsDiscovered += companies.length;
          totalYielded += companies.length;
          frontier.saveCursor(cursorKey, {
            cursorValue: String(offset + addons.length),
            itemsDiscovered,
            status: "done",
          });
          yield { companies, cursor: null, done: true };
          return;
        }
      } catch (err) {
        console.warn(`[atlassian-marketplace] Error at offset ${offset}: ${err.message}`);
        break;
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
