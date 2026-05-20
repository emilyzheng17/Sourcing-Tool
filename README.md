# Sourcing Tool

Deterministic, backend-driven sourcing for B2B industrial software vendors, tuned for a PE-style thesis: **mission-critical**, **vertically integrated**, **proprietary**, **founder-operated or vintage-PE**.

> **New user?** Read [`START.md`](START.md) instead — a non-technical, step-by-step walkthrough.

---

## What it does

1. **Discovers** companies from 13+ structured sources — **vertical-first**, then **product-specific** narrowing (PE portfolios, trade-association vendor lists, G2/Capterra/TrustRadius, Brave, Exa, Tavily, optional Apollo/Crunchbase, high-risk LinkedIn exports).
2. **Pre-scores** each candidate with a cheap homepage fetch (25KB cap, 8s timeout) to discard obvious garbage before expensive work.
3. **Enriches** high-potential candidates only (sub-pages, OpenCorporates registry, Brave acquisition queries gated behind score threshold).
4. **Classifies ownership** as Publicly Traded / Founder Owned / Founder Operated / VC Backed / PE Owned / Unknown via a deterministic rule engine with digital-archaeology signals (copyright years, legacy stack hints, founder narrative detection). **Publicly listed** vendors are auto-excluded (rejected) and blocked from rediscovery.
5. **Scores** against a configurable PE thesis using deterministic rules (no LLM required). Vertical-fit and product-fit scoring compare each candidate against the selected industry/product filters.
6. **Optionally classifies** mission-critical / vertically-integrated / proprietary via a pluggable LLM (OpenAI, Anthropic, Gemini, or local Ollama). **Default: off.**
7. **Persists** every result in SQLite (`universe.db`) with full audit trail (source attribution, enrichment events, priority scores) and supports manual analyst triage with reject/restore/save workflows.
8. **Filters** both search results and universe with shared criteria: ownership, company type, revenue, employee count, founded era, geography (ISO2 country allowlist), vertical fit, product match, thesis toggles, and confidence thresholds.
9. **Exports** an enriched Excel sheet.
10. **Overnight Universe Builder** — A permissive background pipeline that discovers from all sources without filter rejection, persists every candidate, and runs background enrichment + classification workers. Supports pause/resume/stop with SSE progress streaming and configurable runtime (up to 24h).
11. **Recommendations** — `POST /api/recommendations/from-saved` analyzes up to 120 saved companies and returns suggested verticals, product hints, and extra Brave/Exa-style queries (LLM when a provider is configured in Settings, otherwise heuristic).
12. **Similarity detection** — Find companies similar to rejected ones for bulk triage.

The pipeline streams results to the UI over Server-Sent Events as each company is scored. Large **target volume** settings run longer: the server extends the job time budget (up to 90 minutes) so more rows can finish enriching.

---

## Architecture

```
React UI (Vite, :5173)  ──/api──>  Express API (:3001)
                                       │
                                       ├── Source fan-out (parallel, 13 adapters)
                                       │     ├── PE portfolios (cheerio scrape)
                                       │     ├── Trade associations
                                       │     ├── G2 / Capterra / TrustRadius
                                       │     ├── Brave Search API (optional)
                                       │     ├── Exa.ai (optional)
                                       │     ├── Tavily (optional)
                                       │     ├── Apollo (optional)
                                       │     ├── Crunchbase (optional)
                                       │     └── High-risk exports (dual opt-in)
                                       │
                                       ├── Dedupe by domain
                                       ├── Stage A: Cheap pre-score (homepage 25KB + heuristics)
                                       │     └── Discard low-potential candidates
                                       ├── Stage B: Deep enrich (sub-pages, OpenCorporates, ATS)
                                       │     └── Brave acquisition mining (gated: score >= 65)
                                       ├── Ownership classification (rule-based + digital archaeology)
                                       ├── Vertical-fit + product-fit scoring
                                       ├── Rule-based thesis scoring
                                       ├── Optional LLM classifier (provider-pluggable)
                                       ├── Upsert to SQLite + SSE stream
                                       └── Persistent HTTP cache (SQLite-backed, TTL-aware)
```

### Overnight Universe Builder

```
POST /api/universe/build  ──>  overnightPipeline.js
                                       │
                                       ├── Permissive discovery (no filter rejection)
                                       │     └── Upserts every candidate + source attribution
                                       │
                                       ├── enrichmentWorker (polls enrichment_queue)
                                       │     ├── ENRICH_A: Homepage fetch + cheap pre-score
                                       │     └── ENRICH_B: Deep enrichment (gated by threshold)
                                       │
                                       └── classificationWorker (polls enrichment_queue)
                                             ├── Rule-based thesis scoring
                                             └── Optional Ollama LLM classification
```

