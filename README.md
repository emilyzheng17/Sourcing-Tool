# Sourcing Tool

Deterministic, backend-driven sourcing for B2B industrial software vendors, tuned for a PE-style thesis: **mission-critical**, **vertically integrated**, **proprietary**, **founder-operated or vintage-PE**.

> **New user?** Read [`START.md`](START.md) instead — a non-technical, step-by-step walkthrough.

---

## What it does

1. **Discovers** companies from structured sources — **vertical-first**, then **product-specific** narrowing (same sources: PE portfolios, trade-association vendor lists, G2/Capterra, Brave, Exa, optional Apollo/Crunchbase).

2. **Enriches** each candidate (homepage scrape, OpenCorporates registry, targeted Brave acquisition queries).
3. **Scores** against a configurable PE thesis using deterministic rules (no LLM required).
4. **Optionally classifies** mission-critical / vertically-integrated / proprietary via a pluggable LLM (OpenAI, Anthropic, Gemini, or local Ollama). **Default: off.**
5. **Persists** every result in SQLite (`universe.db`) and supports manual analyst triage.
6. **Exports** an enriched Excel sheet.
7. **Recommendations** — `POST /api/recommendations/from-saved` analyzes up to 60 saved companies and returns suggested verticals, product hints, and extra Brave/Exa-style queries (LLM when a provider is configured in Settings, otherwise heuristic). The UI applies them to the next search only.

The pipeline streams results to the UI over Server-Sent Events as each company is scored. Large **target volume** settings run longer: the server extends the job time budget (up to 90 minutes) so more rows can finish enriching.

---

## Architecture

```
React UI (Vite, :5173)  ──/api──>  Express API (:3001)
                                       │
                                       ├── Source fan-out (parallel)
                                       │     ├── PE portfolios (cheerio scrape)
                                       │     ├── Trade associations
                                       │     ├── G2 / Capterra category pages
                                       │     ├── Brave Search API (optional)
                                       │     ├── Exa.ai (optional)
                                       │     ├── Apollo (optional)
                                       │     └── Crunchbase (optional)
                                       │
                                       ├── Dedupe by domain
                                       ├── Enrich (homepage + OpenCorporates + acquisition mining)
                                       ├── Rule-based thesis scoring
                                       ├── Optional LLM classifier (provider-pluggable)
                                       └── Upsert to SQLite + SSE stream
```

---

## Quick start (technical)

Requires **Node.js 18+** (20.18+ recommended for the `cheerio` engine warning to disappear).

```bash
cp .env.example .env       # all keys optional; tool runs without them
npm install
npm run dev                # spawns API (3001) + Vite (5173) via concurrently
```

Open **http://localhost:5173**.

---

## Project structure

```
Sourcing-Tool/
├─ index.html
├─ vite.config.js              Proxies /api to :3001
├─ package.json
├─ .env.example                Optional keys (Brave, Exa, Apollo, Crunchbase, OpenAI, Anthropic, Gemini, Ollama)
├─ README.md                   This file
├─ START.md                    Non-technical walkthrough
│
├─ src/                        Frontend (React + Vite)
│   ├─ main.jsx                Entry point
│   ├─ App.jsx                 Wraps CompanySourcingTool
│   └─ CompanySourcingTool.jsx UI: sidebar filters, SSE search, cards, triage, export
│
└─ server/                     Backend (Express + SQLite)
    ├─ index.js                Routes: /api/search, /api/universe, /api/recommendations/from-saved, /api/companies/:id/*
    ├─ pipeline.js             Orchestrates fan-out → enrich → score → persist → stream
    ├─ db.js                   better-sqlite3 wrapper for universe.db
    ├─ enrich.js               Resolves listing-page URLs → vendor sites, scrapes pages
    ├─ score.js                Rule-based thesis scoring + manual override merging
    ├─ openCorporates.js       Free registry lookup for incorporation date
    ├─ queryTemplates.js       Deterministic Brave/Exa query generation (no LLM)
    │
    ├─ sources/                One adapter per discovery source
    │   ├─ index.js            Parallel fan-out
    │   ├─ peFirms.js          PE/growth firm portfolio scrapers
    │   ├─ peFirms.data.js     Curated list of firms + portfolio URLs
    │   ├─ tradeAssocs.js      Per-vertical association pages
    │   ├─ g2.js               G2 category listing
    │   ├─ capterra.js         Capterra category listing
    │   ├─ brave.js            Brave Search API
    │   ├─ exa.js              Exa.ai neural search
    │   ├─ apollo.js           Apollo organization search (optional API key)
    │   └─ crunchbase.js       Crunchbase organization search (optional API key)
    │
    ├─ providers/              LLM classifier plugins
    │   ├─ index.js            Provider selector
    │   ├─ none.js             Rules-only default
    │   ├─ openai.js
    │   ├─ anthropic.js
    │   ├─ gemini.js
    │   └─ ollama.js           Local LLM via Ollama
    │
    └─ lib/
        ├─ domains.js          normalizeDomain + filtering
        ├─ breadth.js          Discovery breadth multiplier for source caps
        └─ fetchText.js        Timed HTTP fetch + optional per-job cache + host jitter
```

