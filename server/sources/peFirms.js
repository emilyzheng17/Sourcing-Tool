import * as cheerio from "cheerio";
import { fetchText } from "../lib/fetchText.js";
import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { PE_FIRMS } from "./peFirms.data.js";

function extractFromNextData(html) {
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
        if (typeof v === "string" && /^https?:\/\//i.test(v) && /\.[a-z]{2,}(\/|$)/i.test(v)) {
          const d = normalizeDomain(v);
          if (isLikelyCompanyDomain(d)) out.push({ website: v.startsWith("http") ? v : `https://${v}`, name: null });
        }
      }
    };
    walk(json);
    return out;
  } catch {
    return [];
  }
}

function extractExternalLinks(html, baseUrl, peFirmName) {
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
        sourceTag: `PE:${peFirmName}`,
        rawMetadata: { peFirm: peFirmName, from: "portfolio_link" },
      });
    }
  }
  return candidates;
}

/**
 * @returns {Promise<Array<{name:string, website:string, sourceTag:string, rawMetadata:object}>>}
 */
export async function searchPePortfolios() {
  const all = [];
  const limit = Math.min(PE_FIRMS.length, 20);
  for (const firm of PE_FIRMS.slice(0, limit)) {
    try {
      const { ok, text, status } = await fetchText(firm.portfolioUrl, { timeout: 25000 });
      if (!ok || !text) continue;
      let rows = extractFromNextData(text);
      if (rows.length === 0) rows = extractExternalLinks(text, firm.portfolioUrl, firm.name);
      for (const r of rows) {
        const website = r.website || r;
        const domain = normalizeDomain(typeof website === "string" ? website : website.href || "");
        if (!domain) continue;
        all.push({
          name: r.name || domain.replace(/^www\./, "").split(".")[0],
          website: typeof website === "string" ? website.split("?")[0] : String(website),
          sourceTag: `PE:${firm.name}`,
          rawMetadata: { peFirm: firm.name, portfolioUrl: firm.portfolioUrl, httpStatus: status },
        });
      }
    } catch {
      /* network / block */
    }
  }
  return all;
}
