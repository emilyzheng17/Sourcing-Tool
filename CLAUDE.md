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

## Development Patterns
- **Adding a new source**: Create a search function in `server/sources/` and add it to the `Promise.all` block in `server/sources/index.js`.
- **Adding an LLM provider**: Create a classifier in `server/providers/`, register it in `server/providers/index.js`, and add it to the settings dropdown in `src/CompanySourcingTool.jsx`.
- **Configuration**: Environment variables are managed via `.env` (see `.env.example`).
