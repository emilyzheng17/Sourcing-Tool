This is the To Do list for improvements on this application.

Ideal functionning:
A search is made to find as many companies as possible
They are then put in an unclassified file
That's where a llm or system can go through each found company and classify them according to the filters in the current software

The only information I would need it the website of each company, its name and the relevant information for the filters like ownership, location, what type of vertical, what type of product, revenue if possible, founded year if possible, employee count if possible.

They are then moved into the universe where they can be deleted and parsed easily


TO DO:
1. Make it a lot faster
2. Better Filtering on ownership (only options needed are: Founder Owned, Founder Operated, VC Backed and PE Owned)
3. Remove publically traded companies
4. MAYBE Add an unclassified tab, if it would allow the software to both discover and classify simultaniously
5. Would it be possible to batch the discovery searches so result are output a lot faster. That could mean going through each filter pair or whatever and doing them individually or in parallel instead of one big batch to make them faster?
6. Maybe running the manual search first, outputting results then each data source individually to make it faster
7. Are the searches already in the universe excluded?
8. Identify what is taking the longest to run by maybe running analytics.
9. Find a way to use less search api tokens. But still getting more search out of them.
10. Add each company that is found and parsed during the search directly to the universe so if the search fails later it doesnt forget them.
11. Make sure each company isnt duplicated in the search. Check the website links for that maybe.
12. Go through the codebase, remove stale code, find fundamental ways to parse information faster.

## Architecture analysis

This is a sophisticated critique of the current architecture. The two biggest performance leakages are:

1. **Global discovery barrier** — `runSearchPipeline` waits for all of `discoverMergedCandidates` to finish before any `enrichCandidate` runs. Enrichment is parallelized with `p-limit`, but nothing is enriched until discovery is complete.
2. **Late-stage heuristics** — `inferOwnershipClass` in `server/lib/ownershipClassify.js` already includes public-market and VC-style signals, but it runs **after** `enrich.js` has done expensive work (multi-page `fetchText`, sitemap, OpenCorporates, optional Brave, ATS, etc.). Most wall-clock cost is usually **before** the LLM, not only before the LLM.

**Already true today:** `fanOutSources` runs all source adapters in **parallel** (`Promise.all`). The **vertical × product** passes in `candidateDiscovery.js` are **sequential**; parallelizing those passes is a separate win from “parallel sources.”

**Universe vs search:** Domains already in `universe.db` are **not** automatically excluded from discovery; `excludeDomains` is client-driven (e.g. “find more” excludes current result domains only). Re-runs **upsert** and redo enrichment unless we add policy.

If the goal is a higher-speed engine for the Valsoft model, concrete implementation directions:

### 1. Streaming pipeline (producer–consumer)

Instead of discovery → enrichment as a single batch boundary, move toward a **reactive** model.

- **Change:** Refactor discovery so it can **yield** candidates incrementally (e.g. `AsyncGenerator`, or `EventEmitter` / callback as each source bucket returns).
- **Queue:** Prefer something that accepts **dynamic tasks** while running (e.g. `p-queue` with `add()`), not only a fixed `p-limit` over a pre-sized list.
- **Flow:** Discovery **produces** domains into the queue; enrichment **consumes** as soon as the first domains exist.
- **Result:** First company row can reach the UI in seconds while long-tail discovery still runs (target: meaningful **time-to-first-result**).

### 2. Fast-fail gate (early rejection) in `enrich.js`

Tier enrichment so **cheap signals run before expensive I/O**.

- **Stage 1 — Quick look:** Fetch **homepage only** (single `fetchText`).
- **Stage 2 — Regex / keyword gate (“Valsoft fast-fail”):** e.g. publicly traded / IR / ticker language (extend patterns already in `hasPublicSignals`); plus **out-of-scope** noise (consultancy/agency/custom dev “our clients” style) if productized.
- **Kill switch:** On hit, **return immediately** — no extra paths (`/pricing`, leadership, etc.), no sitemap crawl, no OpenCorporates, no Brave, no LLM.

**Note:** Deduplication / “skip enrich” must happen **before** `enrichCandidate` (or at its very top after one fetch), not only inside `upsertCompany`, which runs **after** enrichment.

### 3. Database-first deduplication (set-difference + TTL)

Before a domain enters the enrichment queue:

- Query `companies` by `domain` (e.g. `updated_at`).
- If a row exists and is **fresh** under a policy (e.g. **30-day TTL**), emit the cached row to SSE and **skip** re-enrichment; if stale, re-enrich.
- Optionally filter discovery output with `existingDomains` so known domains never queue (with the same TTL policy so data can refresh).

### 4. Ownership / “legacy VMS” heuristics

Improve `inferOwnershipClass.js` (and/or enrich corpus) with **digital archaeology** style signals, e.g.:

- **Copyright / staleness:** Old copyright span in footer (e.g. © 2008–2023) as a weak signal for stable, older VMS-style vendors (tune precision to avoid false positives).
- **Founder language:** Prefer `/about` or `/team` snippets when fetching selectively (after gate passes), not only homepage.
- **Legacy stack:** Hints in HTML (e.g. `.aspx`, very old jQuery/Bootstrap references) as a **positive** signal for Valsoft-style targets, not generic noise.

### 5. UI follow-ups for the above

- **Unclassified:** Universe view with a **status** dimension (`unclassified` vs classified); new discoveries land as unclassified while enrichment can lag or run in background.
- **Manual re-enrich:** Per-row **Refresh** to force a new scrape / re-score for one company without a global search.

### Summary by ROI (effort vs impact)

| Improvement | Effort | Impact | Why it helps Valsoft |
|-------------|--------|--------|----------------------|
| Early regex / noise gate after **one** homepage fetch | Low | High | Drops a large share of public/agency noise before expensive fetches and APIs. |
| DB set-difference + TTL before queue | Medium | High | Repeat searches become cheap; less redundant Brave/OC traffic. |
| Streaming discovery + enrichment queue | High | Medium–high | Fixes perceived latency (time-to-first-row); true wall-clock win depends on source latency mix. |
| Legacy / founder / copyright heuristics | Low–medium | Medium | Surfaces quiet, stable VMS-style names the thesis cares about. |

**Recommended first step:** Add the **public / noise fast-fail** immediately after the **first** homepage fetch in `enrichCandidate`, and short-circuit the rest of the function so sub-pages, sitemap, OpenCorporates, and Brave are skipped for obvious rejects.


Potential features:

Maybe add accounts
Maybe add analytics
Maybe, add a reclassify button that goes through each company and fixes all of the info and filters for each one.
Maybe, add an enrich button to each company that keeps track of all related sources for that company so information and go in further depth later.
Would it be relevant to make tools for each filter like a seperate tool for estimating employee count for a company.

Add the country in the showing of each company
Clean un each slab of info for the companeis