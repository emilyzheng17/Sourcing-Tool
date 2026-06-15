import { ROLLUP_PAGES } from "./rollupPages.data.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { rotateSeeds } from "../lib/seedRotation.js";
import { harvestPortfolioEntryList } from "./portfolioHarvest.js";

/** Recurse holdco → operating-group → portfolio-listing by default (was a single sub-hub level). */
const DEFAULT_CRAWL_DEPTH = 2;
const MAX_CRAWL_DEPTH = 3;
/** Hard ceiling so one acquirer's tree can't run away regardless of env/breadth. */
const MAX_PAGE_BUDGET = 60;

/**
 * Resolve crawl bounds from env (conservative defaults). `pageBudget` is the
 * total page fetches per seed; `visited` + politeness throttling keep it safe.
 * @param {NodeJS.ProcessEnv} env
 * @param {number} m breadth multiplier
 */
export function resolveRollupCrawlConfig(env, m) {
  const depthRaw = parseInt(String(env?.ROLLUP_CRAWL_DEPTH ?? ""), 10);
  const crawlDepth = Number.isFinite(depthRaw)
    ? Math.max(0, Math.min(MAX_CRAWL_DEPTH, depthRaw))
    : DEFAULT_CRAWL_DEPTH;
  const budgetRaw = parseInt(String(env?.ROLLUP_PAGE_BUDGET ?? ""), 10);
  const pageBudget = Math.min(
    MAX_PAGE_BUDGET,
    Number.isFinite(budgetRaw) && budgetRaw > 0 ? budgetRaw : 12 + 8 * m,
  );
  return { crawlDepth, pageBudget };
}

/**
 * @param {object} [brief]
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 * @returns {Promise<Array<{name:string, website:string, sourceTag:string, rawMetadata:object}>>}
 */
export async function searchRollupPages(brief = {}, fetchOpts = {}) {
  const m = breadthMultiplier(brief);
  const limit = Math.min(ROLLUP_PAGES.length, Math.min(50, Math.round(15 * m)));
  const entries = rotateSeeds(ROLLUP_PAGES, brief).slice(0, limit).map((row) => ({
    pageUrl: row.pageUrl,
    name: row.name,
    extraMetadata: { rollupId: row.id },
  }));
  const { crawlDepth, pageBudget } = resolveRollupCrawlConfig(process.env, m);
  return harvestPortfolioEntryList(entries, fetchOpts, {
    sourceTagPrefix: "Rollup",
    detailKind: "rollup",
    concurrency: 6,
    crawlDepth,
    pageBudget,
  });
}
