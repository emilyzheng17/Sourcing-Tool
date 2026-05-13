function parseJsonFromText(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export function anthropicClassifier(env) {
  return {
    name: "anthropic",
    async classify({ homepageText, companyName }) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022",
          max_tokens: 512,
          messages: [
            {
              role: "user",
              content: `Classify this B2B software vendor. Return ONLY JSON:
{"missionCritical":boolean,"verticallyIntegrated":boolean,"proprietaryStack":boolean,"missionCriticalReason":string,"verticalIntegrationReason":string,"confidence":number}

Company: ${companyName}

Homepage text:
${homepageText.slice(0, 12000)}`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}`);
      const data = await res.json();
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
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
