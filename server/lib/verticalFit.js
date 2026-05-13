/**
 * Evidence-based vertical fit vs UI industry filters.
 * KNOWN_VERTICALS is defined in ./portfolioProductNames.js (aligned with src/CompanySourcingTool.jsx).
 */

import { KNOWN_VERTICALS } from "./portfolioProductNames.js";
import { VERTICAL_MATCH_THRESHOLD } from "../../shared/verticalFitConstants.js";

export { KNOWN_VERTICALS, VERTICAL_MATCH_THRESHOLD };

/** Below this overall fit score, pipeline applies a thesis penalty when verticals are selected */
export const VERTICAL_FIT_WEAK_THRESHOLD = 40;

const NEGATIVE_SERVICE_SIGNALS = [
  "law firm",
  "law office",
  "attorneys at law",
  "attorney at law",
  "legal counsel",
  "trial lawyer",
  "litigation ",
  "plaintiffs",
  "defense attorneys",
  "patent prosecution",
  "estate planning law",
  "family law",
  "bankruptcy attorney",
];

/** @type {Record<string, string[]>} */
const VERTICAL_HINTS = {
  "Metals & Mining": [
    "mining",
    "miner",
    "mineral",
    "metal production",
    "smelting",
    "smelter",
    "beneficiation",
    "tailings",
    "ore ",
    "ore.",
    "orebody",
    "geology",
    "exploration",
    "mine site",
    "open pit",
    "underground mining",
    "msha",
    "quarry",
    " aggregates",
    "aggregate producer",
    "gold mine",
    "copper ",
    "steel mill",
    "foundry",
  ],
  "Bulk Materials": [
    " aggregates",
    "aggregate",
    "sand and gravel",
    "crushed stone",
    "asphalt ",
    "cement ",
    "concrete ",
    "ready mix",
    "bulk material",
    "haul material",
    "quarry ",
    "stone ",
    "logistics bulk",
    "rail loadout",
    "belt scale",
  ],
  "Bulk Liquids": [
    "tank ",
    "tank farm",
    "terminal ",
    "pipeline",
    "liquids ",
    "bulk liquid",
    "petroleum ",
    "lubricants",
    "chemical distributor",
    "tank truck",
    "loading rack",
    "midstream ",
    "refin",
    "fuel terminal",
    "iso tank",
    "transfer station",
  ],
  "Forestry & Lumber": [
    "forestry",
    " lumber",
    "lumber ",
    "sawmill",
    "logging",
    "log yard",
    "timber ",
    "wood products",
    "millwork",
    "pellet ",
    "pulp ",
    "osb ",
    "veneer",
    "reforestation",
  ],
  "Structure Design & Analysis": [
    "structural analysis",
    "structural engineering",
    "fea ",
    "finite element",
    "civil engineering",
    "bridge design",
    "structural ",
    "staad",
    "etabs",
    "seismic ",
    "load combination",
    "steel design",
    "reinforced concrete",
  ],
  "Contractor Solutions": [
    "construction management",
    "general contractor",
    "subcontractor",
    "mechanical contractor",
    "electrical contractor",
    "commercial construction",
    "heavy civil",
    "earthwork",
    "grading ",
    "sitework",
    "self-perform",
  ],
  "Equipment & Parts": [
    "equipment dealer",
    "parts distributor",
    "heavy equipment",
    "oem ",
    "aftermarket ",
    "spare parts",
    "replacement parts",
    "component supplier",
    "machine parts",
    "industrial supplier",
    "undercarriage",
    "implement dealer",
    "equipment rental",
  ],
  "Waste & Recycling": [
    "recycling",
    "waste hauling",
    "roll-off",
    "landfill ",
    "waste diversion",
    "material recovery",
    "mrf ",
    "hazardous waste",
    "rcra ",
    "e-waste",
    "scrap metal recycling",
    "biosolids",
    "solid waste",
  ],
  "Safety & Compliance": [
    "occupational safety",
    "environmental compliance",
    "osha ",
    "permit ",
    "permitting",
    "ehs ",
    "hazard analysis",
    "job safety analysis",
    "incident ",
    "audit readiness",
    "risk assessment",
    "regulatory ",
    "lockout/tagout",
    "ppe ",
  ],
};

/** @type {Record<string, string[]>} */
const APOLLO_INDUSTRY_HINTS = {
  "Metals & Mining": ["mining", "metal ", "miner", "mineral"],
  "Bulk Materials": ["aggregate", "cement ", "construction material", "concrete"],
  "Bulk Liquids": ["petroleum", "chemical wholesale", "fuel", "pipelines"],
  "Forestry & Lumber": ["lumber", "wood ", "forest", "paper mills"],
  "Structure Design & Analysis": ["civil engineer", "structural engineer"],
  "Contractor Solutions": ["construction", "contractor"],
  "Equipment & Parts": ["machinery", "equipment wholesale", "industrial wholesale"],
  "Waste & Recycling": ["renewables", "environment", "waste"],
  "Safety & Compliance": ["health", "environmental"],
};

/** @param {string} corpus */
export function countNegativeServiceSignals(corpus) {
  if (!corpus) return 0;
  let n = 0;
  for (const ph of NEGATIVE_SERVICE_SIGNALS) {
    if (corpus.includes(ph)) n += 1;
  }
  return n;
}

