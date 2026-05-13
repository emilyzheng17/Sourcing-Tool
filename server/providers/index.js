import { noneClassifier } from "./none.js";
import { openaiClassifier } from "./openai.js";
import { anthropicClassifier } from "./anthropic.js";
import { geminiClassifier } from "./gemini.js";
import { ollamaClassifier } from "./ollama.js";

/**
 * @param {string | undefined} provider
 * @param {NodeJS.ProcessEnv} env
 * @param {(evt: object) => void} [sseEmit] optional — e.g. Ollama relays to browser console via SSE
 */
export function getClassifier(provider, env, sseEmit) {
  const p = (provider || "none").toLowerCase();
  if (p === "openai" && env.OPENAI_API_KEY) return openaiClassifier(env);
  if (p === "anthropic" && env.ANTHROPIC_API_KEY) return anthropicClassifier(env);
  if (p === "gemini" && env.GEMINI_API_KEY) return geminiClassifier(env);
  if (p === "ollama") return ollamaClassifier(env, sseEmit);
  return noneClassifier();
}
