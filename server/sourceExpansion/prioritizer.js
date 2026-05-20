/**
 * Cheap priority scoring for Source Expansion candidates.
 *
 * Computes a 0-100 priority score using ONLY discovery-time metadata
 * (no homepage fetch, no LLM). This determines enrichment queue priority
 * and whether enrichment is enqueued at all.
 */

const SAAS_KEYWORDS = [
  "saas", "software", "platform", "cloud", "erp", "crm", "analytics",
  "automation", "workflow", "dashboard", "api", "data management",
  "compliance", "security", "monitoring", "scheduling", "invoicing",
  "billing", "payroll", "fleet", "dispatch", "inventory", "logistics",
];

const B2B_KEYWORDS = [
  "enterprise", "business", "b2b", "commercial", "industrial",
  "professional", "corporate", "operations", "supply chain",
  "procurement", "field service", "asset management",
];

const NEGATIVE_KEYWORDS = [
  "agency", "consulting", "consultancy", "freelance", "staffing",
  "recruitment", "marketing agency", "design agency", "dev shop",
  "web design", "digital agency", "creative agency",
  "news", "blog", "magazine", "media group",
];

const TIER_BASE_SCORE = { 1: 20, 2: 10, 3: 5 };

const SIGNAL_TYPE_BONUS = {
  pe: 25,
  marketplace: 15,
  ecosystem: 10,
  registry: 5,
  search: 3,
};

/**
 * @param {import('./normalize.js').NormalizedCandidate} candidate
 * @returns {{ priorityScore: number, reasons: string[] }}
 */
export function computePriority(candidate) {
  const reasons = [];
  let score = 0;

  const tier = candidate.sourceTier || 3;
  const base = TIER_BASE_SCORE[tier] || 5;
  score += base;
  reasons.push(`tier ${tier} base (+${base})`);

  const signalType = candidate.signalType || "search";
  const signalBonus = SIGNAL_TYPE_BONUS[signalType] || 0;
  if (signalBonus > 0) {
    score += signalBonus;
    reasons.push(`${signalType} signal (+${signalBonus})`);
  }

  const corpus = buildCorpus(candidate);

  let saasHits = 0;
  for (const kw of SAAS_KEYWORDS) {
    if (corpus.includes(kw)) saasHits++;
  }
  if (saasHits >= 4) {
    score += 12;
    reasons.push(`strong SaaS signals (${saasHits} hits, +12)`);
  } else if (saasHits >= 2) {
    score += 6;
    reasons.push(`moderate SaaS signals (${saasHits} hits, +6)`);
  } else if (saasHits >= 1) {
    score += 3;
    reasons.push(`weak SaaS signal (${saasHits} hit, +3)`);
  }

  let b2bHits = 0;
  for (const kw of B2B_KEYWORDS) {
    if (corpus.includes(kw)) b2bHits++;
  }
  if (b2bHits >= 3) {
    score += 8;
    reasons.push(`strong B2B signals (${b2bHits} hits, +8)`);
  } else if (b2bHits >= 1) {
    score += 4;
    reasons.push(`some B2B signals (${b2bHits} hits, +4)`);
  }

  for (const kw of NEGATIVE_KEYWORDS) {
    if (corpus.includes(kw)) {
      score -= 20;
      reasons.push(`negative signal: "${kw}" (-20)`);
      break;
    }
  }

  const fy = candidate.foundedYear;
  if (Number.isFinite(fy)) {
    if (fy < 2005) {
      score += 10;
      reasons.push(`founded ${fy}, very mature (+10)`);
    } else if (fy < 2015) {
      score += 5;
      reasons.push(`founded ${fy}, mature (+5)`);
    } else if (fy >= 2020) {
      score -= 5;
      reasons.push(`founded ${fy}, very young (-5)`);
    }
  }

  const emp = parseEmployeeCount(candidate.employees);
  if (emp !== null) {
    if (emp >= 15 && emp <= 500) {
      score += 8;
      reasons.push(`employees ${emp} in sweet spot (+8)`);
    } else if (emp > 500 && emp <= 1000) {
      score += 3;
      reasons.push(`employees ${emp} slightly large (+3)`);
    } else if (emp < 10) {
      score -= 5;
      reasons.push(`employees ${emp} very small (-5)`);
    }
  }

  if (candidate.rawMetadata?.formType === "10-K" || candidate.rawMetadata?.cik) {
    score -= 15;
    reasons.push("public company filer (-15)");
  }

  if ((candidate.sourceTags || []).length >= 3) {
    score += 6;
    reasons.push("multi-source corroboration (+6)");
  } else if ((candidate.sourceTags || []).length >= 2) {
    score += 3;
    reasons.push("2 sources (+3)");
  }

  const final = Math.max(0, Math.min(100, Math.round(score)));
  return { priorityScore: final, reasons };
}

/** Minimum priority to enqueue for enrichment. Below this, store but don't enrich. */
export const ENRICHMENT_THRESHOLD = 15;

function buildCorpus(candidate) {
  const parts = [
    candidate.name,
    candidate.description,
    candidate.rawMetadata?.category,
    candidate.rawMetadata?.industry,
    candidate.rawMetadata?.shortDescription,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function parseEmployeeCount(raw) {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return null;
  const t = raw.toLowerCase().replace(/,/g, "");
  const range = t.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return Math.round((parseInt(range[1], 10) + parseInt(range[2], 10)) / 2);
  const plus = t.match(/(\d+)\s*\+/);
  if (plus) return parseInt(plus[1], 10);
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
