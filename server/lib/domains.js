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
  if (blocked.has(domain) || domain.endsWith(".linkedin.com")) return false;
  if (/\.(gov|edu)$/i.test(domain)) return false;
  return true;
}

export function mergeSourceTags(a, b) {
  const set = new Set([...(a || []), ...(b || [])]);
  return [...set];
}
