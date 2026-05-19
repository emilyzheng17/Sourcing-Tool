#!/usr/bin/env node
/**
 * Batch discovery + enrich + score without writing to universe.db.
 * Usage: node scripts/free-discovery.mjs --product "ERP & Operations" --max 200 --out ./out/discovery
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import pLimit from "p-limit";
import { discoverMergedCandidates, primaryKey } from "../server/lib/candidateDiscovery.js";
import { enrichCandidateStageA, enrichCandidateStageB } from "../server/enrich.js";
import { scoreThesis } from "../server/score.js";
import { normalizeDomain } from "../server/lib/domains.js";
import { closePlaywrightBrowser } from "../server/lib/playwrightRender.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

// #region CLI helpers
function applyPaidHints(candidate) {
  const md = candidate.rawMetadata || {};
  const foundedYear =
    candidate.foundedYear ??
    (md.apolloFoundedYear != null ? parseInt(String(md.apolloFoundedYear), 10) : null);
  return {
    ...candidate,
    employees: candidate.employees ?? md.apolloEmployees ?? md.crunchbaseEmployees ?? null,
    hq: candidate.hq ?? md.hq ?? null,
    foundedYear: Number.isFinite(foundedYear) ? foundedYear : candidate.foundedYear ?? null,
    revenue: candidate.revenue ?? null,
  };
}

function parseArgs(argv) {
  const o = {
    product: "ERP & Operations",
    breadth: "focused",
    maxCompanies: 1000,
    out: path.join(root, "out", "discovery"),
    queue: path.join(root, "free-discovery-queue.sqlite"),
    resume: false,
    concurrency: 6,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--resume") o.resume = true;
    else if (a.startsWith("--product=")) o.product = a.slice("--product=".length).replace(/^"|"$/g, "");
    else if (a === "--product") o.product = (argv[++i] || o.product).replace(/^"|"$/g, "");
    else if (a.startsWith("--breadth=")) o.breadth = a.slice("--breadth=".length);
    else if (a === "--breadth") o.breadth = argv[++i] || o.breadth;
    else if (a.startsWith("--max=")) o.maxCompanies = parseInt(a.slice("--max=".length), 10) || o.maxCompanies;
    else if (a === "--max") o.maxCompanies = parseInt(argv[++i] || "", 10) || o.maxCompanies;
    else if (a.startsWith("--out=")) o.out = path.resolve(a.slice("--out=".length));
    else if (a === "--out") o.out = path.resolve(argv[++i] || o.out);
    else if (a.startsWith("--queue=")) o.queue = path.resolve(a.slice("--queue=".length));
    else if (a === "--queue") o.queue = path.resolve(argv[++i] || o.queue);
    else if (a.startsWith("--concurrency=")) o.concurrency = parseInt(a.slice("--concurrency=".length), 10) || o.concurrency;
    else if (a === "--concurrency") o.concurrency = parseInt(argv[++i] || "", 10) || o.concurrency;
  }
  return o;
}

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowToCsvLine(obj, cols) {
  return cols.map((c) => csvEscape(obj[c])).join(",");
}
// #endregion

// #region main
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`free-discovery.mjs — batch scrape + enrich (no universe.db writes)

Options:
  --product "ERP & Operations"   Active G2/Capterra/GetApp category product name
  --breadth focused|broad|exhaustive
  --max 1000                     maxCompanies (50–2000)
  --out ./out/discovery          NDJSON + CSV output directory
  --queue ./free-discovery-queue.sqlite   SQLite resume keys (primaryKey)
  --resume                       skip candidate_key rows already in queue DB
  --concurrency 6

Env: PLAYWRIGHT=1 enables headless fallback (install: npx playwright install chromium)
`);
    process.exit(0);
  }

  fs.mkdirSync(args.out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ndPath = path.join(args.out, `discovery-${stamp}.ndjson`);
  const csvPath = path.join(args.out, `discovery-${stamp}.csv`);

  const ndStream = fs.createWriteStream(ndPath, { flags: "a" });
  const csvCols = [
    "domain",
    "name",
    "website",
    "thesisScore",
    "companyType",
    "foundedYear",
    "employeesBand",
    "employeesText",
    "hq",
    "schemaOrgEmployeesBand",
    "atsOpenRoles",
    "atsProvider",
    "sourceTags",
  ];

  const db = new Database(args.queue);
  db.exec(`
    CREATE TABLE IF NOT EXISTS processed (candidate_key TEXT PRIMARY KEY NOT NULL, domain TEXT, ts INTEGER NOT NULL);
  `);
  const ins = db.prepare(
    `INSERT OR REPLACE INTO processed (candidate_key, domain, ts) VALUES (@candidate_key, @domain, @ts)`
  );
  const jitterHostState = new Map();
  const fetchOpts = { cache: fetchCache, jitterHostState };

  const brief = {
    activeProduct: args.product,
    breadth: args.breadth,
    maxCompanies: args.maxCompanies,
    ownershipFilter: "Any",
    selectedVerticals: [],
    thesis: {},
  };

  const env = process.env;

  console.error(`[discovery] merged candidates gathering…`);

  const { merged, timedOut: mergeTimedOut } = await discoverMergedCandidates(brief, env, fetchOpts, (evt) => {
    if (evt.type === "log") console.error(`[discovery] ${evt.message}`);
  });
  if (mergeTimedOut) console.error("[discovery] timed out during merge phase");

  if (!merged?.length) {
    console.error("[discovery] no candidates");
    await closePlaywrightBrowser().catch(() => {});
    db.close();
    process.exit(0);
  }

  console.error(`[discovery] enriching ${merged.length} rows → ${path.relative(root, ndPath)}`);

  const limit = pLimit(Math.max(1, Math.min(20, args.concurrency)));

  /** @type {Record<string, number>} */
  const metrics = {
    enriched: 0,
    skipped: 0,
    failed: 0,
  };

  /** @type {Record<string, string|number>[]} */
  const csvAccumulator = [];

  await Promise.all(
    merged.map((c) =>
      limit(async () => {
        const ck = primaryKey(c);
        if (!ck) {
          metrics.failed += 1;
          return;
        }
        if (args.resume) {
          const row = selProcessed.get(ck);
          if (row) {
            metrics.skipped += 1;
            return;
          }
        }

        let enriched;
        try {
          const seeded = applyPaidHints(c);
          const stageA = await enrichCandidateStageA(seeded, brief, env, fetchOpts);
          if (!stageA) {
            metrics.skipped += 1;
            ins.run({ candidate_key: ck, domain: null, ts: Date.now() });
            return;
          }
          enriched = await enrichCandidateStageB(seeded, stageA, brief, env, fetchOpts);
        } catch (e) {
          metrics.failed += 1;
          console.error(`[discovery] enrich error ${ck}: ${e?.message || e}`);
          ins.run({ candidate_key: ck, domain: null, ts: Date.now() });
          return;
        }
        if (!enriched?.domain) {
          metrics.failed += 1;
          ins.run({ candidate_key: ck, domain: null, ts: Date.now() });
          return;
        }

        const scored = { ...enriched, sourceTags: enriched.sourceTags || c.sourceTags || [c.sourceTag] };
        const rule = scoreThesis(scored, brief);
        const out = {
          ...scored,
          ...rule,
          score: rule.thesisScore,
        };

        ndStream.write(JSON.stringify(out) + "\n");

        csvAccumulator.push({
          domain: out.domain,
          name: out.name,
          website: out.website,
          thesisScore: out.thesisScore ?? out.score,
          companyType: out.companyType,
          foundedYear: out.foundedYear,
          employeesBand: out.employees ?? "",
          employeesText: out.employeesText ?? "",
          hq: out.hq ?? "",
          schemaOrgEmployeesBand: out.schemaOrgEmployeesBand ?? "",
          atsOpenRoles: out.atsOpenRoles ?? "",
          atsProvider: out.atsProvider ?? "",
          sourceTags: (out.sourceTags || []).join(";"),
        });

        ins.run({
          candidate_key: ck,
          domain: normalizeDomain(enriched.website),
          ts: Date.now(),
        });
        metrics.enriched += 1;
      })
    )
  );

  const csvLines = [csvCols.join(","), ...csvAccumulator.map((r) => rowToCsvLine(r, csvCols))].join("\n");
  fs.writeFileSync(csvPath, csvLines + "\n");

  ndStream.end();
  await new Promise((r) => ndStream.on("finish", r));

  console.error(`[discovery] done enriched=${metrics.enriched} skipped=${metrics.skipped} failed=${metrics.failed}`);

  db.close();
  await closePlaywrightBrowser().catch(() => {});
}
// #endregion

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
