/**
 * Rule-based ownership_class aligned with Discover UI (no LLM).
 *
 * Canonical classes: "Publicly Traded" | "Founder Owned" | "Founder Operated" | "VC Backed" | "PE Owned" | "Unknown"
 *
 * Priority (highest → lowest):
 *   0. Publicly Traded — exchange / IR / SEC listing signals
 *   1. PE Owned        — any PE/LBO/acquisition-by-PE signal
 *   2. VC Backed       — Series A-E, seed, venture-backed, funding round signals
 *   3. Founder Operated — founder is actively the CEO/operator
 *   4. Founder Owned   — bootstrapped, independently/privately owned signals
 *   4b. Digital Archaeology — legacy stack / old copyright / founder narrative
 *   5. Unknown
 *
 * @typedef {{ ownership_class: string, ownership_confidence: number }} OwnershipResult
 */

import { hasPublicListingSignals } from "./publicCompanySignals.js";

// #region Corpus & PE detection
/** @param {object} enriched */
function buildCorpus(enriched) {
  const md = enriched.rawMetadata || {};
  const parts = [
    enriched.homepageTextSample,
    enriched.braveSnippet,
    enriched.description,
    md.shortDescription,
  ];
  return parts.filter(Boolean).join(" \n ").toLowerCase();
}

/**
 * True when the acquirer name or corpus signals a PE-style transaction.
 * Exported for use in other modules.
 * @param {object} enriched
 * @param {string|null|undefined} acquirer
 * @param {string} corpus
 */
export function likelyPeBacked(enriched, acquirer, corpus) {
  if (enriched.rawMetadata?.peFirm) return true;
  const a = String(acquirer || "").toLowerCase().trim();
  if (/\b(private equity|lbo|leveraged buyout|buyout fund|portfolio of|pe-backed)\b/.test(corpus))
    return true;
  if (/\b(private equity|lbo|leveraged buyout)\b/.test(a)) return true;
  if (!a) return false;
  if (
    /\b(capital partners|management partners|equity partners|growth equity|venture partners|private equity|investment partners|holdings (llc|lp)|advisors lp)\b/i.test(
      a,
    )
  )
    return true;
  if (
    /\b(capital|partners|ventures|equity|holdings|advisors|investments)\b/i.test(a) &&
    a.length < 96 &&
    !/\b(software|systems|solutions|technology|technologies|digital|data|cloud|media|health)\s+(inc|llc|corp)\b/i.test(
      a,
    )
  ) {
    return true;
  }
  return false;
}
// #endregion

// #region Ownership signal detectors
/**
 * Returns true when there are strong PE ownership signals in the enriched data.
 * Checks corpus text, rawMetadata.peFirm, and acquisition history.
 */
function hasPeSignals(enriched, corpus) {
  if (enriched.rawMetadata?.peFirm) return true;
  if (
    /\b(private equity|lbo|leveraged buyout|buyout fund|portfolio company|portfolio of|pe-backed|pe backed|backed by .{0,60}(capital|equity|partners|holdings))\b/.test(
      corpus,
    )
  )
    return true;
  const history = enriched.acquisitionHistory || [];
  return history.some(
    (a) =>
      typeof a?.year === "number" &&
      a.year > 1980 &&
      a.year < 2030 &&
      likelyPeBacked(enriched, a.acquirer, corpus),
  );
}

/**
 * Returns true when there are VC/venture-capital funding signals.
 */
function hasVcSignals(corpus) {
  if (
    /\b(series [a-e]|seed round|pre-seed|venture-backed|venture backed|vc-backed|vc backed|venture capital)\b/.test(
      corpus,
    )
  )
    return true;
  if (
    /\braised\s+\$[\d,.]+\s*(million|m|billion|b)?\b/.test(corpus) &&
    /\b(venture|vc|investors?|funding|round)\b/.test(corpus)
  )
    return true;
  return false;
}

/**
 * Returns true when text shows the founder is actively the CEO/operator.
 * Works alongside the `founderStillOperating` boolean from enrich.js.
 */