Workers use a generic `workerLoop` with pause/resume/stop and deadline support. Build jobs, enrichment queue, source attribution, and events are all persisted in SQLite for resumability and audit.

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
├─ .env.example                Optional keys (Brave, Exa, Tavily, Apollo, Crunchbase, OpenAI, Anthropic, Gemini, Ollama)
├─ README.md                   This file
├─ START.md                    Non-technical walkthrough
├─ CLAUDE.md                   AI assistant context
│
├─ shared/                     Isomorphic code (client + server)
│   ├─ discoverCompanyFilter.js  Shared filter criteria matching (ownership, geo, vertical, product, thesis)
│   ├─ geoCountry.js            ISO2 normalization, region allowlists, geo merge helpers
│   └─ verticalFitConstants.js   Threshold constants shared across client/server
│
├─ src/                        Frontend (React + Vite)
│   ├─ main.jsx                Entry point
│   ├─ App.jsx                 Wraps CompanySourcingTool
│   ├─ CompanySourcingTool.jsx UI: sidebar filters, SSE search, cards, triage, export
│   └─ components/
│       └─ DiscoverFilterPanel.jsx  Shared filter drawer (vertical, product, ownership, geo, thesis)
│
├─ scripts/
│   └─ free-discovery.mjs     Standalone CLI for free-tier discovery runs
│
└─ server/                     Backend (Express + SQLite)
    ├─ index.js                Routes: search, universe, build, recommendations, company CRUD
    ├─ pipeline.js             Orchestrates fan-out → Stage A → Stage B → score → persist → stream
    ├─ overnightPipeline.js    Overnight Universe Builder: permissive discovery + background workers
    ├─ db.js                   better-sqlite3 wrapper (companies, build_jobs, enrichment_queue, company_sources, company_events, http_cache)
    ├─ enrich.js               Two-stage enrichment: Stage A (cheap pre-score) + Stage B (deep)
    ├─ score.js                Rule-based thesis scoring + manual override merging
    ├─ openCorporates.js       Free registry lookup for incorporation date
    ├─ queryTemplates.js       Deterministic Brave/Exa query generation (no LLM)
    │
    ├─ sources/                One adapter per discovery source
    │   ├─ index.js            Parallel fan-out
    │   ├─ peFirms.js          PE/growth firm portfolio scrapers
    │   ├─ peFirms.data.js     Curated list of firms + portfolio URLs
    │   ├─ rollupPages.data.js Roll-up platform portfolio URLs
    │   ├─ tradeAssocs.js      Per-vertical association pages
    │   ├─ g2.js               G2 category listing
    │   ├─ capterra.js         Capterra category listing
    │   ├─ trustRadius.js      TrustRadius category listing
    │   ├─ brave.js            Brave Search API
    │   ├─ exa.js              Exa.ai neural search
    │   ├─ tavily.js           Tavily Search API
    │   ├─ apollo.js           Apollo organization search (optional API key)
    │   ├─ crunchbase.js       Crunchbase organization search (optional API key)
    │   └─ highRisk/           Dual-opt-in ToS-sensitive sources
    │       ├─ index.js        Guard gate (ENABLE_HIGH_TOS_SOURCES + path)
    │       └─ linkedinExport.js  Offline LinkedIn export ingestion
    │
    ├─ workers/                Background workers for overnight builds
    │   ├─ enrichmentWorker.js Polls ENRICH_A / ENRICH_B jobs with concurrency control
    │   └─ classificationWorker.js  Polls CLASSIFY jobs, runs scoring + optional Ollama
    │
    ├─ providers/              LLM classifier plugins
    │   ├─ index.js            Provider selector
    │   ├─ none.js             Rules-only default
    │   ├─ openai.js
    │   ├─ anthropic.js
    │   ├─ gemini.js
    │   └─ ollama.js           Local LLM via Ollama
    │
    ├─ __tests__/              Test suite
    │   ├─ ownershipClassify.test.js
    │   ├─ discoverCompanyFilter.test.js
    │   ├─ companySimilarity.test.js
    │   ├─ productFit.test.js
    │   ├─ publicCompanySignals.test.js
    │   └─ candidateDiscoveryFilters.test.js
    │
    └─ lib/
        ├─ domains.js              normalizeDomain + filtering
        ├─ breadth.js              Discovery breadth multiplier for source caps
        ├─ cheapPreScore.js        Lightweight pre-score after single homepage fetch (Stage A gate)
        ├─ fetchText.js            Timed HTTP fetch + maxBytes cap + per-job cache + host jitter
        ├─ dbCache.js              SQLite-backed persistent HTTP cache with TTL
        ├─ ownershipClassify.js    Rule-based ownership inference (PE/VC/Founder/Unknown) + digital archaeology
        ├─ verticalFit.js          Evidence-based vertical match scoring
        ├─ productFit.js           Evidence-based product fit scoring
        ├─ companySimilarity.js    Similarity detection for bulk triage suggestions
        ├─ publicCompanySignals.js Fast-fail heuristics for public/agency companies
        ├─ ollamaHttp.js           Low-level Ollama HTTP client
        ├─ workerLoop.js           Generic polling loop with pause/resume/stop/deadline
        └─ savedProfileExpand.js   Recommendation expansion from saved portfolio
