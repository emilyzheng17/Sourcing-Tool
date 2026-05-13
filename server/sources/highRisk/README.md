# High ToS-risk sources (`highRisk`)

This folder is intentionally **not** part of compliant-by-default discovery.

## What ships here

- **Offline ingestion only** (`linkedinExport.js`): read a `.json` or `.csv` you obtained through a process **you are responsible for** (e.g. user export, sanctioned partner API payloads).

## Controls

Dual opt-in:

1. `ENABLE_HIGH_TOS_SOURCES=1`
2. `LINKEDIN_EXPORT_PATH` pointing at a readable file

Optional caps: `LINKEDIN_RISK_MAX_ROWS` (default `500`)

## Disclaimer

Automating LinkedIn or other restrictive surfaces often violates terms and can suspend accounts unless you use an approved official API product. Nothing here performs live LinkedIn scraping; ingestion is limited to paths you explicitly supply on disk.
