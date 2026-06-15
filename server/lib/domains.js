/** Normalize hostname to registrable-style domain (best-effort). */
export function normalizeDomain(input) {
  if (!input || typeof input !== "string") return "";
  try {
    let u = input.trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    const host = new URL(u).hostname.toLowerCase();
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Host fragments for review/directory listing pages (not vendor homepages). */
export const DIRECTORY_LISTING_HOST_MARKERS = [
  "g2.com",
  "capterra.com",
  "getapp.com",
  "softwareadvice.com",
  "trustradius.com",
  "sourceforge.net",
  "slashdot.org",
  "saashub.com",
  "alternativeto.net",
  "crozdesk.com",
  "saasworthy.com",
  "financesonline.com",
];

export function isDirectoryListingHost(domain) {
  if (!domain) return false;
  const d = domain.toLowerCase();
  return DIRECTORY_LISTING_HOST_MARKERS.some((m) => d.includes(m));
}

export function isLikelyCompanyDomain(domain) {
  if (!domain || domain.length < 4) return false;
  const blocked = new Set([
    "linkedin.com",
    "twitter.com",
    "x.com",
    "facebook.com",
    "instagram.com",
    "youtube.com",
    "tiktok.com",
    "updatestar.com",
    "meta.com",
    "google.com",
    "g2.com",
    "capterra.com",
    "getapp.com",
    "softwareadvice.com",
    "sourceforge.net",
    "slashdot.org",
    "saashub.com",
    "alternativeto.net",
    "trustradius.com",
    "crozdesk.com",
    "saasworthy.com",
    "financesonline.com",
    "producthunt.com",
    "stackshare.io",
    "appsource.microsoft.com",
    "appexchange.salesforce.com",
    "ecosystem.hubspot.com",
    "apps.intuit.com",
    "apps.xero.com",
    "marketplace.procore.com",
    "suiteapp.com",
    "gartner.com",
    "wikipedia.org",
    "github.com",
    "medium.com",
    "crunchbase.com",
    "apollo.io",
    "zoominfo.com",
  ]);
  if (blocked.has(domain) || domain.endsWith(".linkedin.com") || domain.endsWith(".facebook.com")) {
    return false;
  }
  if (/\.(gov|edu)$/i.test(domain)) return false;
  return true;
}

/** Reject PDFs, social video pages, and other non-homepage URLs for enrich-list lookup. */
export function isBlockedEnrichUrl(url) {
  if (!url || typeof url !== "string") return true;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const path = u.pathname.toLowerCase();
    if (path.endsWith(".pdf")) return true;
    if (u.hostname.includes("tiktok.com") && /\/video\//.test(path)) return true;
    const domain = normalizeDomain(url);
    if (!domain || !isLikelyCompanyDomain(domain)) return true;
    const blockedHosts = ["updatestar.com", "download.cnet.com", "softonic.com", "softpedia.com"];
    if (blockedHosts.some((h) => domain.includes(h))) return true;
    return false;
  } catch {
    return true;
  }
}

/** Normalize a URL to the site root (scheme + host). */
export function normalizeToSiteRoot(url) {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return url;
  }
}

/** Count path segments (shallower is better for homepage). */
export function urlPathDepth(url) {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const segs = u.pathname.split("/").filter(Boolean);
    return segs.length;
  } catch {
    return 99;
  }
}

export function mergeSourceTags(a, b) {
  const set = new Set([...(a || []), ...(b || [])]);
  return [...set];
}
