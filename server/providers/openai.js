import { fetchWithTimeout } from "../lib/fetchWithTimeout.js";

function parseJsonFromText(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export function openaiClassifier(env) {
  return {
    name: "openai",
    async classify({ homepageText, companyName }) {
      const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
        body: JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content: `You classify B2B vertical software companies. Reply ONLY valid JSON:
{"missionCritical":boolean,"verticallyIntegrated":boolean,"proprietaryStack":boolean,"missionCriticalReason":string,"verticalIntegrationReason":string,"confidence":number}`,
            },
            {
              role: "user",
              content: `Company: ${companyName}\n\nHomepage text:\n${homepageText.slice(0, 12000)}`,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      const j = parseJsonFromText(text) || {};
      return normalize(j);
    },
  };
}

function normalize(j) {
  return {
    missionCritical: !!j.missionCritical,
    verticallyIntegrated: !!j.verticallyIntegrated,
    proprietaryStack: j.proprietaryStack !== false,
    missionCriticalReason: String(j.missionCriticalReason || ""),
    verticalIntegrationReason: String(j.verticalIntegrationReason || ""),
    confidence: typeof j.confidence === "number" ? j.confidence : 0.5,
  };
}
