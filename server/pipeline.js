import { getClassifier } from "./providers/index.js";
import { enrichCandidateStageA, enrichCandidateStageB } from "./enrich.js";
import { scoreThesis, applyManualOverrides } from "./score.js";
import { normalizeDomain } from "./lib/domains.js";
import { discoverMergedCandidatesStreaming } from "./lib/candidateDiscovery.js";
import {
  upsertCompany,
  getCompanyByDomain,
  getCompanyById,
  getFreshCompanyByDomain,
  rowToCompany,
  markPublicCompanyExcluded,
  listPublicExcludedDomains,
} from "./db.js";
import { isPublicListingCandidate } from "./lib/publicCompanySignals.js";
import { isPublicExcludedRow, buildCorpusFromCompanyData } from "./lib/publicExclusion.js";
import { breadthMultiplier } from "./lib/breadth.js";
import { VERTICAL_MATCH_THRESHOLD, verticalFitThesisPenalty } from "./lib/verticalFit.js";
import { normalizeToIso2 } from "../shared/geoCountry.js";
import { resetFetchCacheAccounting } from "./lib/fetchText.js";
import { isOllamaPretriageEnabled, ollamaPretriageCandidate } from "./lib/llmPretriage.js";
import PQueue from "p-queue";

const SOURCE_QUALITY_THRESHOLD = 50;

// #region Pipeline config
const JOB_MS_MIN = 10 * 60 * 1000;
const JOB_MS_MAX = 90 * 60 * 1000;
/** Per-candidate wall clock (enrichment + scoring + LLM + DB). */
const TASK_TIMEOUT_MS = 120_000;

function withTaskTimeout(fn, ms = TASK_TIMEOUT_MS) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("task timeout")), ms);
    }),
  ]);
}

function clampedMaxCompanies(brief) {
  return Math.min(5000, Math.max(50, parseInt(String(brief.maxCompanies ?? 1000), 10) || 1000));
}

/**
 * Scale wall-clock budget with candidate count & breadth — large runs need longer to enrich.
 */
function jobDeadlineMs(brief) {
  const n = clampedMaxCompanies(brief);
  const m = breadthMultiplier(brief);
  const breadthFactor = m === 4 ? 1.35 : m === 2 ? 1.15 : 1;
  const added = Math.floor(n / 50) * 45 * 1000;
  const raw = JOB_MS_MIN + added * breadthFactor;
  return Math.min(JOB_MS_MAX, raw);
}

function applyPaidHints(candidate) {
  const md = candidate.rawMetadata || {};
  const foundedYear =
    candidate.foundedYear ??
    (md.apolloFoundedYear != null ? parseInt(String(md.apolloFoundedYear), 10) : null);
  return {
    ...candidate,
    employees: candidate.employees ?? md.apolloEmployees ?? md.crunchbaseEmployees ?? null,
    hq: candidate.hq ?? md.hq ?? null,
    foundedYear: Number.isFinite(foundedYear) ? foundedYear : candidate.foundedYear ?? null,
    revenue: candidate.revenue ?? null,
  };
}
// #endregion

