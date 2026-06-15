import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { getCached, putCached } from "../lib/dbCache.js";

const YC_CACHE_TTL_DAYS = 7;
const YC_API_BASE = "https://yc-oss.github.io/api/industries";
const USER_AGENT = "SourcingTool/1.0 (+https://github.com/) keyless-discovery";

/** Map UI verticals → YC industry endpoint slugs (community yc-oss API). */
const VERTICAL_TO_YC_INDUSTRIES = {
  "ERP & Operations": ["operations", "industrials"],
  "Fleet & Asset Management": ["transportation-services", "supply-chain-and-logistics"],
  "Safety & Compliance Management": ["industrials"],
  "Field Service Management": ["operations"],
  "Estimating & Bidding": ["construction", "real-estate-and-construction"],
  "Supply Chain & Inventory": ["supply-chain-and-logistics"],
  "Dispatch & Logistics": ["supply-chain-and-logistics", "transportation-services"],
  "Environmental & Waste Management": ["industrials"],
  "Structural & Engineering Design": ["construction", "engineering-product-and-design"],
  "Project Management": ["construction", "productivity"],
  "Maintenance Management (CMMS)": ["industrials", "operations"],
  "Weighbridge & Ticketing": ["industrials"],
  "CRM & Sales": ["sales"],
  "HR & Workforce Management": ["human-resources"],
  "Business Intelligence & Reporting": ["analytics"],
};

const DEFAULT_INDUSTRIES = ["b2b", "industrials", "operations"];

function industrySlugsFor(brief) {
  const verts = Array.isArray(brief?.selectedVerticals) ? brief.selectedVerticals : [];
  const out = new Set();
  for (const v of verts) {
    for (const slug of VERTICAL_TO_YC_INDUSTRIES[v] || []) out.add(slug);
  }
  if (out.size === 0) for (const s of DEFAULT_INDUSTRIES) out.add(s);
  return [...out];
}

async function fetchYcIndustry(slug) {
  const cacheKey = `yc:${slug}`;
  const cached = getCached(cacheKey, YC_CACHE_TTL_DAYS);
  if (cached) return cached.ok ? cached.payload || [] : [];
  try {
    const res = await fetch(`${YC_API_BASE}/${slug}.json`, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      putCached(cacheKey, "yc", false, null);
      return [];
    }
    const data = await res.json();
    const arr = Array.isArray(data) ? data : [];
    putCached(cacheKey, "yc", true, arr);
    return arr;
  } catch {
    putCached(cacheKey, "yc", false, null);
    return [];
  }
}

/** Fixture helper — map yc-oss company objects to discovery candidates. */
export function testParseYcCompanies(companies, slug = "") {
  const out = [];
  const seen = new Set();
  for (const c of companies || []) {
    const url = c?.website;
    if (!url || typeof url !== "string") continue;
    // Public companies are excluded downstream; skip early to save enrichment.
    if (String(c.status || "").toLowerCase() === "public") continue;
    const domain = normalizeDomain(url);
    if (!domain || !isLikelyCompanyDomain(domain)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({
      name: c.name || domain.split(".")[0],
      website: url.split("?")[0],
      sourceTag: "YCombinator",
      rawMetadata: {
        ycIndustry: slug || c.industry || "",
        ...(c.one_liner ? { description: c.one_liner } : {}),
        ...(Array.isArray(c.tags) && c.tags.length ? { ycTags: c.tags.slice(0, 8) } : {}),
        ...(c.batch ? { ycBatch: c.batch } : {}),
      },
    });
  }
  return out;
}

/**
 * Y Combinator company directory — keyless (community yc-oss API).
 * Pulls B2B/industrial/operations industry slices mapped from the brief verticals.
 *
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} _env
 */
export async function searchYCombinator(brief, _env) {
  const m = breadthMultiplier(brief);
  const slugs = industrySlugsFor(brief).slice(0, Math.min(5, 2 + m));
  const maxResults = Math.min(500, 150 * m);

  const all = [];
  const seen = new Set();
  for (const slug of slugs) {
    const companies = await fetchYcIndustry(slug);
    for (const cand of testParseYcCompanies(companies, slug)) {
      const d = normalizeDomain(cand.website);
      if (seen.has(d)) continue;
      seen.add(d);
      all.push(cand);
    }
  }
  return all.slice(0, maxResults);
}
