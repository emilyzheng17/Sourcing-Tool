/**
 * Rule-based ownership_class aligned with Discover UI (no LLM).
 * @typedef {{ ownership_class: string, ownership_confidence: number }} OwnershipResult
 */

import { hasPublicListingSignals } from "./publicCompanySignals.js";

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
 * True when acquisition / company context is plausibly PE-backed (not every M&A year).
 * @param {object} enriched
 * @param {string|null|undefined} acquirer
 * @param {string} corpus
 */
export function likelyPeBacked(enriched, acquirer, corpus) {
  if (enriched.rawMetadata?.peFirm) return true;
  const a = String(acquirer || "")
    .toLowerCase()
    .trim();
  if (/\b(private equity|lbo|leveraged buyout|buyout fund|portfolio of|pe-backed)\b/.test(corpus)) return true;
  if (/\b(private equity|lbo|leveraged buyout)\b/.test(a)) return true;
  if (!a) return false;
  if (/\b(capital partners|management partners|equity partners|growth equity|venture partners|private equity|investment partners|holdings (llc|lp)|advisors lp)\b/i.test(a))
    return true;
  if (
    /\b(capital|partners|ventures|equity|holdings|advisors|investments)\b/i.test(a) &&
    a.length < 96 &&
    !/\b(software|systems|solutions|technology|technologies|digital|data|cloud|media|health)\s+(inc|llc|corp)\b/i.test(a)
  ) {
    return true;
  }
  return false;
}

function hasEsopSignals(corpus) {
  return /\b(esop|employee stock ownership|employee-owned|employee owned)\b/.test(corpus);
}

function hasFamilySignals(corpus) {
  return /\b(family-owned|family owned|family-run|family run|family business)\b/.test(corpus);
}

function hasVcSignals(corpus) {
  return (
    /\b(series [a-e]|seed round|venture-backed|venture backed|vc-backed|vc backed)\b/.test(corpus) ||
    /\braised\s+\$[\d.]+\s*(million|m|billion|b)?\b/.test(corpus) && /\b(venture|vc|investors?|funding)\b/.test(corpus)
  );
}

/** @param {object[]} history */
function acquisitionsWithYears(history) {
  if (!Array.isArray(history)) return [];
  return history.filter((a) => typeof a?.year === "number" && a.year > 1980 && a.year < 2030);
}

/**
 * @param {object} enriched — post-enrich candidate (homepage, history, rawMetadata, …)
 * @returns {OwnershipResult}
 */
export function inferOwnershipClass(enriched) {
  if (enriched.founderStillOperating === true) {
    return { ownership_class: "Founder-Operated", ownership_confidence: 0.72 };
  }

  const corpus = buildCorpus(enriched);
  const history = enriched.acquisitionHistory || [];
  const withYears = acquisitionsWithYears(history);

  if (hasPublicListingSignals(corpus)) {
    return { ownership_class: "Publicly Traded", ownership_confidence: 0.52 };
  }
  if (hasEsopSignals(corpus)) {
    return { ownership_class: "Employee-Owned (ESOP)", ownership_confidence: 0.5 };
  }
  if (hasFamilySignals(corpus)) {
    return { ownership_class: "Family-Owned", ownership_confidence: 0.48 };
  }
  if (hasVcSignals(corpus)) {
    return { ownership_class: "VC-Backed", ownership_confidence: 0.48 };
  }

  const peBackedEntries = withYears.filter((a) => likelyPeBacked(enriched, a.acquirer, corpus));
  if (peBackedEntries.length > 0) {
    const minY = Math.min(...peBackedEntries.map((a) => a.year));
    const ownership_class = minY < 2020 ? "Vintage PE" : "Recent PE";
    const ownership_confidence = enriched.rawMetadata?.peFirm ? 0.82 : 0.74;
    return { ownership_class, ownership_confidence };
  }

  if (enriched.rawMetadata?.peFirm) {
    return { ownership_class: "Private Equity", ownership_confidence: 0.7 };
  }

  if (/\b(private equity|lbo|leveraged buyout|portfolio company of)\b/.test(corpus) && withYears.length === 0) {
    return { ownership_class: "Private Equity", ownership_confidence: 0.45 };
  }

  if (withYears.length > 0) {
    return { ownership_class: "Acquired", ownership_confidence: 0.38 };
  }

  return { ownership_class: "Unknown", ownership_confidence: 0.28 };
}
