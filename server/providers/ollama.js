import { normalizeOllamaBase, ollamaChatOrGenerate } from "../lib/ollamaHttp.js";

function parseJsonFromText(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** @param {(evt: object) => void} [sseEmit] */
function logLine(sseEmit, level, message) {
  if (typeof sseEmit === "function") {
    try {
      sseEmit({ type: "browserConsole", level, message });
    } catch {
      /* ignore */
    }
  }
  if (level === "warn") console.warn(message);
  else console.log(message);
}

/** @param {NodeJS.ProcessEnv} env @param {(evt: object) => void} [sseEmit] */
export function ollamaClassifier(env, sseEmit) {
  const base = normalizeOllamaBase(env.OLLAMA_URL);
  const model = env.OLLAMA_MODEL || "llama3.2";
  return {
    name: "ollama",
    async classify({ homepageText, companyName }) {
      const label = (companyName || "unknown").slice(0, 72);
      const t0 = Date.now();
      logLine(sseEmit, "log", `[ollama] classify start model=${model} base=${base} company="${label}"`);

      try {
        const userContent = `Return ONLY JSON: {"missionCritical":boolean,"verticallyIntegrated":boolean,"proprietaryStack":boolean,"missionCriticalReason":string,"verticalIntegrationReason":string,"confidence":number}

Company: ${companyName}
Text:
${homepageText.slice(0, 8000)}`;

        const text = await ollamaChatOrGenerate(base, model, userContent);
        const parsed = parseJsonFromText(text);
        const j = parsed || {};
        if (!parsed) {
          logLine(
            sseEmit,
            "warn",
            `[ollama] classify no JSON parsed (${Date.now() - t0}ms) company="${label}" rawLen=${text.length}`
          );
        }
        const out = {
          missionCritical: !!j.missionCritical,
          verticallyIntegrated: !!j.verticallyIntegrated,
          proprietaryStack: j.proprietaryStack !== false,
          missionCriticalReason: String(j.missionCriticalReason || ""),
          verticalIntegrationReason: String(j.verticalIntegrationReason || ""),
          confidence: typeof j.confidence === "number" ? j.confidence : 0.4,
        };
        const ms = Date.now() - t0;
        logLine(
          sseEmit,
          "log",
          `[ollama] classify ok ${ms}ms company="${label}" missionCritical=${out.missionCritical} verticallyIntegrated=${out.verticallyIntegrated} proprietaryStack=${out.proprietaryStack} confidence=${out.confidence}`
        );
        return out;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        logLine(sseEmit, "warn", `[ollama] classify error (${Date.now() - t0}ms) company="${label}" ${err.message}`);
        throw err;
      }
    },
  };
}