// #region runSearchPipeline
export async function runSearchPipeline(brief, env, emit) {
  const exclude = new Set((brief.excludeDomains || []).map((x) => normalizeDomain(x)).filter(Boolean));
  for (const d of listPublicExcludedDomains()) exclude.add(d);

  const m = breadthMultiplier(brief);
  const concurrency = m === 4 ? 14 : m === 2 ? 10 : 6;

  const fetchCache = new Map();
  const jitterHostState = new Map();
  const fetchOpts = { cache: fetchCache, jitterHostState };

  const deadline = Date.now() + jobDeadlineMs(brief);
  let timedOut = false;

  const classifier = getClassifier(brief.settings?.llmProvider || "none", env, emit);
  const queue = new PQueue({ concurrency });

  let completed = 0;
  const progress = { scheduled: 0 };
  const ttlDays = brief.cacheMaxAgeDays ?? Number(env.ENRICH_CACHE_TTL_DAYS || 30);
  const pretriageEnabled = isOllamaPretriageEnabled(env);
  /** @type {Map<string, { count: number, sumScore: number, geThreshold: number }>} */
  const sourceQualityStats = new Map();

  function recordSourceQuality(scored) {
    const tags = Array.isArray(scored.sourceTags) ? scored.sourceTags : [scored.sourceTag].filter(Boolean);
    const tag = tags[0] || "unknown";
    const cur = sourceQualityStats.get(tag) || { count: 0, sumScore: 0, geThreshold: 0 };
    cur.count += 1;
    cur.sumScore += typeof scored.score === "number" ? scored.score : 0;
    if (scored.score >= SOURCE_QUALITY_THRESHOLD) cur.geThreshold += 1;
    sourceQualityStats.set(tag, cur);
    emit({
      type: "source-quality",
      sourceTag: tag,
      thesisScore: scored.score,
      threshold: SOURCE_QUALITY_THRESHOLD,
    });
  }

  const { timedOut: mergeTimedOut } = await discoverMergedCandidatesStreaming(
    brief,
    env,
    fetchOpts,
    emit,
    {
      deadline,
      exclude,
    },
    (_key, getLatest) => {
      progress.scheduled += 1;
      queue.add(async () => {
        const cEarly = getLatest();
        const taskLabel = cEarly?.name || _key || "unknown";

        try {
          await withTaskTimeout(async () => {
            if (Date.now() > deadline) {
              timedOut = true;
              return;
            }

            const c = getLatest();
            if (!c) return;

            const domainGuess = normalizeDomain(c.website || c.domain || "");
            if (domainGuess) {
              const cached = getFreshCompanyByDomain(domainGuess, ttlDays);
              if (cached) {
                if (cached.is_rejected || isPublicExcludedRow(cached)) {
                  emit({
                    type: "log",
                    message: `Cache skip (excluded): ${cached.name || domainGuess}`,
                  });
                  return;
                }
                const cachedCompany = rowToCompany(cached);
                if (
                  isPublicListingCandidate({
                    combinedText: buildCorpusFromCompanyData(cachedCompany),
                  })
                ) {
                  markPublicCompanyExcluded({
                    domain: domainGuess,
                    id: cached.id,
                    source: "cache_hit",
                    extraData: cachedCompany,
                  });
                  emit({
                    type: "log",
                    message: `Cache exclude (public listing): ${cached.name || domainGuess}`,
                  });
                  return;
                }
                emit({ type: "log", message: `Cache hit (${ttlDays}d TTL): ${cached.name || domainGuess}` });
                emit({ type: "company", company: cachedCompany });
                return;
              }
            }

            const seeded = applyPaidHints(c);
            let enriched;
            try {
              const stageA = await enrichCandidateStageA(seeded, brief, env, fetchOpts);
              if (!stageA) {
                emit({ type: "log", message: `Pre-score reject: ${c.name}` });
                return;
              }
              if (pretriageEnabled) {
                try {
                  const triage = await ollamaPretriageCandidate({
                    companyName: c.name,
                    homepageText: stageA.homepageText || "",
                    verticals: brief.selectedVerticals || [],
                    activeProduct: brief.activeProduct,
                    env,
                  });
                  if (!triage.pass) {
                    emit({
                      type: "log",
                      message: `Pre-triage reject (${triage.confidence.toFixed(2)}): ${c.name} — ${triage.reason}`,
                    });
                    return;
                  }
                } catch (e) {
                  emit({ type: "log", message: `Pre-triage skip (error) for ${c.name}: ${e.message}` });
                }
              }
              enriched = await enrichCandidateStageB(seeded, stageA, brief, env, fetchOpts);
            } catch (e) {
              emit({ type: "log", message: `Skip ${c.name}: ${e.message}` });
              return;
            }
            if (!enriched) return;

            const allowedGeo = brief.allowedCountries;
            if (Array.isArray(allowedGeo) && allowedGeo.length > 0) {
              const allowedSet = new Set(
                allowedGeo.map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)),
              );
              if (allowedSet.size > 0) {
                const iso = normalizeToIso2(enriched.country);
                if (iso != null && !allowedSet.has(iso)) {
                  emit({ type: "log", message: `Skipped (geo ${iso}): ${enriched.name}` });
                  return;
                }
              }
            }

            const strictVertical =
              !!(brief.strictVerticalFit ||
                ["1", "true", "yes"].includes(String(env.STRICT_VERTICAL_FIT || "").toLowerCase()));

            if (
              strictVertical &&
              Array.isArray(brief.selectedVerticals) &&
              brief.selectedVerticals.length > 0 &&
              typeof enriched.verticalFitScore === "number" &&
              enriched.verticalFitScore < VERTICAL_MATCH_THRESHOLD
            ) {
              emit({
                type: "log",
                message: `Skipped (strict vertical, fit ${enriched.verticalFitScore}): ${enriched.name}`,
              });
              return;
            }

            if (
              Array.isArray(brief.selectedProducts) &&
              brief.selectedProducts.length > 0 &&
              Array.isArray(enriched.matchedProducts) &&
              enriched.matchedProducts.length === 0
            ) {
              emit({
                type: "log",
                message: `Skipped (no product fit, score ${enriched.productFitScore ?? 0}): ${enriched.name}`,
              });
              return;
            }

            let scored = { ...enriched, sourceTags: enriched.sourceTags || c.sourceTags || [c.sourceTag] };
            const ruleScore = scoreThesis(scored, brief);
            let thesisPts = ruleScore.thesisScore;
            if (
              Array.isArray(brief.selectedVerticals) &&
              brief.selectedVerticals.length > 0 &&
              typeof scored.verticalFitScore === "number"
            ) {
              thesisPts -= verticalFitThesisPenalty(scored.verticalFitScore);
            }
            thesisPts = Math.max(0, Math.min(100, Math.round(thesisPts)));
            scored = { ...scored, ...ruleScore, score: thesisPts };

            if (classifier && classifier.name !== "none") {
              try {
                const llm = await classifier.classify({
                  homepageText: (scored.homepageTextSample || "").slice(0, 8000),
                  companyName: scored.name,
                });
                if (llm) {
                  scored = {
                    ...scored,
                    missionCriticalLLM: llm.missionCritical,
                    verticallyIntegratedLLM: llm.verticallyIntegrated,
                    proprietaryStackLLM: llm.proprietaryStack,
                    missionCriticalReasonLLM: llm.missionCriticalReason,
                    verticalIntegrationReasonLLM: llm.verticalIntegrationReason,
                    llmConfidence: llm.confidence,
                  };
                  if (brief.settings?.llmProvider && brief.settings.llmProvider !== "none") {
                    scored.missionCritical = !!llm.missionCritical;
                    scored.verticallyIntegrated = !!llm.verticallyIntegrated;
                    scored.proprietaryStack = llm.proprietaryStack !== false;
                    scored.classificationSource = "llm";
                  }
                }
              } catch (e) {
                emit({ type: "log", message: `LLM classify failed for ${scored.name}: ${e.message}` });
              }
            }

            const existingRow = getCompanyByDomain(scored.domain);
            const manual = existingRow
              ? {
                  manual_mission_critical: existingRow.manual_mission_critical,
                  manual_vertically_integrated: existingRow.manual_vertically_integrated,
                  manual_proprietary: existingRow.manual_proprietary,
                }
              : {};
            scored = applyManualOverrides(scored, manual);

            const payload = {
              ...scored,
              sources: [
                ...(scored.openCorporates?.ocUrl ? [scored.openCorporates.ocUrl] : []),
                scored.website,
              ].filter(Boolean),
            };

            if (
              scored.ownership_class === "Publicly Traded" ||
              isPublicListingCandidate({ combinedText: buildCorpusFromCompanyData(payload) })
            ) {
              markPublicCompanyExcluded({
                domain: scored.domain,
                source: "pipeline",
                extraData: payload,
              });
              emit({ type: "log", message: `Excluded (public listing): ${scored.name}` });
              return;
            }

            const id = upsertCompany({
              domain: scored.domain,
              name: scored.name,
              website: scored.website,
              data: payload,
              isSaved: !!existingRow?.is_saved,
            });

            const row = getCompanyById(id);
            const companyOut = rowToCompany(row);
            recordSourceQuality(scored);
            emit({ type: "company", company: companyOut });
          });
        } catch (e) {
          emit({ type: "log", message: `Skip ${taskLabel}: ${e.message}` });
        } finally {
          completed += 1;
          emit({ type: "log", message: `Processed ${completed}/${progress.scheduled}: ${taskLabel}` });
          emit({ type: "progress", processed: completed, total: progress.scheduled });
        }
      });
    },
  );

  timedOut = timedOut || mergeTimedOut;

  // Listing pages dominate cache size; enrichment refetches company URLs as needed.
  fetchCache.clear();
  resetFetchCacheAccounting(fetchCache);

  const remainingMs = Math.max(0, deadline - Date.now());
  await Promise.race([
    queue.onIdle(),
    new Promise((resolve) => setTimeout(resolve, remainingMs)),
  ]);
  if (Date.now() > deadline) timedOut = true;

  if (sourceQualityStats.size > 0) {
    const summary = [...sourceQualityStats.entries()]
      .map(([tag, s]) => {
        const avg = s.count ? Math.round(s.sumScore / s.count) : 0;
        const pct = s.count ? Math.round((100 * s.geThreshold) / s.count) : 0;
        return `${tag}: n=${s.count} avg=${avg} ≥${SOURCE_QUALITY_THRESHOLD}=${pct}%`;
      })
      .join("; ");
    emit({ type: "log", message: `Source quality (thesis ≥${SOURCE_QUALITY_THRESHOLD}): ${summary}` });
    emit({
      type: "source-quality-summary",
      threshold: SOURCE_QUALITY_THRESHOLD,
      bySource: Object.fromEntries(
        [...sourceQualityStats.entries()].map(([tag, s]) => [
          tag,
          {
            count: s.count,
            avgScore: s.count ? Math.round(s.sumScore / s.count) : 0,
            pctAboveThreshold: s.count ? Math.round((100 * s.geThreshold) / s.count) : 0,
          },
        ]),
      ),
    });
  }

  emit({ type: "done", total: progress.scheduled, processed: completed, timedOut: !!timedOut });
}
// #endregion
