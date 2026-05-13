/**
 * Shared geography helpers for Discover country allowlist (client + server).
 */

/** Preset order used for stable UI and “defaults” reset. */
export const DEFAULT_ALLOWED_COUNTRY_CODES = Object.freeze([
  "US",
  "CA",
  "GB",
  "IE",
  "AU",
  "NZ",
  "NL",
  "NO",
  "SE",
  "DK",
  "FI",
  "IS",
]);

/** Rows for filter drawer checkboxes (each row toggles its code list). */
export const GEO_REGION_ROWS = Object.freeze([
  { label: "USA", codes: ["US"] },
  { label: "Canada", codes: ["CA"] },
  { label: "United Kingdom", codes: ["GB"] },
  { label: "Ireland", codes: ["IE"] },
  { label: "Australia", codes: ["AU"] },
  { label: "New Zealand", codes: ["NZ"] },
  { label: "Netherlands", codes: ["NL"] },
  { label: "Norway", codes: ["NO"] },
  { label: "Sweden", codes: ["SE"] },
  { label: "Denmark", codes: ["DK"] },
  { label: "Finland", codes: ["FI"] },
  { label: "Iceland", codes: ["IS"] },
]);

/** Extra countries — off by default; common B2B / SaaS tech hubs. */
export const GEO_OPTIONAL_TECH_HUB_ROWS = Object.freeze([
  { label: "Germany", hint: "Berlin, Munich, …", codes: ["DE"] },
  { label: "Switzerland", codes: ["CH"] },
  { label: "France", codes: ["FR"] },
  { label: "Singapore", codes: ["SG"] },
  { label: "Israel", codes: ["IL"] },
  { label: "Estonia", hint: "Tallinn", codes: ["EE"] },
  { label: "Japan", codes: ["JP"] },
  { label: "South Korea", codes: ["KR"] },
  { label: "Portugal", hint: "Lisbon, Porto", codes: ["PT"] },
  { label: "Poland", hint: "Warsaw, Kraków, …", codes: ["PL"] },
]);

export const GEO_OPTIONAL_TECH_HUB_CODES = Object.freeze(
  GEO_OPTIONAL_TECH_HUB_ROWS.flatMap((r) => r.codes),
);

/** Stable ordering when merging checkbox toggles (defaults first, then optional hubs). */
export const GEO_UI_CODE_ORDER = Object.freeze([
  ...DEFAULT_ALLOWED_COUNTRY_CODES,
  ...GEO_OPTIONAL_TECH_HUB_CODES,
]);

/** Merge region checkbox toggles into a stable ordered ISO2 list. */
export function mergeGeoAllowlist(prevList, codes, allOn) {
  const prevSet = new Set(prevList);
  if (allOn) codes.forEach((code) => prevSet.delete(code));
  else codes.forEach((code) => prevSet.add(code));
  const ordered = GEO_UI_CODE_ORDER.filter((c) => prevSet.has(c));
  const extras = [...prevSet].filter((c) => !GEO_UI_CODE_ORDER.includes(c)).sort();
  return [...ordered, ...extras];
}

const ISO2_ALIASES = {
  UK: "GB",
};

/**
 * Map jurisdiction / country string to ISO 3166-1 alpha-2 (uppercase).
 * Returns null when no confident ISO2 (caller keeps the row).
 */
export function normalizeToIso2(raw) {
  if (raw == null) return null;
  let s = String(raw).trim().toUpperCase().replace(/\s+/g, "_");
  if (!s) return null;

  const sub = s.match(/^([A-Z]{2})_[A-Z]{2,3}$/);
  if (sub) {
    const base = sub[1];
    return ISO2_ALIASES[base] || base;
  }

  const two = s.match(/^([A-Z]{2})$/);
  if (two) {
    const code = two[1];
    return ISO2_ALIASES[code] || code;
  }

  return null;
}
