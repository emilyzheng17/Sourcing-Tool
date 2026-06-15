import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { getCached, putCached } from "../lib/dbCache.js";

const WP_CACHE_TTL_DAYS = 7;
const WP_API = "https://api.wordpress.org/plugins/info/1.2/";
const USER_AGENT = "SourcingTool/1.0 (+https://github.com/) keyless-discovery";

/** wp.org's own hosts — a plugin `homepage` pointing here is not a vendor site. */
const WP_HOSTS = new Set(["wordpress.org", "w.org", "wordpress.com"]);

/** Minimal HTML-entity decode for plugin names (API returns e.g. `&#8211;`, `&amp;`). */
function decodeEntities(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map UI verticals → WordPress plugin search terms (long-tail niche ISVs). */
function buildQueries(brief) {
  const verts =
    Array.isArray(brief?.selectedVerticals) && brief.selectedVerticals.length
      ? brief.selectedVerticals
      : ["field service"];
  const product = brief?.activeProduct;
  const out = [];
  for (const v of verts) {
    out.push(v);
    if (product) out.push(`${v} ${product}`);
  }
  const seen = new Set();
  return out.filter((q) => {
    const k = q.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Fixture helper — map WordPress plugin objects (with `homepage`) to candidates. */
export function testParseWordpressPlugins(plugins, query = "") {
  const out = [];
  const seen = new Set();
  for (const p of plugins || []) {
    const url = p?.homepage;
    if (!url || typeof url !== "string") continue;
    const domain = normalizeDomain(url);
    if (!domain || !isLikelyCompanyDomain(domain)) continue;
    if (WP_HOSTS.has(domain)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({
      name: decodeEntities(p.name) || domain.split(".")[0],
      website: url.split("?")[0],
      sourceTag: "WordPress",
      rawMetadata: {
        wpQuery: query,
        ...(p.slug ? { wpSlug: p.slug } : {}),
        ...(p.short_description
          ? { description: decodeEntities(p.short_description).slice(0, 200) }
          : {}),
        ...(Number.isFinite(p.active_installs) ? { wpActiveInstalls: p.active_installs } : {}),
      },
    });
  }
  return out;
}

async function fetchWpQuery(query, perPage) {
  const cacheKey = `wordpress:${query}:${perPage}`;
  const cached = getCached(cacheKey, WP_CACHE_TTL_DAYS);
  if (cached) return cached.ok ? cached.payload || [] : [];
  try {
    const params = new URLSearchParams();
    params.set("action", "query_plugins");
    params.set("request[search]", query);
    params.set("request[per_page]", String(perPage));
    const res = await fetch(`${WP_API}?${params}`, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      putCached(cacheKey, "wordpress", false, null);
      return [];
    }
    const data = await res.json();
    const plugins = Array.isArray(data?.plugins) ? data.plugins : [];
    putCached(cacheKey, "wordpress", true, plugins);
    return plugins;
  } catch {
    putCached(cacheKey, "wordpress", false, null);
    return [];
  }
}

/**
 * WordPress.org plugin directory — keyless, fully-open JSON API.
 * Enumerates long-tail niche ISVs by vertical keyword, resolving each plugin's
 * `homepage` to a vendor website. Degrades to [] on any failure.
 *
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} _env
 */
export async function searchWordpress(brief, _env) {
  const m = breadthMultiplier(brief);
  const queries = buildQueries(brief).slice(0, Math.min(8, 2 + 2 * m));
  const perPage = Math.min(100, 40 * m);
  const maxResults = Math.min(400, 150 * m);

  const all = [];
  const seen = new Set();
  for (const q of queries) {
    const plugins = await fetchWpQuery(q, perPage);
    for (const cand of testParseWordpressPlugins(plugins, q)) {
      const d = normalizeDomain(cand.website);
      if (seen.has(d)) continue;
      seen.add(d);
      all.push(cand);
    }
  }
  return all.slice(0, maxResults);
}
