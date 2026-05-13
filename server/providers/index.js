import { noneClassifier } from "./none.js";
import { openaiClassifier } from "./openai.js";
import { anthropicClassifier } from "./anthropic.js";
import { geminiClassifier } from "./gemini.js";
import { ollamaClassifier } from "./ollama.js";

export function getClassifier(provider, env) {
  const p = (provider || "none").toLowerCase();
  if (p === "openai" && env.OPENAI_API_KEY) return openaiClassifier(env);
  if (p === "anthropic" && env.ANTHROPIC_API_KEY) return anthropicClassifier(env);
  if (p === "gemini" && env.GEMINI_API_KEY) return geminiClassifier(env);
  if (p === "ollama") return ollamaClassifier(env);
  return noneClassifier();
}
