/**
 * Background classification worker for the Overnight Universe Builder.
 *
 * Polls CLASSIFY jobs from the enrichment_queue, runs deterministic
 * scoreThesis, and optionally calls the Ollama provider for LLM labels.
 */

import { scoreThesis, applyManualOverrides } from "../score.js";
import { verticalFitThesisPenalty } from "../lib/verticalFit.js";
import { getClassifier } from "../providers/index.js";
import { startWorkerLoop } from "../lib/workerLoop.js";
import {
  claimEnrichmentJobs,
  completeEnrichmentJob,
  failEnrichmentJob,
  updateCompanyStatus,
  insertCompanyEvent,
  getCompanyById,
  upsertCompany,
  rowToCompany,
  getDb,
} from "../db.js";

const workers = new Map();

export function startClassificationWorker(jobId, config, env, emit, onDeadline) {
  const useOllama = !!config.useOllama;
  const deadline = typeof config.deadline === "number" ? config.deadline : null;
  const brief = {
    selectedVerticals: config.selectedVerticals || [],
    selectedProducts: config.selectedProducts || [],
  };

  let stopped = false;

  const loop = startWorkerLoop({
    jobId,
    pollIntervalMs: 3000,
    isStopped: () => stopped || (deadline != null && Date.now() > deadline),
    getDeadline: () => deadline ?? undefined,
    onDeadline: () => {
      stopped = true;
      emit({ type: "timeout", jobId });
      onDeadline?.();
    },
    async processBatch() {
      const jobs = claimEnrichmentJobs("CLASSIFY", 2);
      if (!jobs.length) return false;

      for (const job of jobs) {
        const companyId = job.company_id;
        try {
          const row = getCompanyById(companyId);
          if (!row) {
            completeEnrichmentJob(job.id);
            continue;
          }

          let company = rowToCompany(row);
          const ruleScore = scoreThesis(company, brief);

          let thesisPts = ruleScore.thesisScore;
          if (
            brief.selectedVerticals.length > 0 &&
            typeof company.verticalFitScore === "number"
          ) {
            thesisPts -= verticalFitThesisPenalty(company.verticalFitScore);
          }
          thesisPts = Math.max(0, Math.min(100, Math.round(thesisPts)));

          company = { ...company, ...ruleScore, score: thesisPts };

          if (useOllama) {
            try {
              const classifier = getClassifier("ollama", env, () => {});
              if (classifier && classifier.name !== "none") {
                const llm = await classifier.classify({
                  homepageText: (company.homepageTextSample || "").slice(0, 8000),
                  companyName: company.name,
                });
                if (llm) {
                  company = {
                    ...company,
                    missionCriticalLLM: llm.missionCritical,
                    verticallyIntegratedLLM: llm.verticallyIntegrated,
                    proprietaryStackLLM: llm.proprietaryStack,
                    missionCriticalReasonLLM: llm.missionCriticalReason,
                    verticalIntegrationReasonLLM: llm.verticalIntegrationReason,
                    llmConfidence: llm.confidence,
                    missionCritical: !!llm.missionCritical,
                    verticallyIntegrated: !!llm.verticallyIntegrated,
                    proprietaryStack: llm.proprietaryStack !== false,
                    classificationSource: "llm",
                  };
                }
              }
            } catch (e) {
              console.error(`[classifyWorker] Ollama failed for ${company.name}: ${e.message}`);
            }
          }

          const manual = {
            manual_mission_critical: row.manual_mission_critical,
            manual_vertically_integrated: row.manual_vertically_integrated,
            manual_proprietary: row.manual_proprietary,
          };
          company = applyManualOverrides(company, manual);

          getDb().transaction(() => {
            upsertCompany({
              domain: company.domain,
              name: company.name,
              website: company.website,
              data: company,
            });

            updateCompanyStatus(companyId, "CLASSIFIED", {
              last_classified_at: new Date().toISOString(),
            });

            completeEnrichmentJob(job.id);
            insertCompanyEvent(companyId, "CLASSIFIED", {
              thesisScore: thesisPts,
              ownership_class: company.ownership_class,
              useOllama,
            });
          })();

          emit({
            type: "classified",
            domain: company.domain,
            companyId,
            thesisScore: thesisPts,
            ownership_class: company.ownership_class,
          });
        } catch (e) {
          failEnrichmentJob(job.id, e.message);
          emit({ type: "classify_failed", domain: job.domain, companyId, error: e.message });
        }
      }

      return true;
    },
  });

  workers.set(jobId, { loop, stop: () => { stopped = true; loop.stop(); } });
}

export function stopClassificationWorker(jobId) {
  const w = workers.get(jobId);
  if (w) {
    w.stop();
    workers.delete(jobId);
  }
}