function hasFounderOperatedSignals(corpus) {
  return (
    /\b(founder\s*(?:&|and)\s*(?:ceo|cto|president|chief executive officer?))\b/.test(corpus) ||
    /\b(co-?founder\s*(?:&|and)\s*(?:ceo|cto|president|chief executive officer?))\b/.test(corpus) ||
    /\b(ceo\s*(?:&|and)\s*(?:founder|co-?founder))\b/.test(corpus) ||
    /\b(founded\s+(?:and|&)\s+(?:led|run|operated|managed)\s+by)\b/.test(corpus) ||
    /\b(founder[- ]led|founder[- ]operated|founder[- ]run)\b/.test(corpus) ||
    /\b(our\s+founder\s+(?:leads|runs|manages|serves\s+as\s+ceo))\b/.test(corpus)
  );
}

/**
 * Returns true when text signals private/independent/founder ownership
 * without active operator language.
 */
function hasFounderOwnedSignals(corpus) {
  return (
    /\b(bootstrapped|self-funded|self funded|owner-operated|owner operated)\b/.test(corpus) ||
    /\b(independently owned|privately held|family-owned|family owned|family-run|family run|family business)\b/.test(
      corpus,
    ) ||
    /\b(esop|employee-owned|employee owned|employee stock ownership)\b/.test(corpus) ||
    /\b(no outside (investors?|funding|capital)|unfunded|revenue[- ]funded|organically grown)\b/.test(
      corpus,
    )
  );
}
// #endregion

// #region Digital archaeology
/**
 * Extract the earliest and latest copyright years mentioned in the corpus.
 * Handles: © 2003, copyright 2003-2018, © 1999 – 2015, copyright (c) 2005.
 * @param {string} corpus
 * @returns {{ startYear: number|null, endYear: number|null }}
 */
export function extractCopyrightYears(corpus) {
  const re = /(?:©|copyright|\(c\))[^0-9]{0,20}(\d{4})(?:\s*[-–—]\s*(\d{4}))?/gi;
  const years = [];
  let m;
  while ((m = re.exec(corpus)) !== null) {
    const y1 = parseInt(m[1], 10);
    const y2 = m[2] ? parseInt(m[2], 10) : null;
    if (y1 >= 1990 && y1 <= 2030) years.push(y1);
    if (y2 && y2 >= 1990 && y2 <= 2030) years.push(y2);
  }
  if (years.length === 0) return { startYear: null, endYear: null };
  return { startYear: Math.min(...years), endYear: Math.max(...years) };
}

/**
 * Returns true when the site signals a legacy / pre-cloud-era tech stack.
 * Checks enriched.techHints (from HTTP headers), the website URL, and corpus
 * text for tell-tale legacy identifiers (.aspx paths, ASP.NET, IIS, ColdFusion).
 * @param {object} enriched
 * @param {string} corpus
 */
export function hasLegacyStackHints(enriched, corpus) {
  const url = (enriched.website || "").toLowerCase();
  const hints = enriched.techHints || [];

  for (const h of hints) {
    const hl = h.toLowerCase();
    if (hl.includes("asp.net") || hl.includes("iis/")) return true;
    if (/x-powered-by:php\/[345]\./.test(hl)) return true;
    if (/x-powered-by:classic\s*asp\b/.test(hl)) return true;
    if (hl.includes("coldfusion")) return true;
  }

  // .aspx anywhere in the site URL is the strongest single indicator
  if (url.includes(".aspx")) return true;

  // Corpus-level legacy tech references
  if (/\.aspx\b/.test(corpus)) return true;
  if (/\b(coldfusion|classic asp|asp\.net web\s?forms?|cfm\b)\b/.test(corpus)) return true;

  return false;
}

/**
 * Detects first-person founder narrative in the corpus (typically /about copy).
 * Returns two distinct flavours:
 *   - originStory   : past-tense founding story ("I founded…", "when I started…")
 *   - currentOperator: present-tense ownership/leadership ("my team", "I still lead…")
 * @param {string} corpus
 * @returns {{ originStory: boolean, currentOperator: boolean }}
 */
