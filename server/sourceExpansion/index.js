/**
 * Source Expansion — entry point.
 *
 * Provides runSourceExpansion() which assembles the adapter registry
 * and launches the orchestrator. Can be called from API routes or CLI.
 */

import { runOrchestrator, stopOrchestrator } from "./orchestrator.js";
import { ensureFrontierTable, listAdapterStates } from "./frontier.js";

// -- Tier 1 adapters --
import { CompaniesHouseAdapter } from "./adapters/companiesHouse.js";
import { CvrAdapter } from "./adapters/cvr.js";
import { BronnoysundAdapter } from "./adapters/bronnoysund.js";
import { PrhAdapter } from "./adapters/prh.js";
import { BolagsverketAdapter } from "./adapters/bolagsverket.js";
import { AsicAdapter } from "./adapters/asic.js";
import { G2FrontierAdapter } from "./adapters/g2Frontier.js";
import { CapterraFrontierAdapter } from "./adapters/capterraFrontier.js";
import { ShopifyAppsAdapter } from "./adapters/shopifyApps.js";
import { AtlassianMarketplaceAdapter } from "./adapters/atlassianMarketplace.js";
import { HubspotMarketplaceAdapter } from "./adapters/hubspotMarketplace.js";
import { SalesforceAppExchangeAdapter } from "./adapters/salesforceAppExchange.js";
import { PePortfolioFrontierAdapter } from "./adapters/pePortfolioFrontier.js";

// -- Tier 2 adapters --
import { SecEdgarAdapter } from "./adapters/secEdgar.js";
import { AwsMarketplaceAdapter } from "./adapters/awsMarketplace.js";
import { AzureMarketplaceAdapter } from "./adapters/azureMarketplace.js";
import { GcpMarketplaceAdapter } from "./adapters/gcpMarketplace.js";
import { SapStoreAdapter } from "./adapters/sapStore.js";
import { ZapierDirectoryAdapter } from "./adapters/zapierDirectory.js";
import { HandelsregisterAdapter } from "./adapters/handelsregister.js";
import { InseeAdapter } from "./adapters/insee.js";
import { KvkAdapter } from "./adapters/kvk.js";
import { NzCompaniesOfficeAdapter } from "./adapters/nzCompaniesOffice.js";

/**
 * All available adapters, instantiated with default config.
 */
function buildAdapterRegistry() {
  return [
    // Tier 1 — registries
    new CompaniesHouseAdapter(),
    new CvrAdapter(),
    new BronnoysundAdapter(),
    new PrhAdapter(),
    new BolagsverketAdapter(),
    new AsicAdapter(),
    // Tier 1 — marketplaces
    new G2FrontierAdapter(),
    new CapterraFrontierAdapter(),
    new ShopifyAppsAdapter(),
    new AtlassianMarketplaceAdapter(),
    new HubspotMarketplaceAdapter(),
    new SalesforceAppExchangeAdapter(),
    // Tier 1 — PE
    new PePortfolioFrontierAdapter(),
    // Tier 2 — registries (supplementary)
    new SecEdgarAdapter(),
    // Tier 2 — marketplaces
    new AwsMarketplaceAdapter(),
    new AzureMarketplaceAdapter(),
    new GcpMarketplaceAdapter(),
    new SapStoreAdapter(),
    new ZapierDirectoryAdapter(),
    // Tier 2 — registries
    new HandelsregisterAdapter(),
    new InseeAdapter(),
    new KvkAdapter(),
    new NzCompaniesOfficeAdapter(),
  ];
}

/**
 * Run the full Source Expansion pipeline.
 *
 * @param {object} config
 * @param {number} [config.maxCandidates=100000]
 * @param {number} [config.maxRunTimeHours=12]
 * @param {number} [config.tierConcurrency=3]
 * @param {boolean} [config.resume=true]
 * @param {string[]} [config.adapterIds] - Run only these adapters (all if omitted)
 * @param {number[]} [config.tiers] - Run only these tiers (all if omitted)
 * @param {NodeJS.ProcessEnv} env
 * @param {(evt: object) => void} [emit]
 * @returns {Promise<string>} jobId
 */
export async function runSourceExpansion(config, env, emit = () => {}) {
  ensureFrontierTable();

  let adapters = buildAdapterRegistry();

  if (config.adapterIds?.length) {
    const idSet = new Set(config.adapterIds);
    adapters = adapters.filter((a) => idSet.has(a.id));
  }

  if (config.tiers?.length) {
    const tierSet = new Set(config.tiers);
    adapters = adapters.filter((a) => tierSet.has(a.tier));
  }

  if (!adapters.length) {
    emit({ type: "expansion:error", message: "No adapters selected" });
    throw new Error("No adapters match the given filter criteria");
  }

  return runOrchestrator({
    adapters,
    env,
    maxCandidates: config.maxCandidates,
    maxRunTimeHours: config.maxRunTimeHours,
    tierConcurrency: config.tierConcurrency,
    resume: config.resume,
    verbose: config.verbose,
    emit,
  });
}

export function stopSourceExpansion(jobId) {
  return stopOrchestrator(jobId);
}

/**
 * List all registered adapters and their current crawl state.
 */
export function getAdapterStatuses() {
  ensureFrontierTable();
  const registry = buildAdapterRegistry();
  const states = listAdapterStates();
  const stateMap = new Map(states.map((s) => [s.adapterId, s]));

  return registry.map((a) => {
    const state = stateMap.get(a.id);
    return {
      id: a.id,
      name: a.name,
      tier: a.tier,
      signalType: a.signalType,
      status: state?.status || "NEVER_RUN",
      totalItems: state?.totalItems || 0,
      lastRunAt: state?.lastRunAt || null,
    };
  });
}
