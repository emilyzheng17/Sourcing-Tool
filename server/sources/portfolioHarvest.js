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

/**
 * @param {string} portfolioUrl
 * @param {string} organizationName
 * @param {string} sourceTagPrefix ("PE"|"Rollup")
 * @param {PortfolioDetailKind} detailKind
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 * @returns {Promise<Array<{name:string, website:string, sourceTag:string, rawMetadata:object}>>}
 */
export async function harvestPortfolioLikePage(
  portfolioUrl,
  organizationName,
  sourceTagPrefix,
  detailKind,
  fetchOpts = {},
  entryMetadata = {},
) {
  const fullTag = `${sourceTagPrefix}:${organizationName}`;
  try {
    const { ok, text, status } = await fetchText(portfolioUrl, {
      timeout: 25000,
      cache: fetchOpts.cache,
      jitterHostState: fetchOpts.jitterHostState,
    });
    if (!ok || !text) return [];

    let rows = extractFromNextData(text);
    if (rows.length === 0) {
      rows = extractExternalLinks(
        text,
        portfolioUrl,
        fullTag,
        { ...baseRawMetadata(detailKind, organizationName, portfolioUrl, status), ...entryMetadata },
      );
      return rows;
    }

    const md = { ...baseRawMetadata(detailKind, organizationName, portfolioUrl, status), ...entryMetadata };
    const out = [];
    for (const r of rows) {
      const website = r.website || r;
      const domain = normalizeDomain(typeof website === "string" ? website : website.href || "");
      if (!domain) continue;
      out.push({
        name: r.name || domain.replace(/^www\./, "").split(".")[0],
        website: typeof website === "string" ? website.split("?")[0] : String(website),
        sourceTag: fullTag,
        rawMetadata: { ...md, from: "next_data_json" },
      });
    }
    return out;
  } catch {
    return [];
  }
}

function entryPortfolioUrl(entry) {
  return entry.portfolioUrl ?? entry.pageUrl ?? "";
}

/**
 * @param {Array<{portfolioUrl?:string,pageUrl?:string,name:string}>} entries
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 * @param {{ sourceTagPrefix: string, detailKind: PortfolioDetailKind, concurrency?: number }} opts
 */
export async function harvestPortfolioEntryList(entries, fetchOpts = {}, opts) {
  const { sourceTagPrefix, detailKind, concurrency = 6 } = opts;
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
      ),
    ),
  );

  const batches = await Promise.all(tasks);
  return batches.flat();
}
