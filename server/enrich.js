import * as cheerio from "cheerio";
import { fetchText } from "./lib/fetchText.js";
import { normalizeDomain, isLikelyCompanyDomain } from "./lib/domains.js";
import { openCorporatesSearch } from "./openCorporates.js";

const MISSION_KW = [
  "system of record",
  "compliance",
  "regulated",
  "audit trail",
  "required by",
  "mission critical",
  "mission-critical",
  "certified",
  "osha",
  "msha",
  "fda",
  "fra ",
  "dot ",
];
const OSS_KW = ["open source", "open-source", "github.com/", "apache license", "mit license", "gpl"];

export async function resolvePublicWebsite(candidate) {
  let url = candidate.website;
  if (!url) return candidate;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
    if (host.includes("g2.com") || host.includes("capterra.com") || host.includes("getapp.com")) {
      const { ok, text } = await fetchText(url.startsWith("http") ? url : `https://${url}`, { timeout: 15000 });
      if (ok && text) {
        const $ = cheerio.load(text);
        const visit = $('a[href*="http"]').filter((_, el) => {
          const t = $(el).text().toLowerCase();
          return t.includes("visit") && (t.includes("website") || t.includes("site"));
        }).first().attr("href");
        if (visit) {
          const d = normalizeDomain(visit);
          if (isLikelyCompanyDomain(d)) return { ...candidate, website: visit.split("?")[0] };
        }
        const ext = $("a[href^='http']").toArray().map((el) => $(el).attr("href")).find((h) => {
          if (!h) return false;
          const d = normalizeDomain(h);
          return isLikelyCompanyDomain(d) && !d.includes("g2.com") && !d.includes("capterra");
        });
        if (ext) return { ...candidate, website: ext.split("?")[0] };
      }
    }
  } catch {
    /* keep original */
  }
  return candidate;
}

export async function enrichCandidate(candidate, brief, env) {
  const resolved = await resolvePublicWebsite(candidate);
  const domain = normalizeDomain(resolved.website);
  if (!domain || !isLikelyCompanyDomain(domain)) {
    return null;
  }
  const base = resolved.website.startsWith("http") ? resolved.website : `https://${resolved.website}`;
  const pages = [base, joinUrl(base, "/about"), joinUrl(base, "/company"), joinUrl(base, "/team")];
  let combinedText = "";
  let title = resolved.name;
  for (const p of pages) {
    try {
      const { ok, text } = await fetchText(p, { timeout: 12000 });
      if (ok && text) {
        const $ = cheerio.load(text);
        const t = $("title").first().text().trim();
        if (t) title = t.split("|")[0].trim();
        const body = $("body").text().replace(/\s+/g, " ").slice(0, 12000);
        combinedText += "\n" + body;
      }
    } catch {
      /* ignore */
    }
  }
  const lower = combinedText.toLowerCase();
  const oc = await openCorporatesSearch(resolved.name);

  let foundedYear = null;
  if (oc?.incorporationDate) {
    const y = parseInt(oc.incorporationDate.slice(0, 4), 10);
    if (!Number.isNaN(y)) foundedYear = y;
  }
  const fyMatch = lower.match(/\bfounded\s*(?:in)?\s*(\d{4})\b/) || lower.match(/\best\.?\s*(\d{4})\b/);
  if (!foundedYear && fyMatch) foundedYear = parseInt(fyMatch[1], 10);

  const acquisitionHistory = [];
  if (resolved.rawMetadata?.peFirm) {
    acquisitionHistory.push({
      year: null,
      acquirer: resolved.rawMetadata.peFirm,
      source: "PE portfolio listing",
    });
  }

  let braveSnippet = "";
  if (env.BRAVE_API_KEY) {
    try {
      const q = `"${resolved.name}" acquired OR "private equity"`;
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "X-Subscription-Token": env.BRAVE_API_KEY },
      });
      if (res.ok) {
        const data = await res.json();
        const results = data.web?.results || [];
        braveSnippet = results.map((r) => r.description || "").join(" \n ");
        const acq = extractAcquisition(braveSnippet + " " + combinedText);
        if (acq.year && !acquisitionHistory.some((a) => a.year === acq.year))
          acquisitionHistory.push({ year: acq.year, acquirer: acq.acquirer, source: "web_snippet" });
      }
    } catch {
      /* ignore */
    }
  }

  const founderStillOperating = inferFounderCEO(lower, resolved.name);

  return {
    ...resolved,
    sourceTags: resolved.sourceTags || [resolved.sourceTag].filter(Boolean),
    domain,
    website: base.split("?")[0],
    name: resolved.name || title,
    description: buildDescription(combinedText, resolved.name, brief.activeProduct),
    foundedYear,
    hq: null,
    country: "US",
    employees: null,
    revenue: null,
    verticals: brief.selectedVerticals?.length ? brief.selectedVerticals : [],
    products: [brief.activeProduct],
    tags: brief.selectedTags || [],
    acquisitionHistory,
    founderStillOperating,
    openCorporates: oc,
    homepageTextSample: combinedText.slice(0, 4000),
    braveSnippet: braveSnippet.slice(0, 2000),
    missionCriticalKeywords: countKeywordHits(lower, MISSION_KW),
    ossSignals: countKeywordHits(lower, OSS_KW),
  };
}

function joinUrl(base, path) {
  try {
    const u = new URL(base);
    return new URL(path, u.origin).href;
  } catch {
    return base + path;
  }
}

function countKeywordHits(lower, list) {
  let n = 0;
  for (const kw of list) {
    if (lower.includes(kw)) n += 1;
  }
  return n;
}

function extractAcquisition(text) {
  const m =
    text.match(/acquired by ([^.\n]+?)(?:\s+in\s+|\s*,\s*)(\d{4})/i) ||
    text.match(/acquisition[^.\n]{0,80}(\d{4})/i) ||
    text.match(/(\d{4})[^.\n]{0,40}acquir/i);
  if (!m) return { year: null, acquirer: null };
  const year = m[2] ? parseInt(m[2], 10) : m[1] ? parseInt(m[1], 10) : null;
  const acquirer = m[1] && isNaN(parseInt(m[1], 10)) ? m[1].trim().slice(0, 120) : null;
  return { year: year && year > 1980 && year < 2030 ? year : null, acquirer };
}

function inferFounderCEO(lower, companyName) {
  const m = lower.match(/(ceo|chief executive)[^\n.]{0,40}([a-z][a-z\s.'-]{2,40})/i);
  if (!m) return "unknown";
  const first = companyName.split(/\s+/)[0]?.toLowerCase();
  if (first && m[0].toLowerCase().includes(first)) return true;
  return "unknown";
}

function buildDescription(text, name, product) {
  const t = text.replace(/\s+/g, " ").trim().slice(0, 280);
  if (t.length < 40) return `${name} — B2B software vendor in ${product} (limited public text).`;
  return `${name}: ${t.slice(0, 240)}…`;
}
