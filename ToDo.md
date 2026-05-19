This is the To Do list for improvements on this application.

Ideal functionning:
A search is made to find as many companies as possible
They are then put in an unclassified file
That's where a llm or system can go through each found company and classify them according to the filters in the current software

The only information I would need it the website of each company, its name and the relevant information for the filters like ownership, location, what type of vertical, what type of product, revenue if possible, founded year if possible, employee count if possible.

They are then moved into the universe where they can be deleted and parsed easily


TO DO:
1. ~~Make it a lot faster~~ **DONE** — Staged enrichment pipeline: cheap pre-score after homepage fetch discards ~70-90% of candidates before expensive work (sub-pages, OpenCorporates, Brave, ATS).
2. ~~Better Filtering on ownership~~ **DONE** — Rule-based `ownershipClassify.js` infers PE Owned / VC Backed / Founder Operated / Founder Owned / Unknown using corpus signals, digital archaeology (copyright years, legacy stack, founder narrative), and acquisition history. Shared `discoverCompanyFilter.js` normalizes old DB labels to the new canonical set.
3. ~~Remove publically traded companies~~ **DONE** — `shouldFastFailEnrichment` rejects public-company signals (NASDAQ/NYSE/IR/SEC) at Stage A before any deep enrichment runs.
4. ~~Add an unclassified tab~~ **DONE** — Overnight Universe Builder (`overnightPipeline.js`) discovers permissively, persists every candidate immediately, and background workers enrich/classify asynchronously. Companies progress through DISCOVERED → BASIC_ENRICHED → FULLY_ENRICHED → CLASSIFIED statuses.
5. ~~Would it be possible to batch the discovery searches so result are output a lot faster.~~ **DONE** — `discoverMergedCandidatesStreaming` yields candidates into the enrichment queue as each source returns; enrichment starts immediately.
6. ~~Maybe running the manual search first, outputting results then each data source individually to make it faster~~ **DONE** — streaming pipeline emits companies as soon as each one finishes enrichment.
7. ~~Are the searches already in the universe excluded?~~ **DONE** — `getFreshCompanyByDomain` with TTL policy allows skipping re-enrichment for fresh rows. Domains already in `universe.db` can emit the cached row to SSE.
8. ~~Identify what is taking the longest to run by maybe running analytics.~~ **DONE** — `company_events` table provides a full audit trail (DISCOVERED, BASIC_ENRICHED, FULLY_ENRICHED, CLASSIFIED, FAILED) with timestamps for pipeline analysis.
9. ~~Find a way to use less search api tokens. But still getting more search out of them.~~ **DONE** — Brave acquisition queries are now gated behind `cheapScore >= 65` (configurable via `ACQUISITION_SCORE_THRESHOLD`). Only high-potential candidates trigger API calls. Persistent HTTP cache (`dbCache.js`) avoids re-fetching across runs.
10. ~~Add each company that is found and parsed during the search directly to the universe so if the search fails later it doesnt forget them.~~ **DONE** — pipeline upserts each company immediately after scoring.
11. ~~Make sure each company isnt duplicated in the search. Check the website links for that maybe.~~ **DONE** — `candidateDiscovery.js` dedupes by normalized domain before enrichment.
12. ~~Go through the codebase, remove stale code, find fundamental ways to parse information faster.~~ **DONE** — Persistent HTTP cache, improved fetchText with jitter/throttle, shared filter logic extracted to `shared/`.

## Architecture analysis

All original architecture bottlenecks have been resolved:

1. ~~**Global discovery barrier**~~ **FIXED** — `discoverMergedCandidatesStreaming` + `PQueue` now enqueues candidates for enrichment as each source returns. No batch boundary.
2. ~~**Late-stage heuristics**~~ **FIXED** — Staged enrichment: `enrichCandidateStageA` runs a cheap pre-score (homepage 25KB fetch + heuristic scoring) and discards garbage before any sub-page crawl, OpenCorporates, Brave, or LLM work. Brave acquisition mining is additionally gated behind `cheapScore >= 65`.

**Already true today:** `fanOutSources` runs all source adapters in **parallel** (`Promise.all`). The **vertical × product** passes in `candidateDiscovery.js` are **sequential**; parallelizing those passes is a separate win from "parallel sources."

**Universe vs search:** `getFreshCompanyByDomain` with TTL policy can skip re-enrichment for fresh rows. Overnight Builder persists every candidate with `company_sources` attribution for provenance tracking.

### Summary by ROI (effort vs impact)