Runtime-generated files (gitignored): `universe.db`, `dist/`, `node_modules/`.

---

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET`  | `/api/health` | Health check |
| `GET`  | `/api/settings-status` | Which env keys the server detected |
| `POST` | `/api/search` | Kick off a job; body may include `maxCompanies` (50–2000, default 500), `breadth` (`focused` / `broad` / `exhaustive`), `selectedProducts` (array of category names — fan-out per product then merge), `selectedTagsByProduct`, plus `selectedVerticals`, `ownershipFilter`, `thesis`, `settings`, … Returns `{ jobId }`. |
| `GET`  | `/api/search/:jobId/stream` | SSE: `log`, `progress` (`{processed,total}`), `company`, `done` (`{total,processed,timedOut?}`), `error` |
| `GET`  | `/api/universe?savedOnly=1&limit=2000&offset=0` | List persisted companies (`limit` capped at 2000) |
| `POST` | `/api/companies/:id/save` | `{saved:boolean}` toggle |
| `POST` | `/api/companies/:id/classify` | `{manualMissionCritical?:"yes"|"no"|"maybe"|"unset", ...}` |

### Search request highlights

- **Multi-product**: `selectedProducts` sweeps several software categories in one job; each company row may include `matchedProducts`.
- **Breadth** scales internal source limits (Brave queries, PE firms scraped, G2/Capterra caps, Exa result count, etc.).
- **Scoring**: rule-based `thesisScore` adds `ageScore`, `employeeScore`, and `revenueScore` when data allows.

## Environment variables

All optional. See [.env.example](.env.example).

| Var | Effect when set |
| --- | --- |
| `BRAVE_API_KEY` | Adds Brave Search source + acquisition snippet mining during enrichment |
| `EXA_API_KEY` | Adds Exa neural "find similar" source |
| `APOLLO_API_KEY` | Activates Apollo organization search adapter |
| `CRUNCHBASE_API_KEY` | Activates Crunchbase adapter |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Optional LLM classifier (selectable in UI Settings) |
| `OLLAMA_URL` / `OLLAMA_MODEL` | Local Ollama classifier |
| `PORT` | API port (default 3001) |

---

## Adding a new source adapter

1. Drop a new file in [server/sources/](server/sources/) exporting `async function searchXxx(brief, env) → Candidate[]` where `Candidate = { name, website, sourceTag, rawMetadata }`.
2. Import + invoke it inside the `Promise.all` block of [server/sources/index.js](server/sources/index.js).
3. The pipeline handles dedupe, enrichment, and scoring automatically.

## Adding a new LLM provider

1. Add `server/providers/foo.js` exporting `fooClassifier(env) → { name, async classify({homepageText, companyName}) }`.
2. Wire it into [server/providers/index.js](server/providers/index.js).
3. Add `"foo"` to the dropdown in [src/CompanySourcingTool.jsx](src/CompanySourcingTool.jsx) Settings modal.

---

## Out of scope

- PitchBook (enterprise-only API).
- LinkedIn scraping (ToS-risky).
- Multi-user auth.

## License

Not specified; add a `LICENSE` file if needed.
