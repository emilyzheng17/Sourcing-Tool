import "dotenv/config";
import { EventEmitter } from "node:events";
import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { runSearchPipeline } from "./pipeline.js";
import {
  getDb,
  listUniverse,
  rowToCompany,
  setSaved,
  setManualClassify,
  getCompanyById,
  setRejected,
  bulkRejectIds,
  bulkRestoreRejectedIds,
  listActiveCompanySimilarityStubs,
  getCompaniesByIds,
  iterateActiveUniverseRows,
  rejectPublicListingsBackfill,
} from "./db.js";
import { companyPassesDiscoverFilters } from "../shared/discoverCompanyFilter.js";
import { expandFromSavedPortfolio } from "./lib/savedProfileExpand.js";
import { stubFromRow, findSimilarToAnchors } from "./lib/companySimilarity.js";
import {
  startUniverseBuild,
  pauseBuild,
  resumeBuild,
  stopBuild,
} from "./overnightPipeline.js";
import { getBuildJob, listBuildJobs, reconcileStaleBuildJobs } from "./db.js";
import { linkedInExportStatus } from "./lib/highTosEnv.js";
import { runEnrichListJob } from "./enrichByName.js";
import {
  createEnrichListJob,
  enrichListSubscribe,
  deriveEnrichListSnapshot,
  runEnrichListJobTracked,
} from "./enrichListJobs.js";

// Undici's fetch() attaches several internal listeners per in-flight request. The search
// pipeline runs many concurrent fetches (see pipeline.js p-limit); default limit is 10.
EventEmitter.defaultMaxListeners = Math.max(EventEmitter.defaultMaxListeners || 10, 32);

// #region App setup
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const jobs = new Map();
const enrichListJobs = new Map();
// #endregion

// #region Health & settings
app.get("/api/health", (_req, res) => {
  getDb();
  res.json({ ok: true });
});

app.get("/api/settings-status", (_req, res) => {
  const env = process.env;
  const linkedIn = linkedInExportStatus(env);
  res.json({
    brave: !!env.BRAVE_API_KEY,
    exa: !!env.EXA_API_KEY,
    apollo: !!env.APOLLO_API_KEY,
    crunchbase: !!env.CRUNCHBASE_API_KEY,
    tavily: !!env.TAVILY_API_KEY,
    highRiskExports: linkedIn.ready,
    linkedInExport: linkedIn,
    openai: !!env.OPENAI_API_KEY,
    anthropic: !!env.ANTHROPIC_API_KEY,
    gemini: !!env.GEMINI_API_KEY,
    ollama: !!(env.OLLAMA_URL || true),
  });
});
// #endregion

// #region Search jobs & SSE
app.post("/api/search", async (req, res) => {
  const jobId = randomUUID();
  const brief = req.body || {};
  jobs.set(jobId, { status: "running", subscribers: new Set() });
  res.json({ jobId });

  setTimeout(() => {
    (async () => {
      const emit = (evt) => {
        const job = jobs.get(jobId);
        if (!job) return;
        for (const fn of job.subscribers) {
          try {
            fn(evt);
          } catch {
            /* ignore */
          }
        }
      };

      try {
        await runSearchPipeline(brief, process.env, emit);
        jobs.set(jobId, { ...jobs.get(jobId), status: "done" });
      } catch (e) {
        emit({ type: "error", message: e.message || String(e) });
        jobs.set(jobId, { ...jobs.get(jobId), status: "error" });
      }
    })();
  }, 75);
});

app.get("/api/search/:jobId/stream", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (evt) => {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };

  const listener = (evt) => send(evt);
  job.subscribers.add(listener);

  req.on("close", () => {
    job.subscribers.delete(listener);
  });
});
// #endregion

// #region Enrich list (uploaded spreadsheet)
app.post("/api/enrich-list", (req, res) => {
  const body = req.body || {};
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) {
    res.status(400).json({ ok: false, message: "Provide a non-empty rows array" });
    return;
  }
  if (rows.length > 500) {
    res.status(400).json({ ok: false, message: "Maximum 500 rows per job" });
    return;
  }

  const jobId = randomUUID();
  const options = body.options && typeof body.options === "object" ? body.options : {};
  enrichListJobs.set(jobId, createEnrichListJob(rows, options));
  res.json({ jobId });
});

app.get("/api/enrich-list/:jobId", (req, res) => {
  const job = enrichListJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ ok: false, message: "Enrich job not found" });
    return;
  }
  res.json({ ok: true, jobId: req.params.jobId, ...deriveEnrichListSnapshot(job) });
});

