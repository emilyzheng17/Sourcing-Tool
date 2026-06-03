import { searchPePortfolios } from "./peFirms.js";
import { searchRollupPages } from "./rollupPages.js";
import { searchTradeAssocs } from "./tradeAssocs.js";
import { searchG2 } from "./g2.js";
import { searchCapterra } from "./capterra.js";
import { searchGetApp } from "./getApp.js";
import { searchBrave } from "./brave.js";
import { searchSerper } from "./serper.js";
import { searchExa } from "./exa.js";
import { searchApollo } from "./apollo.js";
import { searchCrunchbase } from "./crunchbase.js";
import { searchTrustRadius } from "./trustRadius.js";
import { searchSoftwareAdvice } from "./softwareAdvice.js";
import { searchSourceForge } from "./sourceforge.js";
import { searchSlashdot } from "./slashdot.js";
import { searchSaaSHub } from "./saashub.js";
import { searchAlternativeTo } from "./alternativeTo.js";
import { searchMarketplacePages } from "./marketplacePages.js";
import { searchTavily } from "./tavily.js";
import { searchSearxng } from "./searxng.js";
import { searchDuckDuckGo } from "./duckduckgo.js";
import { searchHighRiskSources } from "./highRisk/index.js";

/** Hard cap so one adapter cannot block discovery fan-out indefinitely. */
const SOURCE_TIMEOUT_MS = 90_000;

/** Directory listing scrapers — keyed by product slug, not vertical; safe to skip on repeat passes. */
export const DIRECTORY_SOURCE_KEYS = new Set([
  "g2",
  "capterra",
  "getapp",
  "trustradius",
  "softwareadvice",
  "sourceforge",
  "slashdot",
  "saashub",
  "alternativeto",
]);

/**
 * Run all source adapters in parallel; invoke onSourceResult as each settles (incremental TTFR upstream).
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {{ cache?: Map, jitterHostState?: Map, apiBudgets?: object, skipDirectorySources?: boolean }} [fetchOpts]
 * @param {(sourceKey: string, candidates: object[]) => void} onSourceResult
 * @returns {Promise<void>}
 */
export async function fanOutSourcesIncremental(brief, env, fetchOpts, onSourceResult) {
  const fo = fetchOpts || {};
  const procEnv = env || process.env;
  const skipDirs = !!fo.skipDirectorySources;

  const settle = (sourceKey, p) =>
    Promise.race([
      Promise.resolve(p),
      new Promise((resolve) => setTimeout(() => resolve("__source_timeout__"), SOURCE_TIMEOUT_MS)),
    ])
      .then((arr) => {
        if (arr === "__source_timeout__") {
          console.error(`[fanOutSources] ${sourceKey}: timed out after ${SOURCE_TIMEOUT_MS}ms`);
          onSourceResult(sourceKey, []);
          return;
        }
        onSourceResult(sourceKey, Array.isArray(arr) ? arr : []);
      })
      .catch((err) => {
        console.error(`[fanOutSources] ${sourceKey}:`, err?.message || err);
        onSourceResult(sourceKey, []);
      });

  const tasks = [
    settle("pe", searchPePortfolios(brief, fo)),
    settle("rollup", searchRollupPages(brief, fo)),
    settle("assoc", searchTradeAssocs(brief, fo)),
    settle("brave", searchBrave(brief, env)),
    settle("serper", searchSerper(brief, env)),
    settle("searxng", searchSearxng(brief, env)),
    settle("duckduckgo", searchDuckDuckGo(brief, env)),
    settle("exa", searchExa(brief, env)),
    settle("apollo", searchApollo(brief, env, fo)),
    settle("crunchbase", searchCrunchbase(brief, env, fo)),
    settle("marketplace", searchMarketplacePages(brief, fo)),
    settle("tavily", searchTavily(brief, procEnv)),
    settle("highRisk", searchHighRiskSources(brief, procEnv)),
  ];

  if (!skipDirs) {
    tasks.push(
      settle("g2", searchG2(brief, fo)),
      settle("capterra", searchCapterra(brief, fo)),
      settle("getapp", searchGetApp(brief, fo)),
      settle("trustradius", searchTrustRadius(brief, fo)),
      settle("softwareadvice", searchSoftwareAdvice(brief, fo)),
      settle("sourceforge", searchSourceForge(brief, fo)),
      settle("slashdot", searchSlashdot(brief, fo)),
      settle("saashub", searchSaaSHub(brief, fo)),
      settle("alternativeto", searchAlternativeTo(brief, fo)),
    );
  }

  await Promise.all(tasks);
}

/**
 * Run all source adapters in parallel.
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function fanOutSources(brief, env, fetchOpts) {
  /** @type {Record<string, object[]>} */
  const buckets = {
    pe: [],
    rollup: [],
    assoc: [],
    g2: [],
    capterra: [],
    getapp: [],
    brave: [],
    serper: [],
    searxng: [],
    duckduckgo: [],
    exa: [],
    apollo: [],
    crunchbase: [],
    trustradius: [],
    softwareadvice: [],
    sourceforge: [],
    slashdot: [],
    saashub: [],
    alternativeto: [],
    marketplace: [],
    tavily: [],
    highRisk: [],
  };
  await fanOutSourcesIncremental(brief, env, fetchOpts, (key, arr) => {
    buckets[key] = arr;
  });
  return buckets;
}
