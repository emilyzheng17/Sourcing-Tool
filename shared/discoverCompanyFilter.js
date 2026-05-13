import { normalizeToIso2 } from "./geoCountry.js";
import { VERTICAL_MATCH_THRESHOLD } from "./verticalFitConstants.js";

export function inFoundedEra(year, label) {
  if (label === "Any Era" || year == null || Number.isNaN(Number(year))) return true;
  const y = Number(year);
  if (label === "Before 2017 (ideal)") return y < 2017;
  if (label === "Before 2010") return y < 2010;
  if (label === "2017–Present" || label === "2017-Present") return y >= 2017;
  if (label === "2020–Present") return y >= 2020;
  if (label === "2015–2019") return y >= 2015 && y <= 2019;
  if (label === "2010–2016") return y >= 2010 && y <= 2016;
  if (label === "2010–2014") return y >= 2010 && y <= 2014;
  if (label === "2000–2009") return y >= 2000 && y <= 2009;
  if (label === "Before 2000") return y < 2000;
  return true;
}

/** Midpoint headcount for UI band labels (aligns with server/score.js) */
function employeeBandMidpoint(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.toLowerCase().replace(/–/g, "-");
  if (t.includes("1000+") || t.includes("1,000+")) return 1500;
  if (t.includes("501") && t.includes("1,000")) return 750;
  if (t.includes("201") && t.includes("500")) return 350;
  if (t.includes("51") && t.includes("200")) return 125;
  if (t.includes("15") && t.includes("100")) return 57;
  if (t.includes("11") && t.includes("50")) return 30;
  if (t.includes("1-10") || t.includes("1–10")) return 5;
  return null;
}

function revenueBandMidpointMillions(s) {
  if (!s || typeof s !== "string") return null;
  const t = s.toLowerCase().replace(/–/g, "-");
  if (t.includes("200m+") || t.includes("$200m")) return 300;
  if (t.includes("50m") && t.includes("200m")) return 125;
  if (t.includes("20m") && t.includes("50m")) return 35;
  if (t.includes("5m") && t.includes("20m")) return 12;
  if (t.includes("2m") && t.includes("10m")) return 6;
  if (t.includes("1m") && t.includes("5m")) return 3;
  if (t.includes("< $1m") || t.includes("<$1m")) return 0.5;
  return null;
}

export function matchesEmployeeFilter(c, filter) {
  if (filter === "Any Size") return true;
  if (!c.employees) return true;
  if (filter === "15-100 (ideal)") {
    const mid = employeeBandMidpoint(c.employees);
    if (mid == null) return true;
    return mid >= 15 && mid <= 100;
  }
  return c.employees === filter;
}

export function matchesRevenueFilter(c, filter) {
  if (filter === "Any Revenue") return true;
  if (!c.revenue) return true;
  if (filter === "$2M-$10M (ideal)") {
    const m = revenueBandMidpointMillions(c.revenue);
    if (m == null) return true;
    return m >= 2 && m <= 10;
  }
  return c.revenue === filter;
}

export function matchesCompanyTypeFilter(c, filter) {
  if (filter === "Any Type") return true;
  const t = (c.companyType || "unknown").toLowerCase();
  if (filter === "Software") return t === "software" || t === "unknown";
  if (filter === "Hardware") return t === "hardware" || t === "hybrid";
  if (filter === "Hybrid") return t === "hybrid";
  if (filter === "Unknown") return t === "unknown";
  return true;
}

/** @param {string|null|undefined} ownershipClass */
export function companyOwnershipMatchesFilter(ownershipClass, filter) {
  const oc = ownershipClass || "";
  if (filter === "Private Equity") {
    return oc === "Private Equity" || oc === "Vintage PE" || oc === "Recent PE";
  }
  return oc === filter;
}

