import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";

const NACE_CODES = ["62.01", "62.02", "62.09", "63.11"];
const PAGE_SIZE = 100;

export class BronnoysundAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "no-brreg",
      name: "Norway Brønnøysund Register",
      tier: 1,
      signalType: "registry",
    });
  }

  async *crawl(frontier, options) {
    let yielded = 0;

    for (const nace of NACE_CODES) {
      if (Date.now() > options.deadline) break;
      if (yielded >= options.maxItems) break;

      const cursorKey = `brreg-nace-${nace}`;
      const saved = frontier.getCursor(cursorKey);
      let page = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 0;

      while (true) {
        if (Date.now() > options.deadline || yielded >= options.maxItems) break;

        const url =
          `https://data.brreg.no/enhetsregisteret/api/enheter` +
          `?naeringskode=${encodeURIComponent(nace)}&page=${page}&size=${PAGE_SIZE}`;

        let data;
        try {
          const res = await fetchText(url, {
            timeout: 20000,
            headers: { Accept: "application/json" },
            cache: options.fetchOpts.cache,
            jitterHostState: options.fetchOpts.jitterHostState,
          });
          if (!res.ok) {
            console.warn(`[${this.id}] HTTP ${res.status} for NACE ${nace} page ${page}`);
            break;
          }
          data = JSON.parse(res.text);
        } catch (err) {
          console.warn(`[${this.id}] Fetch error for NACE ${nace}: ${err.message}`);
          break;
        }

        const items = data?._embedded?.enheter || [];
        if (items.length === 0) break;

        const companies = items.map((item) => {
          const hasRealWebsite = !!item.hjemmeside;
          const registryUrl = `https://data.brreg.no/enhetsregisteret/api/enheter/${item.organisasjonsnummer}`;
          return {
            name: item.navn,
            website: item.hjemmeside || registryUrl,
            sourceTag: "Registry:NO-BRREG",
            country: item.forretningsadresse?.land || "NO",
            foundedYear: item.stiftelsesdato ? parseInt(item.stiftelsesdato.slice(0, 4), 10) : undefined,
            employees: item.antallAnsatte || undefined,
            description: `NACE ${nace}`,
            rawMetadata: {
              organisasjonsnummer: item.organisasjonsnummer,
              organisasjonsform: item.organisasjonsform?.kode,
              naeringskode: nace,
              kommune: item.forretningsadresse?.kommune,
              poststed: item.forretningsadresse?.poststed,
              registryUrl,
              needsWebsiteResolution: !hasRealWebsite,
            },
          };
        });

        yielded += companies.length;
        page += 1;

        frontier.saveCursor(cursorKey, {
          cursorValue: String(page),
          itemsDiscovered: yielded,
          status: "running",
        });

        yield { companies, cursor: String(page), done: false };

        if (items.length < PAGE_SIZE) break;
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    yield { companies: [], cursor: null, done: true };
  }
}