app.get("/api/enrich-list/:jobId/stream", (req, res) => {
  const jobId = req.params.jobId;
  const job = enrichListJobs.get(jobId);
  if (!job) {
    res.status(404).end();
    return;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (evt) => {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };

  const unsubscribe = enrichListSubscribe(job, send);

  if (!job.started) {
    runEnrichListJobTracked(job, process.env, runEnrichListJob);
  }

  req.on("close", unsubscribe);
});
// #endregion

// #region Recommendations
app.post("/api/recommendations/from-saved", async (req, res) => {
  try {
    const body = req.body || {};
    const maxSaved = Math.min(120, Math.max(5, parseInt(String(body.maxSaved ?? 60), 10) || 60));
    const { rows } = listUniverse({ offset: 0, limit: maxSaved, savedOnly: true });
    if (!rows.length) {
      res.json({
        ok: false,
        message: "Save at least one company in the universe first to build recommendations.",
      });
      return;
    }
    const companies = rows.map(rowToCompany).filter(Boolean);
    const llmProvider = body.settings?.llmProvider ?? "none";
    const out = await expandFromSavedPortfolio({
      rows: companies,
      llmProvider,
      env: process.env,
      emit: () => {},
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || String(e) });
  }
});
// #endregion

// #region Universe & company routes
app.get("/api/universe", (req, res) => {
  const offset = parseInt(req.query.offset || "0", 10) || 0;
  const limit = Math.min(parseInt(req.query.limit || "50", 10) || 50, 5000);
  const rejectedOnly = req.query.rejectedOnly === "1" || req.query.rejectedOnly === "true";
  const savedOnly =
    !rejectedOnly && (req.query.savedOnly === "1" || req.query.savedOnly === "true");
  const { rows, total } = listUniverse({ offset, limit, savedOnly, rejectedOnly });
  res.json({
    total,
    offset,
    companies: rows.map(rowToCompany),
  });
});

app.post("/api/universe/query", (req, res) => {
  try {
    const body = req.body || {};
    const offset = Math.max(0, parseInt(String(body.offset ?? "0"), 10) || 0);
    const limit = Math.min(5000, Math.max(1, parseInt(String(body.limit ?? "500"), 10) || 500));
    const criteria = typeof body.criteria === "object" && body.criteria != null ? body.criteria : {};

    let total = 0;
    const companies = [];
    for (const row of iterateActiveUniverseRows()) {
      const c = rowToCompany(row);
      if (!companyPassesDiscoverFilters(c, criteria)) continue;
      if (total >= offset && companies.length < limit) companies.push(c);
      total += 1;
    }
    res.json({ ok: true, total, offset, limit, companies });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || String(e) });
  }
});

app.post("/api/admin/reject-public-listings", (_req, res) => {
  try {
    const result = rejectPublicListingsBackfill();
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || String(e) });
  }
});

app.post("/api/companies/bulk-reject", (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => parseInt(String(x), 10)).filter(Number.isFinite) : [];
  if (!ids.length) {
    res.status(400).json({ ok: false, message: "Provide a non-empty ids array" });
    return;
  }
  const changed = bulkRejectIds(ids);
  res.json({ ok: true, rejectedCount: changed });
});

app.post("/api/companies/bulk-restore", (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((x) => parseInt(String(x), 10)).filter(Number.isFinite)
    : [];
  if (!ids.length) {
    res.status(400).json({ ok: false, message: "Provide a non-empty ids array" });
    return;
  }
  const restoredCount = bulkRestoreRejectedIds(ids);
  res.json({ ok: true, restoredCount });
});

app.post("/api/companies/:id/save", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const saved = !!req.body?.saved;
  setSaved(id, saved);
  const row = getCompanyById(id);
  res.json(rowToCompany(row));
});

app.post("/api/companies/:id/classify", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const body = req.body || {};
  const pick = (key) => {
    if (!(key in body)) return undefined;
    const v = body[key];
    if (v === "unset") return null;
    if (v === "yes" || v === "no" || v === "maybe") return v;
    return undefined;
  };
  setManualClassify(id, {
    manualMissionCritical: pick("manualMissionCritical"),
    manualVerticallyIntegrated: pick("manualVerticallyIntegrated"),
    manualProprietary: pick("manualProprietary"),
  });
  const row = getCompanyById(id);
  res.json(rowToCompany(row));
});

app.post("/api/companies/:id/reject", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ ok: false, message: "Invalid id" });
    return;
  }
  const rejected = !!req.body?.rejected;
  const force = !!req.body?.force;
  const result = setRejected(id, rejected, { force });
  const row = getCompanyById(id);
  if (!row) {
    res.status(404).json({ ok: false, message: "Company not found" });
    return;
  }
  if (!result.ok) {
    res.status(result.refused ? 409 : 400).json({ ok: false, message: result.message });
    return;
  }
  res.json(rowToCompany(row));
});

