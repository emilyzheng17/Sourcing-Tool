import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { fetchText } from "../lib/fetchText.js";
import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";

/**
 * Pull http(s) URLs from Next.js __NEXT_DATA__ payload (SSR pages).
 */
export function extractFromNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
  if (!m) return [];
  try {
    const json = JSON.parse(m[1]);
    const out = [];
    const walk = (obj) => {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) {
        obj.forEach(walk);
        return;
      }
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (v && typeof v === "object") walk(v);
        if (
          typeof v === "string" &&
          /^https?:\/\//i.test(v) &&
          /\.[a-z]{2,}(\/|$)/i.test(v)
        ) {
          const d = normalizeDomain(v);
          if (isLikelyCompanyDomain(d)) {
            out.push({ website: v.startsWith("http") ? v : `https://${v}`, name: null });
          }
        }
      }
    };
    walk(json);
    return out;
  } catch {
    return [];
  }
}

/**
 * @typedef {"pe"|"rollup"} PortfolioDetailKind
 */

/**
 * @param {PortfolioDetailKind} kind
 * @param {string} organizationName
 * @param {string} url
 * @param {number} [status]
 */
function baseRawMetadata(kind, organizationName, url, status) {
  if (kind === "pe") {
    return { peFirm: organizationName, portfolioUrl: url, ...(status != null ? { httpStatus: status } : {}) };
  }
  return { rollupPage: organizationName, pageUrl: url, ...(status != null ? { httpStatus: status } : {}) };
}

/**
 * @param {string} html
 * @param {string} baseUrl
 * @param {string} fullSourceTag
 * @param {object} mdBase
 */
export function extractExternalLinks(html, baseUrl, fullSourceTag, mdBase = {}) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const candidates = [];

  for (const el of $("a[href]").toArray()) {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    let abs;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(abs)) continue;
    const domain = normalizeDomain(abs);
    if (!isLikelyCompanyDomain(domain)) continue;
    const baseHost = normalizeDomain(baseUrl);
    if (domain === baseHost || domain.endsWith(`.${baseHost}`)) continue;

    const text = $(el).text().trim().replace(/\s+/g, " ");
    if (!seen.has(domain)) {
      seen.add(domain);
      candidates.push({
        name: text.length > 1 && text.length < 120 ? text : domain.split(".")[0],
        website: abs.split("?")[0],
        sourceTag: fullSourceTag,
        rawMetadata: { ...mdBase, from: "portfolio_link" },
      });
    }
  }
  return candidates;
}

/** Path slugs that signal an internal sub-hub listing operating groups / portfolio companies. */
const SUB_HUB_PATH_PATTERNS = [
  /\/companies(\/|$|\?)/i,
  /\/our-companies(\/|$|\?)/i,
  /\/our-portfolio(\/|$|\?)/i,
  /\/portfolio(\/|$|\?)/i,
  /\/our-businesses(\/|$|\?)/i,
  /\/our-business(\/|$|\?)/i,
  /\/businesses(\/|$|\?)/i,
  /\/brands(\/|$|\?)/i,
  /\/divisions(\/|$|\?)/i,
  /\/operating-groups(\/|$|\?)/i,
  /\/operating-companies(\/|$|\?)/i,
  /\/acquisitions(\/|$|\?)/i,
  /\/groups\//i,
];

/** Anchor-text fragments that signal a sub-hub listing even when the URL slug isn't conventional. */
const SUB_HUB_TEXT_PATTERNS = [
  /operating group/i,
  /our companies/i,
  /our businesses/i,
  /portfolio compan/i,
  /acquired compan/i,
];

/**
 * Extract same-(sub)domain internal links from `html` that look like sub-hub listings.
 * @param {string} html
 * @param {string} baseUrl
 * @returns {string[]} canonicalized absolute URLs (no fragment, query stripped)
 */
export function findSubHubLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const baseHost = normalizeDomain(baseUrl);
  if (!baseHost) return [];
  const seen = new Set();
  const out = [];
  for (const el of $("a[href]").toArray()) {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    let abs;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(abs)) continue;
    const domain = normalizeDomain(abs);
    if (!domain) continue;
    if (domain !== baseHost && !domain.endsWith(`.${baseHost}`)) continue;

    let path = "/";
    try {
      path = new URL(abs).pathname || "/";
    } catch {
      continue;
    }
    if (path === "/" || path === "") continue;

    const text = $(el).text().trim().replace(/\s+/g, " ");
    const pathMatch = SUB_HUB_PATH_PATTERNS.some((re) => re.test(path));
    const textMatch = SUB_HUB_TEXT_PATTERNS.some((re) => re.test(text));
    if (!pathMatch && !textMatch) continue;

    const canon = abs.split("#")[0].split("?")[0];
    if (seen.has(canon)) continue;
    seen.add(canon);
    out.push(canon);
  }
  return out;
}

