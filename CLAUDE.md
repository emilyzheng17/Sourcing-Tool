# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- Install: `npm install`
- Development: `npm run dev` (starts server and client)
- Server only: `npm run server`
- Client only: `npm run client`
- Build: `npm run build`
- Tests: `npm run test`
- Rebuild SQLite: `npm run rebuild-sqlite`
- Source Expansion: `npm run source-expansion` (background company discovery)

## Architecture
The project is a B2B sourcing tool with a React frontend and an Express backend using SQLite.

### Frontend (`src/`)
- React + Vite.
- Main UI logic is centered in `src/CompanySourcingTool.jsx`.
- Proxies `/api` requests to the backend via `vite.config.js`.

### Backend (`server/`)
- Express API (`index.js`)
- **Sourcing Pipeline** (`pipeline.js`): Coordinates the flow: Discovery $\to$ Enrichment $\to$ Scoring $\to$ Persistence $\to$ SSE Streaming.
- **Discovery Sources** (`server/sources/`): Pluggable adapters for finding companies (e.g., PE portfolios, G2, Capterra, Brave, Exa, Apollo, Crunchbase). Registered in `server/sources/index.js`.
- **LLM Providers** (`server/providers/`): Pluggable classifiers for thesis analysis (OpenAI, Anthropic, Gemini, Ollama). Registered in `server/providers/index.js`.
- **Enrichment & Scoring**:
  - `enrich.js`: Extracts data from vendor homepages and OpenCorporates.
  - `score.js`: Applies deterministic rule-based scoring for a PE-style thesis.
- **Database**: `better-sqlite3` wrapper in `db.js`, persisting data to `universe.db`.
- **Source Expansion** (`server/sourceExpansion/`): Background ingestion system that continuously discovers companies from registries, marketplaces, PE portfolios, and ecosystem directories. Feeds into the same enrichment pipeline.

### Source Expansion (`server/sourceExpansion/`)
- `index.js`: Entry point — `runSourceExpansion()` + adapter registry.
- `orchestrator.js`: Runs adapters by tier with bounded concurrency, handles resume via frontier cursors. Writes to `pool='prospect'`.
- `normalize.js`: Candidate normalization and dedup by domain.
- `prioritizer.js`: Cheap priority scoring (0–100) using source tier + metadata signals (no homepage fetch).
- `frontier.js`: Cursor-based crawl state management backed by `expansion_cursors` DB table.
- `adapters/base.js`: Base adapter class — each adapter is an async generator yielding `{ companies, cursor, done }` batches.
- `adapters/`: 23 adapters across 3 tiers (government registries, SaaS marketplaces, PE portfolios, ecosystem directories).

### Prospect Pool
- Companies have a `pool` column: `'universe'` (default) or `'prospect'`.
- Source expansion writes `pool='prospect'`; interactive search and overnight builder write `pool='universe'`.
- Universe queries (`listUniverse`, `iterateActiveUniverseRows`, `listActiveCompanySimilarityStubs`) filter `pool='universe'`.
- `prospectEnrich.js`: Enqueue prospects for enrichment and start background workers. Auto-promotes to `pool='universe'` on enrichment completion.
- Prospect API: `GET /api/prospects`, `POST /api/prospects/enrich`, `POST /api/prospects/promote`, `POST /api/prospects/reject`.

## Development Patterns
- **Adding a new source**: Create a search function in `server/sources/` and add it to the `Promise.all` block in `server/sources/index.js`.
- **Adding a Source Expansion adapter**: Extend `BaseAdapter` in `server/sourceExpansion/adapters/`, implement `async *crawl(frontier, options)`, and register in `server/sourceExpansion/index.js`.
- **Adding an LLM provider**: Create a classifier in `server/providers/`, register it in `server/providers/index.js`, and add it to the settings dropdown in `src/CompanySourcingTool.jsx`.
- **Configuration**: Environment variables are managed via `.env` (see `.env.example`).
