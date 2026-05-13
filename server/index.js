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
} from "./db.js";
import { companyPassesDiscoverFilters } from "../shared/discoverCompanyFilter.js";
import { expandFromSavedPortfolio } from "./lib/savedProfileExpand.js";
import { stubFromRow, findSimilarToAnchors } from "./lib/companySimilarity.js";

// Undici's fetch() attaches several internal listeners per in-flight request. The search
// pipeline runs many concurrent fetches (see pipeline.js p-limit); default limit is 10.
EventEmitter.defaultMaxListeners = Math.max(EventEmitter.defaultMaxListeners || 10, 32);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const jobs = new Map();

app.get("/api/health", (_req, res) => {
  getDb();
  res.json({ ok: true });
});

app.get("/api/settings-status", (_req, res) => {
  const env = process.env;
  res.json({
    brave: !!env.BRAVE_API_KEY,
    exa: !!env.EXA_API_KEY,
    apollo: !!env.APOLLO_API_KEY,
    crunchbase: !!env.CRUNCHBASE_API_KEY,
    tavily: !!env.TAVILY_API_KEY,
    highRiskExports: !!(env.ENABLE_HIGH_TOS_SOURCES === "1" && env.LINKEDIN_EXPORT_PATH),
    openai: !!env.OPENAI_API_KEY,
    anthropic: !!env.ANTHROPIC_API_KEY,
    gemini: !!env.GEMINI_API_KEY,
    ollama: !!(env.OLLAMA_URL || true),
  });
});

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
  setRejected(id, rejected);
  const row = getCompanyById(id);
  if (!row) {
    res.status(404).json({ ok: false, message: "Company not found" });
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

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
  console.log(`Sourcing API http://127.0.0.1:${PORT}`);
});
