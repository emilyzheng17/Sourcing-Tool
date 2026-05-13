import { searchPePortfolios } from "./peFirms.js";
import { searchRollupPages } from "./rollupPages.js";
import { searchTradeAssocs } from "./tradeAssocs.js";
import { searchG2 } from "./g2.js";
import { searchCapterra } from "./capterra.js";
import { searchGetApp } from "./getApp.js";
import { searchBrave } from "./brave.js";
import { searchExa } from "./exa.js";
import { searchApollo } from "./apollo.js";
import { searchCrunchbase } from "./crunchbase.js";
import { searchTrustRadius } from "./trustRadius.js";
import { searchTavily } from "./tavily.js";
import { searchHighRiskSources } from "./highRisk/index.js";

/**
 * Run all source adapters in parallel.
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function fanOutSources(brief, env, fetchOpts) {
  const fo = fetchOpts || {};
  const [
    pe,
    rollup,
    assoc,
    g2,
    capterra,
    getapp,
    brave,
    exa,
    apollo,
    crunchbase,
    trustradius,
    tavily,
    highRisk,
  ] = await Promise.all([
    searchPePortfolios(brief, fo),
    searchRollupPages(brief, fo),
    searchTradeAssocs(brief, fo),
    searchG2(brief, fo),
    searchCapterra(brief, fo),
    searchGetApp(brief, fo),
    searchBrave(brief, env),
    searchExa(brief, env),
    searchApollo(brief, env),
    searchCrunchbase(brief, env),
    searchTrustRadius(brief, fo),
    searchTavily(brief, env || process.env),
    searchHighRiskSources(brief, env || process.env),
  ]);
  return {
    pe,
    rollup,
    assoc,
    g2,
    capterra,
    getapp,
    brave,
    exa,
    apollo,
    crunchbase,
    trustradius,
    tavily,
    highRisk,
  };
}
