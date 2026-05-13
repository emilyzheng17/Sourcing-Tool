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
