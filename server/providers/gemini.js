function parseJsonFromText(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export function geminiClassifier(env) {
  return {
    name: "gemini",
    async classify({ homepageText, companyName }) {
      const model = env.GEMINI_MODEL || "gemini-1.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Return ONLY JSON (no markdown): {"missionCritical":boolean,"verticallyIntegrated":boolean,"proprietaryStack":boolean,"missionCriticalReason":string,"verticalIntegrationReason":string,"confidence":number}

Company: ${companyName}

Text:
${homepageText.slice(0, 12000)}`,
                },
              ],
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
      const j = parseJsonFromText(text) || {};
      return {
        missionCritical: !!j.missionCritical,
        verticallyIntegrated: !!j.verticallyIntegrated,
        proprietaryStack: j.proprietaryStack !== false,
        missionCriticalReason: String(j.missionCriticalReason || ""),
        verticalIntegrationReason: String(j.verticalIntegrationReason || ""),
        confidence: typeof j.confidence === "number" ? j.confidence : 0.5,
      };
    },
  };
}