/**
 * @typedef {object} DiscoverFilterCriteria
 * @property {string} [textQuery] Discover or universe free-text filter (same field checks).
 * @property {string} ownershipFilter
 * @property {string} companyTypeFilter
 * @property {string} revenueFilter
 * @property {string} sizeFilter
 * @property {string} foundedFilter
 * @property {boolean} [excludeRejected]
 * @property {boolean} thesisRequireMissionCritical
 * @property {boolean} thesisRequireVertIntegrated
 * @property {boolean} thesisRequireProprietary
 * @property {boolean} thesisRequireFounderVintage
 * @property {number} minOwnershipConfidence
 * @property {string[]} allowedCountryCodes ISO2 allowlist; empty = no geo filter
 * @property {string[]} selectedVerticals
 * @property {string[]} selectedProducts
 * @property {string[]} selectedTags Tags from the filter drawer; matched against company.tags (snapshot from enrichment run).
 * @property {boolean} strictVerticalFit
 */

/**
 * @param {object} c Company row (discover or universe)
 * @param {DiscoverFilterCriteria} criteria
 */
export function companyPassesDiscoverFilters(c, criteria) {
  if (criteria.excludeRejected && c.is_rejected) return false;

  const q = (criteria.textQuery || "").trim().toLowerCase();
  if (q) {
    if (
      !(c.name || "").toLowerCase().includes(q) &&
      !(c.description || "").toLowerCase().includes(q) &&
      !(c.verticals || []).some((v) => v.toLowerCase().includes(q)) &&
      !(c.searchVerticals || []).some((v) => String(v).toLowerCase().includes(q)) &&
      !(c.verticalFitReasons || []).some((s) => String(s).toLowerCase().includes(q)) &&
      !(c.sourceTags || []).some((s) => String(s).toLowerCase().includes(q)) &&
      !(c.matchedProducts || []).some((p) => String(p).toLowerCase().includes(q)) &&
      !(c.products || []).some((p) => String(p).toLowerCase().includes(q)) &&
      !String(c.country || "").toLowerCase().includes(q) &&
      !String(c.hq || "").toLowerCase().includes(q)
    ) {
      return false;
    }
  }

  if (criteria.ownershipFilter !== "Any Ownership") {
    const oc = c.ownership_class || c.ownership;
    if (!companyOwnershipMatchesFilter(oc, criteria.ownershipFilter)) return false;
  }
  if (!matchesCompanyTypeFilter(c, criteria.companyTypeFilter)) return false;
  if (criteria.revenueFilter !== "Any Revenue" && !matchesRevenueFilter(c, criteria.revenueFilter)) return false;
  if (criteria.sizeFilter !== "Any Size" && !matchesEmployeeFilter(c, criteria.sizeFilter)) return false;
  if (!inFoundedEra(c.foundedYear, criteria.foundedFilter)) return false;
  if (criteria.thesisRequireMissionCritical && !c.missionCritical) return false;
  if (criteria.thesisRequireVertIntegrated && !c.verticallyIntegrated) return false;
  if (criteria.thesisRequireProprietary && !c.proprietaryStack) return false;
  if (
    criteria.thesisRequireFounderVintage &&
    !["Founder-Operated", "Vintage PE"].includes(c.ownership_class || "")
  ) {
    return false;
  }
  if (criteria.minOwnershipConfidence > 0 && (c.ownership_confidence || 0) < criteria.minOwnershipConfidence) {
    return false;
  }

  const verts = criteria.selectedVerticals || [];
  if (verts.length > 0) {
    const companyVerts = c.verticals || [];
    const intersectsLabel = companyVerts.some((v) => verts.includes(v));
    const strictPass =
      criteria.strictVerticalFit &&
      typeof c.verticalFitScore === "number" &&
      c.verticalFitScore >= VERTICAL_MATCH_THRESHOLD;
    if (!intersectsLabel && !strictPass) return false;
  }

  const products = criteria.selectedProducts || [];
  if (products.length > 0) {
    const mp = c.matchedProducts || c.products || [];
    if (!mp.some((p) => products.includes(p))) return false;
  }

  /** `company.tags` is a snapshot from the enrichment run vs the then-current drawer tags. */
  const tags = criteria.selectedTags || [];
  if (tags.length > 0) {
    const rowTags = c.tags || [];
    if (!tags.some((t) => rowTags.includes(t))) return false;
  }

  const allowed = criteria.allowedCountryCodes || [];
  if (allowed.length > 0) {
    const iso = normalizeToIso2(c.country);
    if (iso != null && !allowed.includes(iso)) return false;
  }

  return true;
}