/**
 * @param {string} portfolioUrl
 * @param {string} organizationName
 * @param {string} sourceTagPrefix ("PE"|"Rollup")
 * @param {PortfolioDetailKind} detailKind
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 * @param {object} [entryMetadata]
 * @param {{ crawlDepth?: number, pageBudget?: number, visited?: Set<string> }} [harvestOpts]
 * @returns {Promise<Array<{name:string, website:string, sourceTag:string, rawMetadata:object}>>}
 */
export async function harvestPortfolioLikePage(
  portfolioUrl,
  organizationName,
  sourceTagPrefix,
  detailKind,
  fetchOpts = {},
  entryMetadata = {},
  harvestOpts = {},
) {
  const { crawlDepth = 0, pageBudget = 1, visited = new Set() } = harvestOpts;
  const fullTag = `${sourceTagPrefix}:${organizationName}`;
  const rootUrl = (portfolioUrl || "").split("#")[0];
  if (!rootUrl) return [];
  if (visited.has(rootUrl)) return [];
  visited.add(rootUrl);

  const seenDomain = new Set();
  const out = [];
  let pagesUsed = 0;
  const effectiveBudget = Math.max(1, pageBudget);

  function pushUnique(rows) {
    for (const r of rows) {
      const website = typeof r.website === "string" ? r.website : "";
      const domain = normalizeDomain(website);
      if (!domain) continue;
      if (seenDomain.has(domain)) continue;
      seenDomain.add(domain);
      out.push(r);
    }
  }

  async function harvestOne(url, isRoot) {
    if (pagesUsed >= effectiveBudget) return null;
    pagesUsed += 1;
    try {
      const { ok, text, status } = await fetchText(url, {
        timeout: 25000,
        cache: fetchOpts.cache,
        jitterHostState: fetchOpts.jitterHostState,
      });
      if (!ok || !text) return null;
      const md = {
        ...baseRawMetadata(detailKind, organizationName, url, status),
        ...entryMetadata,
      };

      const nextRows = isRoot ? extractFromNextData(text) : [];
      if (nextRows.length > 0) {
        const rows = [];
        for (const r of nextRows) {
          const website = r.website || r;
          const domain = normalizeDomain(typeof website === "string" ? website : website.href || "");
          if (!domain) continue;
          rows.push({
            name: r.name || domain.replace(/^www\./, "").split(".")[0],
            website: typeof website === "string" ? website.split("?")[0] : String(website),
            sourceTag: fullTag,
            rawMetadata: { ...md, from: "next_data_json" },
          });
        }
        pushUnique(rows);
      } else {
        const linkMd = isRoot ? md : { ...md, viaSubHub: url };
        pushUnique(extractExternalLinks(text, url, fullTag, linkMd));
      }
      return text;
    } catch {
      return null;
    }
  }

  // Follow sub-hub links recursively up to `depthRemaining` levels. depthRemaining=1
  // reproduces the original single-level behavior; higher values recurse into
  // sub-groups (e.g. holdco → operating group → portfolio listing). The shared
  // `pagesUsed`/`effectiveBudget` and `visited` set bound total fetches and prevent loops.
  async function expandSubHubs(html, url, depthRemaining) {
    if (depthRemaining <= 0) return;
    const subHubs = findSubHubLinks(html, url);
    for (const sub of subHubs) {
      if (pagesUsed >= effectiveBudget) break;
      if (visited.has(sub)) continue;
      visited.add(sub);
      const subHtml = await harvestOne(sub, false);
      if (subHtml) await expandSubHubs(subHtml, sub, depthRemaining - 1);
    }
  }

  const rootHtml = await harvestOne(rootUrl, true);
  if (!rootHtml) return out;

  await expandSubHubs(rootHtml, rootUrl, crawlDepth);

  return out;
}

function entryPortfolioUrl(entry) {
  return entry.portfolioUrl ?? entry.pageUrl ?? "";
}

/**
 * @param {Array<{portfolioUrl?:string,pageUrl?:string,name:string,extraMetadata?:object}>} entries
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 * @param {{ sourceTagPrefix: string, detailKind: PortfolioDetailKind, concurrency?: number, crawlDepth?: number, pageBudget?: number }} opts
 */
export async function harvestPortfolioEntryList(entries, fetchOpts = {}, opts) {
  const { sourceTagPrefix, detailKind, concurrency = 6, crawlDepth = 0, pageBudget = 1 } = opts;
  const lim = pLimit(Math.max(1, concurrency));

  const tasks = entries.map((entry) =>
    lim(() =>
      harvestPortfolioLikePage(
        entryPortfolioUrl(entry),
        entry.name,
        sourceTagPrefix,
        detailKind,
        fetchOpts,
        entry.extraMetadata && typeof entry.extraMetadata === "object" ? entry.extraMetadata : {},
        { crawlDepth, pageBudget, visited: new Set() },
      ),
    ),
  );

  const batches = await Promise.all(tasks);
  return batches.flat();
}
