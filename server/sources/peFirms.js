import { PE_FIRMS } from "./peFirms.data.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { rotateSeeds } from "../lib/seedRotation.js";
import { harvestPortfolioEntryList } from "./portfolioHarvest.js";

/**
 * @param {object} [brief]
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 * @returns {Promise<Array<{name:string, website:string, sourceTag:string, rawMetadata:object}>>}
 */
export async function searchPePortfolios(brief = {}, fetchOpts = {}) {
  const m = breadthMultiplier(brief);
  const limit = Math.min(PE_FIRMS.length, Math.min(80, 20 * m));
  const entries = rotateSeeds(PE_FIRMS, brief).slice(0, limit).map((f) => ({
    portfolioUrl: f.portfolioUrl,
    name: f.name,
  }));
  return harvestPortfolioEntryList(entries, fetchOpts, {
    sourceTagPrefix: "PE",
    detailKind: "pe",
    concurrency: 6,
  });
}