/** @param {string} corpus */
/** @param {string} apolloLower */
/** @param {string} verticalLabel */
function scoreOneVertical(verticalLabel, corpus, apolloLower) {
  const hints = VERTICAL_HINTS[verticalLabel];
  if (!hints) return { score: 0, matchedHints: [], apolloBoost: false };

  const matchedHints = [];
  for (const h of hints) {
    if (corpus.includes(h)) matchedHints.push(h.trim());
  }

  let labelBoost = 0;
  const vl = verticalLabel.toLowerCase();
  if (corpus.includes(vl)) labelBoost += 28;
  else if (vl.includes("&")) {
    const parts = vl.split("&").map((s) => s.trim());
    if (parts.every((p) => p.length > 2 && corpus.includes(p))) labelBoost += 22;
  }

  let apolloBoost = false;
  for (const a of APOLLO_INDUSTRY_HINTS[verticalLabel] || []) {
    if (apolloLower.includes(a.trim())) {
      apolloBoost = true;
      break;
    }
  }

  const hitScore = Math.min(72, matchedHints.length * 10);
  const apolloPts = apolloBoost ? 22 : 0;
  let raw = Math.min(100, hitScore + labelBoost + apolloPts);

  const softwareCue = ["software", "saas", "platform", "cloud ", "subscription", "enterprise "].some((x) => corpus.includes(x));
  if (softwareCue && matchedHints.length >= 1) {
    raw = Math.min(100, raw + 18);
  }

  const negCount = countNegativeServiceSignals(corpus);
  if (negCount >= 2 && matchedHints.length < 2 && !apolloBoost) {
    raw *= 0.35;
  } else if (negCount >= 1 && matchedHints.length === 0 && !apolloBoost) {
    raw = Math.min(raw, 15);
  }

  raw = Math.round(raw);
  return { score: raw, matchedHints: [...new Set(matchedHints)], apolloBoost };
}

export function sanitizeCorpus(t) {
  return String(t || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {object} partial
 * @param {string} [partial.homepageTextSample]
 * @param {string} [partial.braveSnippet]
 * @param {string} [partial.description]
 * @param {string} [partial.homepageMetaDescription]
 * @param {object} [partial.rawMetadata]
 */
export function buildVerticalFitCorpus(partial) {
  const apollo = partial.rawMetadata?.apolloIndustry;
  const chunks = [
    partial.homepageTextSample,
    partial.braveSnippet,
    partial.description,
    partial.homepageMetaDescription,
    apollo,
  ].filter(Boolean);
  return sanitizeCorpus(chunks.join(" \n "));
}

/**
 * @param {string[]} selectedVerticals
 * @param {string} corpusLower — from buildVerticalFitCorpus
 * @param {string} [apolloIndustry] — optional extra apollo string (also usually in corpus)
 */
export function evaluateVerticalFit(selectedVerticals, corpusLower, apolloIndustry) {
  const selected =
    Array.isArray(selectedVerticals) && selectedVerticals.length
      ? [...new Set(selectedVerticals)].filter((v) => KNOWN_VERTICALS.includes(v))
      : [];

  const corpus = corpusLower || "";
  const apolloLower = sanitizeCorpus(apolloIndustry || "");

  if (!selected.length) {
    return {
      matchedVerticals: [],
      verticalFitScore: 100,
      verticalFitReasons: [],
      verticalFitByVertical: {},
    };
  }

  /** @type {Record<string, { score: number, matchedHints: string[], apolloBoost: boolean }>} */
  const verticalFitByVertical = {};
  /** @type {string[]} */
  const matchedVerticals = [];
  /** @type {string[]} */
  const reasons = [];
  let maxScore = 0;

  for (const v of selected) {
    const r = scoreOneVertical(v, corpus, apolloLower);
    verticalFitByVertical[v] = r;
    if (r.score > maxScore) maxScore = r.score;
    if (r.score >= VERTICAL_MATCH_THRESHOLD) {
      matchedVerticals.push(v);
      const top = r.matchedHints.slice(0, 3).join(", ");
      reasons.push(top ? `${v}: ${top}` : `${v}: apollo/fit`);
    }
  }

  const verticalFitScore = maxScore;
  return {
    matchedVerticals,
    verticalFitScore,
    verticalFitReasons: reasons.slice(0, 8),
    verticalFitByVertical,
  };
}

/**
 * Map 0–100 fit to thesis vertScore bucket 0–3 when verticals are selected.
 * @param {number} verticalFitScore
 */
export function vertScoreFromVerticalFit(verticalFitScore) {
  if (verticalFitScore >= 72) return 3;
  if (verticalFitScore >= 48) return 2;
  if (verticalFitScore >= 28) return 1;
  return 0;
}

/**
 * Penalty points to subtract from thesis when user selected verticals but fit is weak.
 * @param {number} verticalFitScore
 */
export function verticalFitThesisPenalty(verticalFitScore) {
  if (verticalFitScore >= VERTICAL_FIT_WEAK_THRESHOLD) return 0;
  return Math.min(28, Math.round((VERTICAL_FIT_WEAK_THRESHOLD - verticalFitScore) * 0.65));
}
