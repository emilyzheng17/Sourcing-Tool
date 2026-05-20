import { BaseAdapter } from "./base.js";
import { fetchHtml } from "../../lib/fetchHtml.js";

const BASE_URL =
  "https://www.allabolag.se/bransch/informations-och-kommunikationsverksamhet/programvaruproduktion";

export class BolagsverketAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "se-bolagsverket",
      name: "Sweden Bolagsverket (allabolag.se)",
      tier: 1,
      signalType: "registry",
    });
  }

  async *crawl(frontier, options) {
    const saved = frontier.getCursor("main");
    let page = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 1;
    let yielded = saved?.itemsDiscovered || 0;

    while (true) {
      if (Date.now() > options.deadline || yielded >= options.maxItems) break;

      const url = page === 1 ? BASE_URL : `${BASE_URL}?page=${page}`;

      let html;
      try {
        const res = await fetchHtml(url, {
          timeout: 20000,
          cache: options.fetchOpts.cache,
          jitterHostState: options.fetchOpts.jitterHostState,
        });
        if (!res.ok || res.blockedHint) {
          console.warn(`[${this.id}] HTTP ${res.status} on page ${page} (blocked: ${res.blockedHint})`);
          break;
        }
        html = res.text;
      } catch (err) {
        console.warn(`[${this.id}] Fetch error page ${page}: ${err.message}`);
        break;
      }

      const companies = parseCompanyList(html);
      if (companies.length === 0) break;

      yielded += companies.length;
      page += 1;

      frontier.saveCursor("main", {
        cursorValue: String(page),
        itemsDiscovered: yielded,
        status: "running",
      });

      yield { companies, cursor: String(page), done: false };

      await new Promise((r) => setTimeout(r, 2000));
    }

    yield { companies: [], cursor: null, done: true };
  }
}

function parseCompanyList(html) {
  const companies = [];
  const linkRegex = /<a[^>]+href="\/([a-z0-9]+\/[^"]+)"[^>]*class="[^"]*company[^"]*"[^>]*>([^<]+)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const slug = match[1];
    const name = match[2].trim();
    if (name) {
      companies.push({
        name,
        website: `https://${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.se`,
        sourceTag: "Registry:SE-BV",
        country: "SE",
        rawMetadata: {
          allabolagUrl: `https://www.allabolag.se/${slug}`,
        },
      });
    }
  }

  if (companies.length === 0) {
    const fallbackRegex = /<h[23][^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    while ((match = fallbackRegex.exec(html)) !== null) {
      const href = match[1];
      const name = match[2].trim();
      if (name && !name.includes("Sida") && name.length > 2) {
        companies.push({
          name,
          website: `https://${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.se`,
          sourceTag: "Registry:SE-BV",
          country: "SE",
          rawMetadata: {
            allabolagUrl: href.startsWith("http") ? href : `https://www.allabolag.se${href}`,
          },
        });
      }
    }
  }

  return companies;
}
