import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";

export async function searchExa(brief, env) {
  const key = env.EXA_API_KEY;
  if (!key) return [];
  const q = `${brief.activeProduct} industrial vertical software B2B`;
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify({
        query: q,
        type: "neural",
        numResults: 25,
        contents: { text: false },
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results = data.results || [];
    const out = [];
    for (const r of results) {
      const u = r.url;
      if (!u) continue;
      const domain = normalizeDomain(u);
      if (!isLikelyCompanyDomain(domain)) continue;
      out.push({
        name: r.title || domain,
        website: u.split("?")[0],
        sourceTag: "Exa",
        rawMetadata: { exaId: r.id },
      });
    }
    return out;
  } catch {
    return [];
  }
}