app.post("/api/universe/similar-to-rejected", (req, res) => {
  try {
    const body = req.body || {};
    const anchorIds = Array.isArray(body.anchorIds)
      ? body.anchorIds.map((x) => parseInt(String(x), 10)).filter(Number.isFinite)
      : [];
    if (!anchorIds.length) {
      res.status(400).json({ ok: false, message: "Provide anchorIds (rejected company ids)" });
      return;
    }
    const limit = Math.min(500, Math.max(1, parseInt(String(body.limit ?? 100), 10) || 100));
    const minScore = Math.min(1, Math.max(0, parseFloat(String(body.minScore ?? "0.84")) || 0.84));

    const anchorRows = getCompaniesByIds(anchorIds);
    const validAnchors = anchorRows.filter((r) => r.is_rejected);
    if (!validAnchors.length) {
      res.status(400).json({ ok: false, message: "No rejected anchors among the given ids" });
      return;
    }
    const anchorStubs = validAnchors.map(stubFromRow);
    const candidateRows = listActiveCompanySimilarityStubs();
    const candidateStubs = candidateRows.map(stubFromRow);
    const found = findSimilarToAnchors(anchorStubs, candidateStubs, { minScore, limit });
    const matches = found.map(({ stub, score }) => ({
      id: stub.id,
      domain: stub.domain,
      name: stub.nameStr,
      score: Math.round(score * 1000) / 1000,
    }));
    res.json({ ok: true, matches });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || String(e) });
  }
});
// #endregion

// #region Server listen
// ── Overnight Universe Builder API ─────────────────────────────

const buildJobs = new Map();

app.post("/api/universe/build", (req, res) => {
  try {
    const config = req.body || {};
    const jobId = randomUUID();
    buildJobs.set(jobId, { subscribers: new Set() });

    const emit = (evt) => {
      const entry = buildJobs.get(jobId);
      if (!entry) return;
      for (const fn of entry.subscribers) {
        try { fn(evt); } catch { /* */ }
      }
    };

    res.json({ jobId });

    setTimeout(() => {
      startUniverseBuild(config, process.env, emit, jobId).catch((e) => {
        emit({ type: "build:error", message: e.message || String(e) });
      });
    }, 0);
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || String(e) });
  }
});

app.get("/api/universe/build/:jobId", (req, res) => {
  const job = getBuildJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ ok: false, message: "Build job not found" });
    return;
  }
  let stats = {};
  try { stats = JSON.parse(job.stats || "{}"); } catch { /* */ }
  let config = {};
  try { config = JSON.parse(job.config || "{}"); } catch { /* */ }
  res.json({ ok: true, id: job.id, status: job.status, config, stats, created_at: job.created_at, updated_at: job.updated_at });
});

app.get("/api/universe/build/:jobId/stream", (req, res) => {
  const jobId = req.params.jobId;
  const dbJob = getBuildJob(jobId);
  if (!buildJobs.get(jobId) && !dbJob) {
    res.status(404).end();
    return;
  }

  let entry = buildJobs.get(jobId);
  if (!entry) {
    entry = { subscribers: new Set() };
    buildJobs.set(jobId, entry);
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (evt) => {
    res.write(`data: ${JSON.stringify(evt)}\n\n`);
  };

  if (dbJob) {
    let stats = {};
    try { stats = JSON.parse(dbJob.stats || "{}"); } catch { /* */ }
    send({ type: "build:snapshot", status: dbJob.status, ...stats });
  }

  entry.subscribers.add(send);
  req.on("close", () => {
    entry.subscribers.delete(send);
  });
});

app.post("/api/universe/build/:jobId/pause", (req, res) => {
  pauseBuild(req.params.jobId);
  res.json({ ok: true, status: "PAUSED" });
});

app.post("/api/universe/build/:jobId/resume", (req, res) => {
  resumeBuild(req.params.jobId);
  res.json({ ok: true, status: "RUNNING" });
});

app.post("/api/universe/build/:jobId/stop", (req, res) => {
  stopBuild(req.params.jobId);
  res.json({ ok: true, status: "STOPPED" });
});

app.get("/api/universe/builds", (_req, res) => {
  const rows = listBuildJobs(20);
  const result = rows.map((r) => {
    let stats = {};
    try { stats = JSON.parse(r.stats || "{}"); } catch { /* */ }
    let config = {};
    try { config = JSON.parse(r.config || "{}"); } catch { /* */ }
    return { id: r.id, status: r.status, config, stats, created_at: r.created_at, updated_at: r.updated_at };
  });
  res.json({ ok: true, builds: result });
});

const PORT = parseInt(process.env.PORT || "3001", 10);
reconcileStaleBuildJobs();
app.listen(PORT, () => {
  console.log(`Sourcing API http://127.0.0.1:${PORT}`);
});
// #endregion
