import "dotenv/config";
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
} from "./db.js";
import { expandFromSavedPortfolio } from "./lib/savedProfileExpand.js";

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
  const savedOnly = req.query.savedOnly === "1" || req.query.savedOnly === "true";
  const { rows, total } = listUniverse({ offset, limit, savedOnly });
  res.json({
    total,
    offset,
    companies: rows.map(rowToCompany),
  });
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

const PORT = parseInt(process.env.PORT || "3001", 10);
app.listen(PORT, () => {
  console.log(`Sourcing API http://127.0.0.1:${PORT}`);
});
