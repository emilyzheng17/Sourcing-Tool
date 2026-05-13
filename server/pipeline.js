import { getClassifier } from "./providers/index.js";
import { enrichCandidate } from "./enrich.js";
import { scoreThesis, applyManualOverrides } from "./score.js";
import { normalizeDomain } from "./lib/domains.js";
import { discoverMergedCandidates } from "./lib/candidateDiscovery.js";
import { upsertCompany, getCompanyByDomain, getCompanyById, rowToCompany } from "./db.js";
import { breadthMultiplier } from "./lib/breadth.js";
import pLimit from "p-limit";

const JOB_MS_MIN = 10 * 60 * 1000;
const JOB_MS_MAX = 90 * 60 * 1000;

function clampedMaxCompanies(brief) {
  return Math.min(5000, Math.max(50, parseInt(String(brief.maxCompanies ?? 500), 10) || 500));
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

export async function runSearchPipeline(brief, env, emit) {
  const exclude = new Set((brief.excludeDomains || []).map((x) => normalizeDomain(x)).filter(Boolean));

  const m = breadthMultiplier(brief);
  const concurrency = m === 4 ? 14 : m === 2 ? 10 : 6;

  const fetchCache = new Map();
  const jitterHostState = new Map();
  const fetchOpts = { cache: fetchCache, jitterHostState };

  const deadline = Date.now() + jobDeadlineMs(brief);
  let timedOut = false;

  const { merged, timedOut: mergeTimedOut } = await discoverMergedCandidates(brief, env, fetchOpts, emit, {
    deadline,
    exclude,
  });
  timedOut = timedOut || mergeTimedOut;

  const classifier = getClassifier(brief.settings?.llmProvider || "none", env, emit);
  const enrichLimit = pLimit(concurrency);

  const total = merged.length;

  let completed = 0;
  await Promise.all(
    merged.map((c) =>
      enrichLimit(async () => {
        if (Date.now() > deadline) {
          timedOut = true;
          return;
        }

        const seeded = applyPaidHints(c);
        let enriched;
        try {
          enriched = await enrichCandidate(seeded, brief, env, fetchOpts);
        } catch (e) {
          emit({ type: "log", message: `Skip ${c.name}: ${e.message}` });
        } finally {
          completed += 1;
          emit({ type: "log", message: `Enrich ${completed}/${total}: ${c.name}` });
          emit({ type: "progress", processed: completed, total });
        }
        if (!enriched) return;

        let scored = { ...enriched, sourceTags: enriched.sourceTags || c.sourceTags || [c.sourceTag] };
        const ruleScore = scoreThesis(scored, brief);
        scored = { ...scored, ...ruleScore, score: ruleScore.thesisScore };

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

        const id = upsertCompany({
          domain: scored.domain,
          name: scored.name,
          website: scored.website,
          data: payload,
          isSaved: !!existingRow?.is_saved,
        });

        const row = getCompanyById(id);
        emit({ type: "company", company: rowToCompany(row) });
      })
    )
  );

  emit({ type: "done", total, processed: completed, timedOut: !!timedOut });
}
