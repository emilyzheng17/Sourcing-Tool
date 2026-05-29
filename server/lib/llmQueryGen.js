/**
 * Ollama-powered discovery query generation (replaces broad template-only queries).
 */

import { normalizeOllamaBase, ollamaChatOrGenerate } from "./ollamaHttp.js";

function parseJsonFromText(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function isQueryGenEnabled(env) {
  if (!normalizeOllamaBase(env.OLLAMA_URL)) return false;
  const off = String(env.OLLAMA_QUERY_GEN || "1").toLowerCase();
  return !["0", "false", "no", "off"].includes(off);
}

function buildPrompt(brief) {
  const verticals = Array.isArray(brief.selectedVerticals) ? brief.selectedVerticals : [];
  const products = Array.isArray(brief.selectedProducts)
    ? brief.selectedProducts
    : brief.activeProduct
      ? [brief.activeProduct]
      : [];
  const tags = Array.isArray(brief.selectedTags) ? brief.selectedTags.slice(0, 12) : [];

  return `You help discover B2B vertical/industrial software companies for a PE sourcing thesis.
Target: founder-owned or vintage PE-backed vendors (NOT agencies, NOT public SaaS giants, NOT consultancies).
Verticals: ${verticals.length ? verticals.join("; ") : "industrial / vertical B2B"}
Products/categories: ${products.length ? products.join("; ") : brief.activeProduct || "B2B software"}
Tags: ${tags.length ? tags.join(", ") : "none"}

Return ONLY valid JSON:
{"searchQueries":string[],"exaQueries":string[]}

Rules:
- searchQueries: 12-18 precise web search strings (Brave/Google style). Include vertical + product + ownership hints (bootstrapped, founder-owned, private).
- Avoid generic queries like "best software companies".
- exaQueries: 2-3 short semantic phrases for neural search (mission-critical ops software in these verticals).
- No markdown.`;
}

/**
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {(e: object) => void} [emit]
 * @returns {Promise<{ searchQueries: string[], exaQueries: string[], source: string } | null>}
 */
export async function generateDiscoveryQueries(brief, env, emit = () => {}) {
  if (!isQueryGenEnabled(env)) return null;

  const existingBrave = brief.additionalSearchQueries?.length;
  const existingExa = brief.recommendationExaQueries?.length;
  if (existingBrave && existingExa) {
    return {
      searchQueries: brief.additionalSearchQueries,
      exaQueries: brief.recommendationExaQueries,
      source: "brief",
    };
  }

  const base = normalizeOllamaBase(env.OLLAMA_URL);
  const model = env.OLLAMA_MODEL || "llama3.2";

  try {
    emit({ type: "log", message: `[ollama] Generating discovery search queries (model=${model})…` });
    const text = await ollamaChatOrGenerate(base, model, buildPrompt(brief));
    const j = parseJsonFromText(text) || {};
    const searchQueries = (Array.isArray(j.searchQueries) ? j.searchQueries : [])
      .map((q) => String(q).trim())
      .filter((q) => q.length >= 8)
      .slice(0, 20);
    const exaQueries = (Array.isArray(j.exaQueries) ? j.exaQueries : [])
      .map((q) => String(q).trim())
      .filter((q) => q.length >= 8)
      .slice(0, 3);

    if (!searchQueries.length && !exaQueries.length) {
      emit({ type: "log", message: "[ollama] Query generation returned no queries; using templates only." });
      return null;
    }

    emit({
      type: "log",
      message: `[ollama] Discovery queries: ${searchQueries.length} search, ${exaQueries.length} Exa`,
    });
    return { searchQueries, exaQueries, source: "ollama" };
  } catch (e) {
    emit({ type: "log", message: `[ollama] Query generation failed: ${e.message || String(e)}` });
    return null;
  }
}