| Improvement | Effort | Impact | Status |
|-------------|--------|--------|--------|
| Early regex / noise gate after **one** homepage fetch | Low | High | **DONE** — `cheapPreScore` + `shouldFastFailEnrichment` in Stage A |
| DB set-difference + TTL before queue | Medium | High | **DONE** — `getFreshCompanyByDomain` + `http_cache` table |
| Streaming discovery + enrichment queue | High | Medium–high | **DONE** — `discoverMergedCandidatesStreaming` + `PQueue` |
| Legacy / founder / copyright heuristics | Low–medium | Medium | **DONE** — `ownershipClassify.js` digital archaeology signals |
| Brave acquisition queries gated by score | Low | High | **DONE** — only fires when `cheapScore >= 65` |
| Persistent HTTP cache | Medium | High | **DONE** — `dbCache.js` with SQLite-backed TTL |
| Overnight Universe Builder | High | Very high | **DONE** — `overnightPipeline.js` + background workers |
| Ownership classification engine | Medium | High | **DONE** — `ownershipClassify.js` with 5 canonical classes |
| Vertical & product fit scoring | Medium | High | **DONE** — `verticalFit.js` + `productFit.js` |
| Shared filter system | Medium | High | **DONE** — `shared/discoverCompanyFilter.js` + `geoCountry.js` |
| Company similarity / bulk triage | Medium | Medium | **DONE** — `companySimilarity.js` + similar-to-rejected API |
| New source adapters (TrustRadius, Tavily, LinkedIn export) | Low each | Medium | **DONE** |
| Reject / restore workflow | Low | Medium | **DONE** — single + bulk reject/restore with UI |
| Test coverage for core modules | Medium | High | **DONE** — 6 test suites covering ownership, filters, similarity, product fit, public signals |

---

## Remaining improvements (prioritized)

### Tier 1 — Highest impact, next up

- **Scheduled / cron universe builds** — Add a scheduler (node-cron or config-driven) so overnight builds run automatically on a cadence (e.g. weekly per vertical). Eliminates the need to manually trigger builds and keeps the universe growing continuously.

- **Smart re-enrichment with staleness detection** — Companies go stale. Auto-queue re-enrichment for rows whose `last_enriched_at` exceeds a configurable TTL (e.g. 30–60 days). Prioritize saved companies and high-scorers for refresh. Surface a "stale data" indicator in the UI.

- **Dashboard & analytics** — Visual overview of the universe: discovery funnel (discovered → enriched → classified → saved), source effectiveness breakdown (which sources yield the highest-scoring companies), ownership/vertical/product distribution charts, and time-series growth. Would turn this from a search tool into a sourcing platform.

- **Company detail page** — Dedicated full-page view for a single company with: complete event timeline (discovered, enriched, classified, saved), all source attributions, enrichment history, homepage excerpt, ownership reasoning, thesis score breakdown, and side-by-side comparison with similar companies. Currently all info is crammed into cards.

### Tier 2 — High value, moderate effort

- **Saved search configurations** — Store and replay search configurations (vertical + product + filter + breadth combos) with names. Lets analysts run the same sweep repeatedly without re-configuring. Natural companion to scheduled builds.

- **Parallel vertical × product discovery** — The vertical × product passes in `candidateDiscovery.js` are sequential. Parallelizing them (while preserving source-level rate limits) would significantly speed up multi-product discovery runs.

- **Company notes & analyst workflow** — Per-company free-text notes field, custom tags, and a workflow status dimension (e.g. "New", "Reviewing", "Contacted", "Passed") to support the analyst triage process beyond simple save/reject.

- **Notification system** — Webhook or email/Slack alerts when high-scoring companies are discovered (e.g. "5 new companies scored 80+ in Fleet Management overnight"). Critical for making scheduled builds actionable without checking the UI.

- **Export improvements** — Filtered Excel export (apply current filters before export), custom column selection, and optionally a one-page PDF company profile for investment committee memos.

### Tier 3 — Nice to have, lower urgency

- **Multi-user accounts & permissions** — User auth, role-based access, per-user saved lists, shared vs. private annotations. Needed if multiple analysts use the tool simultaneously.
- **Enrichment source health monitoring** — Track success/failure rates per source adapter over time. Alert when a scraper starts failing (e.g. G2 changed their page structure). Auto-disable broken sources.
- **Company merge / alias resolution** — Detect when multiple domains belong to the same parent company (e.g. after acquisitions, brand pivots) and merge them into a single record with all source attributions preserved.
- **Incremental discovery deltas** — Show what's "new since last run" in the UI. Tag companies by discovery batch, surface a "New this week" view, and highlight universe growth trends.
- **Configurable scoring weights** — Let the user tune thesis scoring weights from the UI (e.g. "I care more about founded year than employee count") instead of hard-coded rules in `score.js`.
- **API rate-limit dashboard** — Show remaining API quotas for Brave, Exa, Tavily, Apollo, Crunchbase in the settings panel so the user knows how much capacity is left before starting a large run.


## Potential features (long-term)

- Reclassify-all button that re-runs ownership + thesis scoring for every company in the universe.
- Per-company "Refresh" to force a new scrape / re-score without a global search.
- Integration with CRM (HubSpot, Salesforce) for pipeline handoff.
- LLM-powered deal memo generation from enriched company data.
- Geographic heat map visualization of the universe.
