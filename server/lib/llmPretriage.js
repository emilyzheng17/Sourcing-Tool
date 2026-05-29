/**
 * Optional Ollama gate between Stage A and Stage B enrichment.
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

export function isOllamaPretriageEnabled(env) {
  if (!normalizeOllamaBase(env.OLLAMA_URL)) return false;
  const v = String(env.OLLAMA_PRETRIAGE || "").toLowerCase();
  return ["1", "true", "yes", "on"].includes(v);
}

/**
 * @param {object} params
 * @param {string} params.companyName
 * @param {string} params.homepageText
 * @param {string[]} params.verticals
 * @param {string} params.activeProduct
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<{ pass: boolean, confidence: number, reason: string }>}
 */
export async function ollamaPretriageCandidate({ companyName, homepageText, verticals, activeProduct, env }) {
  const base = normalizeOllamaBase(env.OLLAMA_URL);
  const model = env.OLLAMA_MODEL || "llama3.2";
  const verts = verticals?.length ? verticals.join("; ") : "industrial B2B";
  const product = activeProduct || "B2B software";

  const prompt = `Is this a B2B vertical/industrial SOFTWARE vendor (not agency, consultancy, or public mega-cap)?
Verticals sought: ${verts}
Product category: ${product}
Company: ${companyName}

Return ONLY JSON: {"isB2BVerticalSoftware":boolean,"confidence":number,"reason":string}

Homepage text:
${String(homepageText || "").slice(0, 6000)}`;

  const text = await ollamaChatOrGenerate(base, model, prompt);
  const j = parseJsonFromText(text) || {};
  const pass = !!j.isB2BVerticalSoftware;
  const confidence = typeof j.confidence === "number" ? j.confidence : pass ? 0.6 : 0.4;
  const minConf = parseFloat(String(env.OLLAMA_PRETRIAGE_MIN_CONFIDENCE || "0.45")) || 0.45;

  if (!pass && confidence >= minConf) {
    return { pass: false, confidence, reason: String(j.reason || "not vertical B2B software") };
  }
  if (pass || confidence < minConf) {
    return { pass: true, confidence, reason: String(j.reason || "") };
  }
  return { pass: false, confidence, reason: String(j.reason || "low fit") };
}
