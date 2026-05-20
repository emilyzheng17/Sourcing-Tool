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
import { searchHighRiskSources } from "./highRisk/index.js";

/**
 * Run all source adapters in parallel; invoke onSourceResult as each settles (incremental TTFR upstream).
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 * @param {(sourceKey: string, candidates: object[]) => void} onSourceResult
 * @returns {Promise<void>}
 */
export async function fanOutSourcesIncremental(brief, env, fetchOpts, onSourceResult) {
  const fo = fetchOpts || {};
  const procEnv = env || process.env;

  const settle = (sourceKey, p) =>
    Promise.resolve(p)
      .then((arr) => {
        onSourceResult(sourceKey, Array.isArray(arr) ? arr : []);
      })
      .catch((err) => {
        console.error(`[fanOutSources] ${sourceKey}:`, err?.message || err);
        onSourceResult(sourceKey, []);
      });

  await Promise.all([
    settle("pe", searchPePortfolios(brief, fo)),
    settle("rollup", searchRollupPages(brief, fo)),
    settle("assoc", searchTradeAssocs(brief, fo)),
    settle("g2", searchG2(brief, fo)),
    settle("capterra", searchCapterra(brief, fo)),
    settle("getapp", searchGetApp(brief, fo)),
    settle("brave", searchBrave(brief, env)),
    settle("serper", searchSerper(brief, env)),
    settle("exa", searchExa(brief, env)),
    settle("apollo", searchApollo(brief, env)),
    settle("crunchbase", searchCrunchbase(brief, env)),
    settle("trustradius", searchTrustRadius(brief, fo)),
    settle("softwareadvice", searchSoftwareAdvice(brief, fo)),
    settle("sourceforge", searchSourceForge(brief, fo)),
    settle("slashdot", searchSlashdot(brief, fo)),
    settle("saashub", searchSaaSHub(brief, fo)),
    settle("alternativeto", searchAlternativeTo(brief, fo)),
    settle("marketplace", searchMarketplacePages(brief, fo)),
    settle("tavily", searchTavily(brief, procEnv)),
    settle("highRisk", searchHighRiskSources(brief, procEnv)),
  ]);
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
