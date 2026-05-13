import { searchPePortfolios } from "./peFirms.js";
import { searchTradeAssocs } from "./tradeAssocs.js";
import { searchG2 } from "./g2.js";
import { searchCapterra } from "./capterra.js";
import { searchBrave } from "./brave.js";
import { searchExa } from "./exa.js";
import { searchApollo } from "./apollo.js";
import { searchCrunchbase } from "./crunchbase.js";

/**
 * Run all source adapters in parallel.
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 */
export async function fanOutSources(brief, env) {
  const [
    pe,
    assoc,
    g2,
    capterra,
    brave,
    exa,
    apollo,
    crunchbase,
  ] = await Promise.all([
    searchPePortfolios(),
    searchTradeAssocs(brief),
    searchG2(brief),
    searchCapterra(brief),
    searchBrave(brief, env),
    searchExa(brief, env),
    searchApollo(brief, env),
    searchCrunchbase(brief, env),
  ]);
  return { pe, assoc, g2, capterra, brave, exa, apollo, crunchbase };
}
