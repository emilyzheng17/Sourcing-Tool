#!/usr/bin/env node
/**
 * Overnight crawler — loops runSearchPipeline over a vertical × product matrix
 * to fill universe.db without paid API keys. Designed to run unattended for
 * hours, leaning on self-hosted SearXNG + local Ollama (GPU) for free discovery
 * and classification.
 *
 * Each combo is a separate runSearchPipeline call, so the universe.db cache
 * (TTL=ENRICH_CACHE_TTL_DAYS, default 30 d) naturally dedupes work across
 * combos and across restarts. A small JSON state file records which combos
 * have completed so --resume can skip them.
 *
 * Usage:
 *   node scripts/overnight-crawl.mjs                       # all verticals × all products
 *   node scripts/overnight-crawl.mjs --resume              # skip combos already in state file
 *   node scripts/overnight-crawl.mjs --verticals "Metals & Mining,Forestry & Lumber"
 *   node scripts/overnight-crawl.mjs --max 300 --breadth broad
 *
 * Env: SEARXNG_URL=... + OLLAMA_URL=... recommended for keyless discovery.
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSearchPipeline } from "../server/pipeline.js";
import { closePlaywrightBrowser } from "../server/lib/playwrightRender.js";
import {
  KNOWN_VERTICALS,
  PORTFOLIO_PRODUCT_NAMES,
} from "../server/lib/portfolioProductNames.js";
import { DEFAULT_ALLOWED_COUNTRY_CODES } from "../shared/geoCountry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseCsv(s, fallback) {
  if (!s) return fallback;
  const t = String(s).trim();
  if (!t || t.toLowerCase() === "all") return fallback;
  return t
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const o = {
    verticals: KNOWN_VERTICALS,
    products: PORTFOLIO_PRODUCT_NAMES,
    max: 500,
    breadth: "exhaustive",
    llm: "ollama",
    state: path.join(root, "overnight-state.json"),
    resume: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--resume") o.resume = true;
    else if (a === "--verticals") o.verticals = parseCsv(next(), KNOWN_VERTICALS);
    else if (a === "--products") o.products = parseCsv(next(), PORTFOLIO_PRODUCT_NAMES);
    else if (a === "--max") o.max = parseInt(next(), 10) || o.max;
    else if (a === "--breadth") o.breadth = next() || o.breadth;
    else if (a === "--llm") o.llm = next() || o.llm;
    else if (a === "--state") o.state = path.resolve(next());
  }
  return o;
}

function comboKey(vertical, product) {
  return `${vertical}::${product}`;
}

function loadState(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const j = JSON.parse(raw);
    return {
      completed: new Set(Array.isArray(j.completed) ? j.completed : []),
      startedAt: j.startedAt || null,
    };
  } catch {
    return { completed: new Set(), startedAt: null };
  }
}

function saveState(file, state) {
  fs.writeFileSync(
    file,
    JSON.stringify(
      { completed: [...state.completed], startedAt: state.startedAt, updatedAt: new Date().toISOString() },
      null,
      2,
    ),
  );
}

function fmtDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m${rs}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h${rm}m`;
}

async function runCombo(vertical, product, args) {
  const brief = {
    selectedVerticals: [vertical],
    selectedProducts: [product],
    activeProduct: product,
    maxCompanies: args.max,
    breadth: args.breadth,
    ownershipFilter: "Any",
    selectedTags: [],
    allowedCountries: DEFAULT_ALLOWED_COUNTRY_CODES,
    settings: { llmProvider: args.llm },
  };

  const counts = { company: 0, log: 0, source: 0, error: 0 };
  const emit = (evt) => {
    if (!evt || typeof evt !== "object") return;
    if (evt.type === "company") {
      counts.company += 1;
      if (counts.company <= 3 || counts.company % 25 === 0) {
        const c = evt.company || {};
        console.log(`  [${vertical} × ${product}] +${counts.company} ${c.name || c.domain || ""} (${c.score ?? "-"})`);
      }
    } else if (evt.type === "log") {
      counts.log += 1;
    } else if (evt.type === "source-quality-summary") {
      counts.source += 1;
    } else if (evt.type === "error") {
      counts.error += 1;
      console.error(`  [${vertical} × ${product}] ERROR ${evt.message || ""}`);
    }
  };

  const t0 = Date.now();
  await runSearchPipeline(brief, process.env, emit);
  return { ...counts, ms: Date.now() - t0 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`overnight-crawl.mjs — loop runSearchPipeline over vertical × product matrix.

Options:
  --verticals "A,B,C"   comma-separated, or "all" (default: all ${KNOWN_VERTICALS.length})
  --products  "A,B,C"   comma-separated, or "all" (default: all ${PORTFOLIO_PRODUCT_NAMES.length})
  --max <n>             maxCompanies per combo (default 500)
  --breadth <b>         focused|broad|exhaustive (default exhaustive)
  --llm <p>             none|openai|anthropic|gemini|ollama (default ollama)
  --state <path>        resume file (default overnight-state.json)
  --resume              skip combos already in state file

Recommended env:
  SEARXNG_URL=http://127.0.0.1:8081
  OLLAMA_URL=http://127.0.0.1:11434
  OLLAMA_MODEL=llama3.2
`);
    process.exit(0);
  }

  const state = args.resume ? loadState(args.state) : { completed: new Set(), startedAt: null };
  if (!state.startedAt) state.startedAt = new Date().toISOString();

  /** @type {{ vertical: string, product: string }[]} */
  const combos = [];
  for (const v of args.verticals) for (const p of args.products) combos.push({ vertical: v, product: p });

  const remaining = combos.filter((c) => !state.completed.has(comboKey(c.vertical, c.product)));
  console.log(
    `[overnight] matrix=${args.verticals.length}×${args.products.length}=${combos.length} combos, remaining=${remaining.length}, max=${args.max}, breadth=${args.breadth}, llm=${args.llm}`,
  );
  console.log(`[overnight] state file: ${args.state}`);
  if (!process.env.SEARXNG_URL) {
    console.warn("[overnight] WARN: SEARXNG_URL not set — keyless web search disabled. See searxng/README.md");
  }
  if (!process.env.OLLAMA_URL && args.llm === "ollama") {
    console.warn("[overnight] WARN: OLLAMA_URL not set — falling back to no LLM classifier.");
  }

  const t0 = Date.now();
  let done = 0;
  for (const { vertical, product } of remaining) {
    done += 1;
    console.log(`\n[overnight ${done}/${remaining.length}] ${vertical} × ${product} (elapsed ${fmtDuration(Date.now() - t0)})`);
    try {
      const r = await runCombo(vertical, product, args);
      console.log(
        `[overnight] done ${vertical} × ${product}: companies=${r.company} logs=${r.log} errors=${r.error} in ${fmtDuration(r.ms)}`,
      );
    } catch (e) {
      console.error(`[overnight] combo failed ${vertical} × ${product}: ${e?.message || e}`);
    }
    state.completed.add(comboKey(vertical, product));
    saveState(args.state, state);
  }

  console.log(`\n[overnight] all done. total=${fmtDuration(Date.now() - t0)}, combos completed=${state.completed.size}/${combos.length}`);
  await closePlaywrightBrowser().catch(() => {});
}

main().catch((e) => {
  console.error("[overnight] fatal:", e);
  closePlaywrightBrowser()
    .catch(() => {})
    .finally(() => process.exit(1));
});
