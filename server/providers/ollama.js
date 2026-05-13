function parseJsonFromText(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export function ollamaClassifier(env) {
  const base = (env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = env.OLLAMA_MODEL || "llama3.2";
  return {
    name: "ollama",
    async classify({ homepageText, companyName }) {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            {
              role: "user",
              content: `Return ONLY JSON: {"missionCritical":boolean,"verticallyIntegrated":boolean,"proprietaryStack":boolean,"missionCriticalReason":string,"verticalIntegrationReason":string,"confidence":number}

Company: ${companyName}
Text:
${homepageText.slice(0, 8000)}`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      const data = await res.json();
      const text = data.message?.content || "";
      const j = parseJsonFromText(text) || {};
      return {
        missionCritical: !!j.missionCritical,
        verticallyIntegrated: !!j.verticallyIntegrated,
        proprietaryStack: j.proprietaryStack !== false,
        missionCriticalReason: String(j.missionCriticalReason || ""),
        verticalIntegrationReason: String(j.verticalIntegrationReason || ""),
        confidence: typeof j.confidence === "number" ? j.confidence : 0.4,
      };
    },
  };
}
