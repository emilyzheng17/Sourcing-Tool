/**
 * Lightweight pre-score computed after a single homepage fetch.
 * Uses only discovery metadata + homepage title/meta/first ~4KB visible text.
 * Designed to reject obvious garbage before expensive enrichment (sub-pages,
 * OpenCorporates, Brave acquisition queries, LLM classification).
 */

import { classifyHomepageSignals } from "./publicCompanySignals.js";

const SOFTWARE_QUICK = [
  "saas",
  "software as a service",
  "cloud",
  "platform",
  "dashboard",
  "login",
  "sign in",
  "subscription",
  "free trial",
  "request a demo",
  "integration",
  "api",
];

const B2B_SIGNALS = [
  "enterprise",
  "business",
  "teams",
  "organizations",
  "compliance",
  "workflow",
  "automat",
  "roi",
  "customers include",
  "trusted by",
  "case study",
  "case studies",
];

const NEGATIVE_SIGNALS = [
  "personal blog",
  "parked domain",
  "buy this domain",
  "domain for sale",
  "coming soon",
  "under construction",
  "site not found",
  "page not found",
  "403 forbidden",
  "access denied",
];

/**
 * @param {{
 *   homepageText: string,
 *   title: string,
 *   metaDescription: string,
 *   candidate: object,
 *   brief: object,
 * }} input
 * @returns {{ cheapScore: number, fastFail: boolean, reasons: string[] }}
 */
export function cheapPreScore({ homepageText, title, metaDescription, candidate, brief }) {
  const reasons = [];
  let score = 30; // baseline — unknown company starts at 30

  const corpus = (homepageText || "").toLowerCase();
  const titleLower = (title || "").toLowerCase();
  const metaLower = (metaDescription || "").toLowerCase();
  const combined = corpus + " " + titleLower + " " + metaLower;

  const signals = classifyHomepageSignals({
    homepageText: corpus,
    title: titleLower,
    metaDescription: metaLower,
  });
  if (signals.isPublic) {
    return {
      cheapScore: 0,
      fastFail: true,
      fastFailKind: "public_listing",
      reasons: ["public_listing"],
    };
  }
  if (signals.isAgency) {
    return {
      cheapScore: 0,
      fastFail: true,
      fastFailKind: "agency",
      reasons: ["agency/consultancy signals"],
    };
  }

  for (const kw of NEGATIVE_SIGNALS) {
    if (combined.includes(kw)) {
      return { cheapScore: 0, fastFail: true, reasons: [`negative signal: "${kw}"`] };
    }
  }

  if (corpus.length < 50) {
    return { cheapScore: 5, fastFail: true, reasons: ["insufficient homepage content"] };
  }

  // Source quality bonus — PE portfolio listings are high-confidence
  const tags = candidate.sourceTags || [candidate.sourceTag].filter(Boolean);
  if (tags.some((t) => /^PE:/i.test(t) || /portfolio/i.test(t))) {
    score += 20;
    reasons.push("PE portfolio source (+20)");
  } else if (tags.length >= 3) {
    score += 8;
    reasons.push("multi-source corroboration (+8)");
  } else if (tags.length >= 2) {
    score += 4;
    reasons.push("2 sources (+4)");
  }

  // Software signals from homepage text
  let swHits = 0;
  for (const kw of SOFTWARE_QUICK) {
    if (combined.includes(kw)) swHits++;
  }
  if (swHits >= 4) {
    score += 12;
    reasons.push(`strong software signals (${swHits} hits, +12)`);
  } else if (swHits >= 2) {
    score += 6;
    reasons.push(`moderate software signals (${swHits} hits, +6)`);
  }

  // B2B signals
  let b2bHits = 0;
  for (const kw of B2B_SIGNALS) {
    if (combined.includes(kw)) b2bHits++;
  }
  if (b2bHits >= 3) {
    score += 10;
    reasons.push(`strong B2B signals (${b2bHits} hits, +10)`);
  } else if (b2bHits >= 1) {
    score += 4;
    reasons.push(`some B2B signals (${b2bHits} hits, +4)`);
  }

  // Discovery metadata: employee count
  const md = candidate.rawMetadata || {};
  const empRaw = candidate.employees ?? md.apolloEmployees ?? md.crunchbaseEmployees;
  if (empRaw != null) {
    const emp = parseEmployeeCount(empRaw);
    if (emp !== null) {
      if (emp >= 15 && emp <= 500) {
        score += 10;
        reasons.push(`employee count ${emp} in sweet spot (+10)`);
      } else if (emp > 500 && emp <= 1000) {
        score += 4;
        reasons.push(`employee count ${emp} slightly large (+4)`);
      } else if (emp < 15) {
        score -= 10;
        reasons.push(`employee count ${emp} too small (-10)`);
      }
    }
  }

  // Discovery metadata: founded year
  const fy = candidate.foundedYear ?? (md.apolloFoundedYear != null ? parseInt(String(md.apolloFoundedYear), 10) : null);
  if (Number.isFinite(fy)) {
    if (fy < 2010) {
      score += 10;
      reasons.push(`founded ${fy}, mature company (+10)`);
    } else if (fy < 2017) {
      score += 5;
      reasons.push(`founded ${fy}, moderate maturity (+5)`);
    } else {
      score -= 5;
      reasons.push(`founded ${fy}, very young (-5)`);
    }
  }

  // Vertical match hint from discovery
  const selectedVerts = Array.isArray(brief?.selectedVerticals) ? brief.selectedVerticals : [];
  if (selectedVerts.length > 0) {
    const vertHit = selectedVerts.some((v) => combined.includes(v.toLowerCase().split(/\s+/)[0]));
    if (vertHit) {
      score += 5;
      reasons.push("vertical keyword in homepage (+5)");
    }
  }

  return { cheapScore: Math.max(0, Math.min(100, score)), fastFail: false, reasons };
}

function parseEmployeeCount(raw) {
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

export const DEFAULT_PRESCORE_THRESHOLD = 25;
export const DEFAULT_ACQUISITION_SCORE_THRESHOLD = 65;
