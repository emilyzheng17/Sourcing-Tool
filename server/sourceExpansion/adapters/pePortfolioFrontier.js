import { BaseAdapter } from "./base.js";
import { PE_FIRMS } from "../../sources/peFirms.data.js";
import { harvestPortfolioLikePage } from "../../sources/portfolioHarvest.js";

const ADDITIONAL_ACQUIRERS = [
  { id: "constellation", name: "Constellation Software", portfolioUrl: "https://www.csisoftware.com/operating-groups" },
  { id: "jonas", name: "Jonas Software", portfolioUrl: "https://www.jonassoftware.com/companies" },
  { id: "volaris", name: "Volaris Group", portfolioUrl: "https://volarisgroup.com/our-businesses/" },
  { id: "topicus", name: "Topicus", portfolioUrl: "https://topicus.com/en/portfolio/" },
  { id: "tss", name: "Total Specific Solutions", portfolioUrl: "https://www.totalspecificsolutions.com/our-companies/" },
  { id: "harris", name: "N. Harris Computer Corporation", portfolioUrl: "https://www.harriscomputer.com/companies" },
  { id: "perseus", name: "Perseus Operating Group", portfolioUrl: "https://www.perseusog.com/our-businesses/" },
  { id: "lumine", name: "Lumine Group", portfolioUrl: "https://www.luminegroup.com/businesses/" },
];

const ALL_FIRMS = [...PE_FIRMS, ...ADDITIONAL_ACQUIRERS];
const DELAY_MS = 2000;

export class PePortfolioFrontierAdapter extends BaseAdapter {
  constructor() {
    super({
      id: "pe-portfolio-frontier",
      name: "Exhaustive PE Portfolio Crawl",
      tier: 1,
      signalType: "pe",
    });
  }

  async *crawl(frontier, options) {
    const { fetchOpts = {}, maxItems = Infinity, deadline = Infinity } = options;
    let totalYielded = 0;

    for (const firm of ALL_FIRMS) {
      if (Date.now() > deadline || totalYielded >= maxItems) break;

      const cursorKey = `pe-portfolio-frontier:${firm.id}`;
      const saved = frontier.getCursor(cursorKey);

      if (saved?.status === "done") continue;

      let companies = [];

      try {
        const results = await harvestPortfolioLikePage(
          firm.portfolioUrl,
          firm.name,
          "PE",
          "pe",
          {
            cache: fetchOpts.cache,
            jitterHostState: fetchOpts.jitterHostState,
          },
        );

        for (const r of results) {
          companies.push({
            name: r.name,
            website: r.website,
            sourceTag: `PE:${firm.name}`,
            rawMetadata: {
              ...r.rawMetadata,
              firmId: firm.id,
              portfolioUrl: firm.portfolioUrl,
            },
          });
        }
      } catch (err) {
        console.warn(`[pe-portfolio-frontier] Error harvesting ${firm.name}: ${err.message}`);
      }

      totalYielded += companies.length;

      frontier.saveCursor(cursorKey, {
        cursorValue: "complete",
        itemsDiscovered: companies.length,
        status: "done",
        metadata: { firmId: firm.id, firmName: firm.name },
      });

      yield {
        companies,
        cursor: `firm:${firm.id}`,
        done: false,
      };

      await delay(DELAY_MS);
    }

    yield { companies: [], cursor: null, done: true };
  }
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