export function hasFounderNarrativeSignals(corpus) {
  const originStory =
    /\bi\s+founded\b/.test(corpus) ||
    /\bwhen\s+i\s+(first\s+)?started\b/.test(corpus) ||
    /\bi\s+started\s+(the\s+)?(company|business|this|it)\b/.test(corpus) ||
    /\bi\s+set\s+out\s+to\b/.test(corpus) ||
    /\bi\s+created\s+(this|the)\s+(company|business|tool|platform|software)\b/.test(corpus) ||
    /\bour\s+story\s+began\s+when\b/.test(corpus) ||
    /\bfounded\s+by\s+(its\s+)?(?:current\s+)?(?:ceo|owner|principal)\b/.test(corpus);

  const currentOperator =
    /\bmy\s+(company|business|team|mission|vision)\b/.test(corpus) ||
    /\bi\s+(still\s+)?(lead|run|operate|manage|oversee)\b/.test(corpus) ||
    /\bi\s+continue\s+to\b/.test(corpus) ||
    /\bwe(?:'ve|\s+have)\s+been\s+(?:independently|family|owner)[- ]/.test(corpus);

  return { originStory, currentOperator };
}

/**
 * Aggregates all digital-archaeology signals into a single object.
 * Called once per inference to avoid redundant regex passes.
 * @param {object} enriched
 * @param {string} corpus
 */
function collectArchaeologySignals(enriched, corpus) {
  const { startYear, endYear } = extractCopyrightYears(corpus);
  const currentYear = new Date().getFullYear();
  return {
    legacyStack: hasLegacyStackHints(enriched, corpus),
    // Copyright first-published before the modern SaaS era
    oldCopyright: startYear != null && startYear < 2005,
    // Copyright that has not been refreshed for 7+ years suggests low investment
    staleCopyright: endYear != null && endYear < currentYear - 7,
    ...hasFounderNarrativeSignals(corpus),
  };
}
// #endregion

// #region inferOwnershipClass
/**
 * Infer the ownership class for a post-enrichment candidate.
 *
 * @param {object} enriched — post-enrich candidate (homepage, history, rawMetadata, …)
 * @returns {OwnershipResult}
 */
export function inferOwnershipClass(enriched) {
  const corpus = buildCorpus(enriched);

  if (hasPublicListingSignals(corpus)) {
    return { ownership_class: "Publicly Traded", ownership_confidence: 0.88 };
  }

  // 1. PE Owned — PE transactions supersede founder/VC classification
  if (hasPeSignals(enriched, corpus)) {
    const confidence = enriched.rawMetadata?.peFirm ? 0.85 : 0.74;
    return { ownership_class: "PE Owned", ownership_confidence: confidence };
  }

  // 2. VC Backed — institutional venture capital
  if (hasVcSignals(corpus)) {
    return { ownership_class: "VC Backed", ownership_confidence: 0.75 };
  }

  // Collect digital-archaeology signals once; reused in steps 3-4b.
  const arch = collectArchaeologySignals(enriched, corpus);

  // 3. Founder Operated — founder actively holds the CEO/operator seat
  const isFounderCeo = enriched.founderStillOperating === true;
  const hasExplicitFO = hasFounderOperatedSignals(corpus);
  if (isFounderCeo || hasExplicitFO || arch.currentOperator) {
    let confidence = isFounderCeo ? 0.74 : hasExplicitFO ? 0.60 : 0.52;
    // Corroborating archaeology signals add marginal confidence
    if (arch.originStory || arch.legacyStack || arch.oldCopyright) {
      confidence = Math.min(confidence + 0.05, 0.78);
    }
    return { ownership_class: "Founder Operated", ownership_confidence: confidence };
  }

  // 4. Founder Owned — explicit bootstrapped / independently owned signals
  const hasExplicitOwned = hasFounderOwnedSignals(corpus);
  if (hasExplicitOwned) {
    let confidence = 0.58;
    if (arch.originStory || arch.legacyStack || arch.oldCopyright) {
      confidence = Math.min(confidence + 0.05, 0.65);
    }
    return { ownership_class: "Founder Owned", ownership_confidence: confidence };
  }

  // 4b. Digital archaeology fallback — no explicit ownership keywords but indirect
  //     signals point toward a privately-held, long-tenured company.
  //     Origin-story narrative alone is the weakest valid signal; combinations
  //     of legacy stack + stale/old copyright raise confidence.
  const archStrength = [
    arch.originStory,
    arch.legacyStack,
    arch.oldCopyright || arch.staleCopyright,
  ].filter(Boolean).length;

  if (archStrength >= 3) {
    return { ownership_class: "Founder Owned", ownership_confidence: 0.52 };
  }
  if (archStrength >= 2) {
    return { ownership_class: "Founder Owned", ownership_confidence: 0.44 };
  }
  if (arch.originStory) {
    // Single origin-story signal: enough to prefer Founder Owned over Unknown
    return { ownership_class: "Founder Owned", ownership_confidence: 0.42 };
  }

  // 5. Unknown
  return { ownership_class: "Unknown", ownership_confidence: 0.28 };
}
// #endregion
