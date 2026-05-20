/**
 * Candidate normalization for Source Expansion.
 *
 * Transforms raw adapter output into a consistent shape before
 * priority scoring and DB persistence.
 */

import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";

const MARKETPLACE_DOMAINS = new Set([
  "g2.com",
  "www.g2.com",
  "capterra.com",
  "www.capterra.com",
  "apps.shopify.com",
  "marketplace.atlassian.com",
  "ecosystem.hubspot.com",
  "appexchange.salesforce.com",
  "aws.amazon.com",
  "cloud.google.com",
  "store.sap.com",
  "zapier.com",
  "www.zapier.com",
]);

const REGISTRY_DOMAINS = new Set([
  "data.brreg.no",
  "avoindata.prh.fi",
  "find-and-update.company-information.service.gov.uk",
  "efts.sec.gov",
  "abr.business.gov.au",
  "cvrapi.dk",
  "allabolag.se",
  "app.companiesoffice.govt.nz",
  "www.handelsregister.de",
]);

/**
 * @typedef {object} NormalizedCandidate
 * @property {string} domain
 * @property {string} name
 * @property {string} website
 * @property {string} sourceTag
 * @property {string[]} sourceTags
 * @property {object} rawMetadata
 * @property {number|null} foundedYear
 * @property {string|null} employees
 * @property {string|null} country
 * @property {string|null} description
 * @property {number} sourceTier
 * @property {string} signalType
 */

/**
 * Extract a slug from a marketplace listing URL for dedup purposes.
 */
function extractListingSlug(url, domain) {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+|\/+$/g, "");
    const segments = path.split("/").filter(Boolean);
    const slug = segments[segments.length - 1] || segments[segments.length - 2] || "";
    const prefix = domain.split(".")[0];
    return slug ? `${prefix}--${slug}` : null;
  } catch {
    return null;
  }
}

/**
 * Extract an identifier from a registry URL for dedup purposes.
 */
function extractRegistryId(url, rawMetadata) {
  const id =
    rawMetadata?.organisasjonsnummer ||
    rawMetadata?.businessId ||
    rawMetadata?.companyNumber ||
    rawMetadata?.cik ||
    rawMetadata?.fileNumber ||
    rawMetadata?.nzbn ||
    rawMetadata?.registrationNumber;
  if (id) return `registry--${id}`;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+|\/+$/g, "");
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] ? `registry--${segments[segments.length - 1]}` : null;
  } catch {
    return null;
  }
}

/**
 * Normalize a raw candidate from an adapter into a consistent shape.
 * Returns null if the candidate should be skipped (invalid domain, etc.).
 * When called with `_returnReason: true`, returns { result, reason } instead.
 *
 * @param {object} raw - Raw candidate from adapter
 * @param {object} adapterMeta - { id, tier, signalType }
 * @param {object} [_opts]
 * @returns {NormalizedCandidate|null}
 */
export function normalizeCandidate(raw, adapterMeta, _opts) {
  if (!raw) return _opts?._returnReason ? { result: null, reason: "null input" } : null;

  const website = raw.website || raw.url || raw.homepage || "";
  const domain = normalizeDomain(website);

  if (!domain) {
    return _opts?._returnReason ? { result: null, reason: `empty domain from "${website}"` } : null;
  }

  const isMarketplaceListing = MARKETPLACE_DOMAINS.has(domain);
  const isRegistryUrl = REGISTRY_DOMAINS.has(domain);

  if (!isMarketplaceListing && !isRegistryUrl && !isLikelyCompanyDomain(domain)) {
    return _opts?._returnReason ? { result: null, reason: `blocked domain: ${domain}` } : null;
  }

  let effectiveDomain = domain;
  const extraMeta = {};

  if (isMarketplaceListing) {
    const slug = extractListingSlug(website, domain);
    if (!slug) {
      return _opts?._returnReason ? { result: null, reason: `no slug extractable from marketplace URL: ${website}` } : null;
    }
    effectiveDomain = `${slug}.pending-enrichment.local`;
    extraMeta.listingUrl = website;
    extraMeta.needsWebsiteResolution = true;
  } else if (isRegistryUrl) {
    const regId = extractRegistryId(website, raw.rawMetadata);
    if (!regId) {
      return _opts?._returnReason ? { result: null, reason: `no id extractable from registry URL: ${website}` } : null;
    }
    effectiveDomain = `${regId}.pending-enrichment.local`;
    extraMeta.registryUrl = website;
    extraMeta.needsWebsiteResolution = true;
  }

  const name = cleanName(raw.name || raw.companyName || effectiveDomain.split(".")[0]);
  if (!name || name.length < 2) {
    return _opts?._returnReason ? { result: null, reason: "name too short" } : null;
  }

  const tags = raw.sourceTags || [raw.sourceTag].filter(Boolean);
  if (!tags.length) tags.push(`expansion:${adapterMeta.id}`);

  const result = {
    domain: effectiveDomain,
    name,
    website: website.startsWith("http") ? website : `https://${website}`,
    sourceTag: tags[0],
    sourceTags: tags,
    rawMetadata: {
      ...(raw.rawMetadata || {}),
      ...extraMeta,
      adapterId: adapterMeta.id,
      sourceTier: adapterMeta.tier,
      signalType: adapterMeta.signalType,
    },
    foundedYear: parseYear(raw.foundedYear || raw.incorporationDate),
    employees: raw.employees || raw.employeeCount || null,
    country: raw.country || raw.jurisdiction || null,
    description: truncate(raw.description || raw.shortDescription, 500),
    sourceTier: adapterMeta.tier,
    signalType: adapterMeta.signalType,
  };

  return _opts?._returnReason ? { result, reason: null } : result;
}

/**
 * Batch-normalize and deduplicate candidates.
 * @param {object[]} rawCandidates
 * @param {object} adapterMeta
 * @param {object} [opts]
 * @param {boolean} [opts.verbose]
 * @returns {NormalizedCandidate[]}
 */
export function normalizeBatch(rawCandidates, adapterMeta, opts) {
  const seen = new Set();
  const results = [];
  const rejectionLog = [];

  for (const raw of rawCandidates) {
    const { result: c, reason } = normalizeCandidate(raw, adapterMeta, { _returnReason: true });
    if (!c) {
      if (rejectionLog.length < 3) {
        const label = raw?.website || raw?.url || raw?.name || "unknown";
        rejectionLog.push(`rejected ${label}: ${reason}`);
      }
      continue;
    }
    if (seen.has(c.domain)) continue;
    seen.add(c.domain);
    results.push(c);
  }

  if (rejectionLog.length && (opts?.verbose || process.env.EXPANSION_VERBOSE === "1")) {
    console.warn(`[${adapterMeta.id}] sample rejections: ${rejectionLog.join("; ")}`);
  }

  return results;
}

function cleanName(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/\s+/g, " ")
    .replace(/[""]/g, '"')
    .trim()
    .slice(0, 200);
}

function parseYear(raw) {
  if (!raw) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 1800 && raw < 2100 ? raw : null;
  const str = String(raw);
  const m = str.match(/(\d{4})/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  return y > 1800 && y < 2100 ? y : null;
}

function truncate(str, max) {
  if (!str || typeof str !== "string") return null;
  return str.length > max ? str.slice(0, max) + "..." : str;
}
