import { getClassifier } from "./providers/index.js";
import { enrichCandidate } from "./enrich.js";
import { scoreThesis, applyManualOverrides } from "./score.js";
import { fanOutSources } from "./sources/index.js";
import { normalizeDomain, mergeSourceTags, isLikelyCompanyDomain } from "./lib/domains.js";
import { upsertCompany, getCompanyByDomain, getCompanyById, rowToCompany } from "./db.js";
import pLimit from "p-limit";

function primaryKey(c) {
  const d = normalizeDomain(c.website);
  if (!d) return "";
  if (d.includes("g2.com") || d.includes("capterra.com") || d.includes("getapp.com")) {
    const slug = (c.name || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
    return `listing:${slug}`;
  }
  return d;
}

function mergeCandidates(buckets) {
  const map = new Map();
  for (const arr of Object.values(buckets)) {
    for (const c of arr || []) {
      if (!c?.website) continue;
      const key = primaryKey(c);
      if (!key) continue;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { ...c, sourceTags: [c.sourceTag].filter(Boolean) });
      } else {
        existing.sourceTags = mergeSourceTags(existing.sourceTags, [c.sourceTag]);
        if (!existing.name && c.name) existing.name = c.name;
        existing.rawMetadata = { ...existing.rawMetadata, ...c.rawMetadata };
      }
    }
  }
  return [...map.values()];
}

export async function runSearchPipeline(brief, env, emit) {
  const exclude = new Set((brief.excludeDomains || []).map((x) => normalizeDomain(x)).filter(Boolean));

  emit({ type: "log", message: "Fan-out: PE portfolios, associations, G2, Capterra, Brave, Exa…" });
  const buckets = await fanOutSources(brief, env);
  const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v?.length || 0]));
  emit({ type: "log", message: `Sources raw: ${JSON.stringify(counts)}` });

  let merged = mergeCandidates(buckets);
  merged = merged.filter((c) => {
    const d = normalizeDomain(c.website);
    if (!d) return false;
    if (exclude.has(d)) return false;
    if (d.includes("g2.com") || d.includes("capterra.com") || d.includes("getapp.com")) return true;
    return isLikelyCompanyDomain(d);
  });

  emit({ type: "log", message: `Merged unique domains: ${merged.length}` });

  const limitRun = Math.min(merged.length, brief.maxCompanies ?? 200);
  merged = merged.slice(0, limitRun);

  const classifier = getClassifier(brief.settings?.llmProvider || "none", env);
  const enrichLimit = pLimit(6);

  let idx = 0;
  await Promise.all(
    merged.map((c) =>
      enrichLimit(async () => {
        idx += 1;
        emit({ type: "log", message: `Enrich ${idx}/${merged.length}: ${c.name}` });
        let enriched;
        try {
          enriched = await enrichCandidate(c, brief, env);
        } catch (e) {
          emit({ type: "log", message: `Skip ${c.name}: ${e.message}` });
          return;
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

  emit({ type: "done", total: merged.length });
}