```

Runtime-generated files (gitignored): `universe.db`, `dist/`, `node_modules/`.

---

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET`  | `/api/health` | Health check |
| `GET`  | `/api/settings-status` | Which env keys the server detected |
| `POST` | `/api/search` | Kick off a search job; body includes `maxCompanies`, `breadth`, `selectedProducts`, `selectedVerticals`, filters, etc. Returns `{ jobId }`. |
| `GET`  | `/api/search/:jobId/stream` | SSE: `log`, `progress`, `company`, `done`, `error` |
| `GET`  | `/api/universe` | List persisted companies (query params: `savedOnly`, `rejectedOnly`, `limit`, `offset`) |
| `POST` | `/api/universe/query` | Server-side filtered universe query with full criteria matching |
| `POST` | `/api/companies/:id/save` | `{saved:boolean}` toggle |
| `POST` | `/api/companies/:id/classify` | `{manualMissionCritical?:"yes"\|"no"\|"maybe"\|"unset", ...}` |
| `POST` | `/api/companies/:id/reject` | `{rejected:boolean}` toggle (restore refused for auto public exclusions) |
| `POST` | `/api/admin/reject-public-listings` | Backfill: scan active universe and reject rows with public-listing signals |
| `POST` | `/api/companies/bulk-reject` | `{ids:[...]}` bulk reject |
| `POST` | `/api/companies/bulk-restore` | `{ids:[...]}` bulk restore rejected |
| `POST` | `/api/universe/similar-to-rejected` | Find companies similar to rejected anchors |
| `POST` | `/api/recommendations/from-saved` | Generate search recommendations from saved portfolio |
| `POST` | `/api/universe/build` | Start an overnight universe build job |
| `GET`  | `/api/universe/build/:jobId` | Check build job status + stats |
| `GET`  | `/api/universe/build/:jobId/stream` | SSE for build progress |
| `POST` | `/api/universe/build/:jobId/pause` | Pause a running build |
| `POST` | `/api/universe/build/:jobId/resume` | Resume a paused build |
| `POST` | `/api/universe/build/:jobId/stop` | Stop a build |
| `GET`  | `/api/universe/builds` | List recent build jobs |

### Search request highlights

- **Multi-product**: `selectedProducts` sweeps several software categories in one job; each company row may include `matchedProducts`.
- **Breadth** scales internal source limits (Brave queries, PE firms scraped, G2/Capterra caps, Exa result count, etc.).
- **Scoring**: rule-based `thesisScore` adds `ageScore`, `employeeScore`, and `revenueScore` when data allows. Vertical-fit and product-fit penalties apply when filters are active.

## Environment variables

All optional. See [.env.example](.env.example).

| Var | Effect when set |
| --- | --- |
| `BRAVE_API_KEY` | Adds Brave Search source + acquisition snippet mining during enrichment |
| `EXA_API_KEY` | Adds Exa neural "find similar" source |
| `TAVILY_API_KEY` | Adds Tavily Search source |
| `APOLLO_API_KEY` | Activates Apollo organization search adapter |
| `CRUNCHBASE_API_KEY` | Activates Crunchbase adapter |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Optional LLM classifier (selectable in UI Settings) |
| `OLLAMA_URL` / `OLLAMA_MODEL` | Local Ollama classifier |
| `ENABLE_HIGH_TOS_SOURCES` + `LINKEDIN_EXPORT_PATH` | Dual opt-in for offline LinkedIn export ingestion |
| `PRESCORE_THRESHOLD` | Minimum cheap pre-score to proceed to deep enrichment (default 25) |
| `ACQUISITION_SCORE_THRESHOLD` | Minimum score to run Brave acquisition queries (default 65) |
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
- LinkedIn scraping (ToS-risky; offline export ingestion only behind dual opt-in).
- Multi-user auth (planned for later).

## License

Not specified; add a `LICENSE` file if needed.
