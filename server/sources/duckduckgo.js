import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { buildSearchQueries } from "../queryTemplates.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { getCached, putCached } from "../lib/dbCache.js";

const DDG_CACHE_TTL_DAYS = 3;
const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Decode DuckDuckGo redirect href (/l/?uddg=...) to the target URL.
 * @param {string} href
 * @returns {string|null}
 */
export function decodeDuckDuckGoHref(href) {
  if (!href) return null;
  const raw = String(href).trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  try {
    const u = new URL(raw, "https://duckduckgo.com");
    const uddg = u.searchParams.get("uddg");
    if (uddg) return decodeURIComponent(uddg);
  } catch {
    /* ignore */
  }
  const m = raw.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * DuckDuckGo HTML search — keyless, no API key.
 * Rate-limits aggressively; uses a conservative query budget.
 *
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} _env
 */
export async function searchDuckDuckGo(brief, _env) {
  const m = breadthMultiplier(brief);
  const maxQueries = Math.min(12, 6 * m);
  const maxResults = Math.min(200, 80 * m);

  const baseQueries = buildSearchQueries(brief);
  const extras = Array.isArray(brief.additionalSearchQueries)
    ? brief.additionalSearchQueries.map(String).filter(Boolean)
    : [];

  const seenQ = new Set();
  const queries = [...baseQueries, ...extras]
    .filter((q) => {
      const k = q.toLowerCase();
      if (seenQ.has(k)) return false;
      seenQ.add(k);
      return true;
    })
    .slice(0, maxQueries);

  const all = [];

  for (const q of queries) {
    try {
      const cacheKey = `duckduckgo:${q}`;
      let html;

      const cached = getCached(cacheKey, DDG_CACHE_TTL_DAYS);
      if (cached && cached.ok) {
        html = cached.payload || "";
      } else if (cached) {
        continue;
      } else {
        const res = await fetch(DDG_HTML_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
          },
          body: new URLSearchParams({ q }),
        });

        if (!res.ok) {
          putCached(cacheKey, "duckduckgo", false, null);
          continue;
        }

        html = await res.text();
        putCached(cacheKey, "duckduckgo", true, html);
      }

      all.push(...testParseDuckDuckGoHtml(html, q));
    } catch {
      /* ignore per-query failures */
    }
  }

  return dedupeDomain(all).slice(0, maxResults);
}

function dedupeDomain(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    const d = normalizeDomain(x.website);
    if (seen.has(d)) return false;
    seen.add(d);
    return true;
  });
}

/** Fixture helper — parse DuckDuckGo HTML result page. */
export function testParseDuckDuckGoHtml(html, query = "") {
  const out = [];
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const titleRaw = m[2].replace(/<[^>]+>/g, "").trim();
    const url = decodeDuckDuckGoHref(href);
    if (!url) continue;
    const domain = normalizeDomain(url);
    if (!isLikelyCompanyDomain(domain)) continue;
    out.push({
      name: titleRaw || domain,
      website: url.split("?")[0],
      sourceTag: "DuckDuckGo",
      rawMetadata: { query, ddgHref: href },
    });
  }
  return out;
}
