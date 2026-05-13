import { ROLLUP_PAGES } from "./rollupPages.data.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { harvestPortfolioEntryList } from "./portfolioHarvest.js";

/**
 * @param {object} [brief]
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 * @returns {Promise<Array<{name:string, website:string, sourceTag:string, rawMetadata:object}>>}
 */
export async function searchRollupPages(brief = {}, fetchOpts = {}) {
  const m = breadthMultiplier(brief);
  const limit = Math.min(ROLLUP_PAGES.length, Math.min(50, Math.round(15 * m)));
  const entries = ROLLUP_PAGES.slice(0, limit).map((row) => ({
    pageUrl: row.pageUrl,
    name: row.name,
    extraMetadata: { rollupId: row.id },
  }));
  return harvestPortfolioEntryList(entries, fetchOpts, {
    sourceTagPrefix: "Rollup",
    detailKind: "rollup",
    concurrency: 6,
  });
}
