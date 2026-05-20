#!/usr/bin/env node
/**
 * Source Expansion CLI — run the background ingestion pipeline from the command line.
 *
 * Usage:
 *   node scripts/source-expansion.mjs [options]
 *
 * Options:
 *   --max <n>              Max candidates to discover (default: 100000)
 *   --hours <n>            Max run time in hours (default: 12)
 *   --tiers <1,2,3>        Comma-separated tiers to run (default: all)
 *   --adapters <id,id,...>  Comma-separated adapter IDs to run (default: all)
 *   --concurrency <n>      Adapters per tier running concurrently (default: 3)
 *   --no-resume            Start fresh (ignore saved cursors)
 *   --list                 List available adapters and exit
 *   --help                 Show this help
 */
import "dotenv/config";
import { runSourceExpansion, getAdapterStatuses } from "../server/sourceExpansion/index.js";
import { getDb } from "../server/db.js";

function parseArgs(argv) {
  const o = {
    maxCandidates: 100_000,
    maxRunTimeHours: 12,
    tierConcurrency: 3,
    resume: true,
    tiers: null,
    adapterIds: null,
    verbose: false,
    list: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--list") o.list = true;
    else if (a === "--verbose" || a === "-v") o.verbose = true;
    else if (a === "--no-resume") o.resume = false;
    else if (a === "--max") o.maxCandidates = parseInt(argv[++i] || "", 10) || o.maxCandidates;
    else if (a.startsWith("--max=")) o.maxCandidates = parseInt(a.slice(6), 10) || o.maxCandidates;
    else if (a === "--hours") o.maxRunTimeHours = parseFloat(argv[++i] || "") || o.maxRunTimeHours;
    else if (a.startsWith("--hours=")) o.maxRunTimeHours = parseFloat(a.slice(8)) || o.maxRunTimeHours;
    else if (a === "--concurrency") o.tierConcurrency = parseInt(argv[++i] || "", 10) || o.tierConcurrency;
    else if (a.startsWith("--concurrency=")) o.tierConcurrency = parseInt(a.slice(14), 10) || o.tierConcurrency;
    else if (a === "--tiers") o.tiers = (argv[++i] || "").split(",").map(Number).filter(Boolean);
    else if (a.startsWith("--tiers=")) o.tiers = a.slice(8).split(",").map(Number).filter(Boolean);
    else if (a === "--adapters") o.adapterIds = (argv[++i] || "").split(",").filter(Boolean);
    else if (a.startsWith("--adapters=")) o.adapterIds = a.slice(11).split(",").filter(Boolean);
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`source-expansion.mjs — background B2B company discovery

Options:
  --max <n>              Max candidates (default: 100000)
  --hours <n>            Max run time in hours (default: 12)
  --tiers <1,2,3>        Tiers to run (default: all)
  --adapters <id,...>    Adapter IDs to run (default: all)
  --concurrency <n>      Adapters per tier (default: 3)
  --verbose, -v          Show per-batch normalize logs
  --no-resume            Start fresh crawl
  --list                 List adapters and exit
  --help                 Show help
`);
    process.exit(0);
  }

  getDb();

  if (args.list) {
    const adapters = getAdapterStatuses();
    console.log("\nAvailable adapters:\n");
    console.log("  ID                          Tier  Type         Status       Items    Last Run");
    console.log("  " + "-".repeat(90));
    for (const a of adapters) {
      const id = a.id.padEnd(28);
      const tier = String(a.tier).padEnd(4);
      const type = a.signalType.padEnd(12);
      const status = a.status.padEnd(12);
      const items = String(a.totalItems).padEnd(8);
      const last = a.lastRunAt || "never";
      console.log(`  ${id}  ${tier}  ${type}  ${status}  ${items}  ${last}`);
    }
    console.log();
    process.exit(0);
  }

  console.error(`[source-expansion] Starting...`);
  console.error(`  Max candidates: ${args.maxCandidates}`);
  console.error(`  Max run time:   ${args.maxRunTimeHours}h`);
  console.error(`  Concurrency:    ${args.tierConcurrency}`);
  console.error(`  Resume:         ${args.resume}`);
  console.error(`  Verbose:        ${args.verbose}`);
  if (args.tiers) console.error(`  Tiers:          ${args.tiers.join(", ")}`);
  if (args.adapterIds) console.error(`  Adapters:       ${args.adapterIds.join(", ")}`);
  console.error();

  const startTime = Date.now();

  const jobId = await runSourceExpansion(
    {
      maxCandidates: args.maxCandidates,
      maxRunTimeHours: args.maxRunTimeHours,
      tierConcurrency: args.tierConcurrency,
      resume: args.resume,
      verbose: args.verbose,
      tiers: args.tiers,
      adapterIds: args.adapterIds,
    },
    process.env,
    (evt) => {
      if (evt.type === "expansion:progress") {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.error(
          `[${elapsed}s] discovered=${evt.discovered} skipped=${evt.skipped} errors=${evt.errors} adapters=${evt.adaptersDone}/${evt.adaptersTotal}` +
          (evt.adapterId ? ` (${evt.adapterId})` : ""),
        );
      } else if (evt.type === "expansion:adapter_start") {
        console.error(`[adapter] Starting ${evt.adapterId} (tier ${evt.tier})`);
      } else if (evt.type === "expansion:adapter_done") {
        console.error(`[adapter] Done ${evt.adapterId}: discovered=${evt.discovered} skipped=${evt.skipped} errors=${evt.errors}`);
      } else if (evt.type === "expansion:adapter_error") {
        console.error(`[adapter] ERROR ${evt.adapterId}: ${evt.error}`);
      } else if (evt.type === "expansion:tier_start") {
        console.error(`\n[tier ${evt.tier}] Starting ${evt.adapterCount} adapters`);
      } else if (evt.type === "expansion:done") {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.error(`\n[source-expansion] Done in ${elapsed}s`);
        console.error(`  Discovered: ${evt.discovered}`);
        console.error(`  Skipped:    ${evt.skipped}`);
        console.error(`  Errors:     ${evt.errors}`);
        console.error(`  Job ID:     ${evt.jobId}`);
      }
    },
  );

  console.error(`\nJob ID: ${jobId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
