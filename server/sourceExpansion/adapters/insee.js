import { BaseAdapter } from "./base.js";
import { fetchText } from "../../lib/fetchText.js";

const NAF_CODES = ["62.01Z", "62.02A", "62.02B", "62.03Z", "62.09Z", "63.11Z", "63.12Z"];
const PAGE_LIMIT = 100;

export class InseeAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "fr-insee",
      name: "France INSEE SIRENE",
      tier: 2,
      signalType: "registry",
    });
  }

  async *crawl(frontier, options) {
    const apiKey = options.env.INSEE_API_KEY;
    if (!apiKey) {
      console.warn(`[${this.id}] No INSEE_API_KEY — skipping`);
      yield { companies: [], cursor: null, done: true };
      return;
    }

    let yielded = 0;

    for (const naf of NAF_CODES) {
      if (Date.now() > options.deadline) break;
      if (yielded >= options.maxItems) break;

      const cursorKey = `insee-naf-${naf}`;
      const saved = frontier.getCursor(cursorKey);
      let offset = saved?.cursorValue ? parseInt(saved.cursorValue, 10) : 0;

      while (true) {
        if (Date.now() > options.deadline || yielded >= options.maxItems) break;

        const companies = await this._fetchPage(naf, offset, apiKey, options);
        if (companies.length === 0) break;

        yielded += companies.length;
        offset += companies.length;

        frontier.saveCursor(cursorKey, {
          cursorValue: String(offset),
          itemsDiscovered: yielded,
          status: "running",
        });

        yield { companies, cursor: String(offset), done: false };

        if (companies.length < PAGE_LIMIT) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    yield { companies: [], cursor: null, done: true };
  }

  async _fetchPage(nafCode, offset, apiKey, options) {
    const nafParam = encodeURIComponent(nafCode);
    const url =
      `https://api.insee.fr/entreprises/sirene/V3.11/siret` +
      `?q=activitePrincipaleUniteLegale:${nafParam}` +
      `&debut=${offset}&nombre=${PAGE_LIMIT}`;

    try {
      const res = await fetchText(url, {
        timeout: 25000,
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: options.fetchOpts.cache,
        jitterHostState: options.fetchOpts.jitterHostState,
      });

      if (!res.ok) {
        console.error(`[${this.id}] HTTP ${res.status} for NAF=${nafCode} offset=${offset}`);
        return [];
      }

      const data = JSON.parse(res.text);
      const etablissements = data.etablissements || [];

      return etablissements.map((etab) => {
        const ul = etab.uniteLegale || {};
        const name =
          ul.denominationUniteLegale ||
          ul.denominationUsuelle1UniteLegale ||
          `${ul.prenomUsuelUniteLegale || ""} ${ul.nomUniteLegale || ""}`.trim();
        const siren = etab.siren || "";
        const founded = ul.dateCreationUniteLegale || "";
        const size = ul.trancheEffectifsUniteLegale || "";

        return {
          name,
          website: "",
          sourceTag: "Registry:FR-INSEE",
          country: "FR",
          foundedYear: founded ? parseInt(founded.slice(0, 4), 10) : undefined,
          rawMetadata: {
            siren,
            siret: etab.siret,
            nafCode,
            trancheEffectifs: size,
            dateCreation: founded,
          },
        };
      }).filter((c) => c.name);
    } catch (err) {
      console.error(`[${this.id}] Error fetching NAF=${nafCode} offset=${offset}: ${err.message}`);
      return [];
    }
  }
}
