import * as cheerio from "cheerio";
import { fetchText } from "./lib/fetchText.js";
import { normalizeDomain, isLikelyCompanyDomain } from "./lib/domains.js";
import { openCorporatesSearch } from "./openCorporates.js";
import { extractOrganizationSignals } from "./lib/schemaOrgSignals.js";
import { tryFetchAtsSignals } from "./lib/atsPublic.js";
import { visibleTextFromHtml, sanitizeScrapedPlainText } from "./lib/visiblePageText.js";

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

const SOFTWARE_KW = [
  "saas",
  "software as a service",
  "cloud",
  "web app",
  "web application",
  "platform",
  "api",
  "sdk",
  "dashboard",
  "login",
  "sign in",
  "subscription",
  "per seat",
  "per user",
  "free trial",
  "request a demo",
  "integration",
  "on-premise",
  "microservices",
  "mobile app",
  "developer",
];

const HARDWARE_KW = [
  "sensor",
  "sensors",
  "device",
  "devices",
  "hardware",
  "iot module",
  "chip",
  "chipset",
  "microchip",
  "circuit board",
  "pcb",
  "embedded",
  "firmware",
  "transmitter",
  "receiver",
  "antenna",
  "actuator",
  "voltage",
  "amperage",
  "motor",
  "enclosure",
  "manufactured in",
  "factory",
  "oem",
  "bill of materials",
  "bom",
  "mechanical",
  "instrumentation",
];

function classifyCompanyType(swHits, hwHits) {
  if (swHits === 0 && hwHits === 0) {
    return { companyType: "unknown", companyTypeConfidence: 0 };
  }
  if (swHits >= hwHits + 2) {
    return { companyType: "software", companyTypeConfidence: Math.min(1, swHits / 6) };
  }
  if (hwHits >= swHits + 2) {
    return { companyType: "hardware", companyTypeConfidence: Math.min(1, hwHits / 6) };
  }
  return { companyType: "hybrid", companyTypeConfidence: Math.min(1, (swHits + hwHits) / 10) };
}

const EXTRA_PATHS = [
  "/leadership",
  "/contact",
  "/customers",
  "/pricing",
  "/careers",
  "/about-us",
  "/company",
  "/team",
];

export async function resolvePublicWebsite(candidate, fetchOpts = {}) {
  let url = candidate.website;
  if (!url) return candidate;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
    if (
      host.includes("g2.com") ||
      host.includes("capterra.com") ||
      host.includes("getapp.com")
    ) {
      const { ok, text } = await fetchText(url.startsWith("http") ? url : `https://${url}`, {
        timeout: 15000,
        ...fetchOpts,
      });
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
          return isLikelyCompanyDomain(d) && !d.includes("g2.com") && !d.includes("capterra.com");
        });
        if (ext) return { ...candidate, website: ext.split("?")[0] };
      }
    }
  } catch {
    /* keep original */
  }
  return candidate;
}

function joinUrl(base, path) {
  try {
    const u = new URL(base);
    return new URL(path, u.origin).href;
  } catch {
    return base + path;
  }
}

function extractSocials($) {
  const social = { linkedin: null, twitter: null, youtube: null, github: null };
  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") || "").split("?")[0];
    const h = href.toLowerCase();
    if (!social.linkedin && h.includes("linkedin.com/company")) social.linkedin = href;
    if (!social.twitter && (h.includes("twitter.com/") || h.includes("x.com/"))) social.twitter = href;
    if (!social.youtube && h.includes("youtube.com/")) social.youtube = href;
    if (!social.github && h.includes("github.com/")) social.github = href;
  });
  return social;
}

function extractTechHints(headers, htmlLower) {
  const hints = [];
  if (headers) {
    const s = headers["server"];
    const x = headers["x-powered-by"];
    if (s) hints.push(`server:${s}`);
    if (x) hints.push(`x-powered-by:${x}`);
  }
  if (htmlLower.includes("next.js")) hints.push("Next.js");
  if (htmlLower.includes("react")) hints.push("React");
  if (htmlLower.includes("angular")) hints.push("Angular");
  if (htmlLower.includes("vue.js") || htmlLower.includes("vuejs")) hints.push("Vue");
  if (htmlLower.includes("hubspot")) hints.push("HubSpot");
  if (htmlLower.includes("salesforce")) hints.push("Salesforce");
  if (htmlLower.includes("stripe")) hints.push("Stripe");
  return [...new Set(hints)].slice(0, 12);
}

function extractLeadership(text) {
  const leadership = [];
  const re =
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*[,|\-–]?\s*(Chief Executive Officer|CEO|CTO|CFO|COO|Founder|President|VP)/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(text)) !== null && leadership.length < 12) {
    const name = m[1]?.trim();
    const title = m[2]?.trim();
    if (!name || name.length < 3 || name.length > 48) continue;
    const k = `${name}|${title}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    leadership.push({ name, title });
  }
  return leadership;
}

function extractHqLine(text, ocAddress) {
  if (ocAddress && typeof ocAddress === "string" && ocAddress.length > 8) return ocAddress.trim().slice(0, 200);
  const m =
    text.match(/headquarters?\s*[:\-]\s*([^\n]{8,120})/i) ||
    text.match(/office\s+address\s*[:\-]\s*([^\n]{8,120})/i);
  if (m) return m[1].replace(/\s+/g, " ").trim().slice(0, 200);
  return null;
}

function inferPricingModel(lower, fetchedPricingPath) {
  if (!fetchedPricingPath && !lower.includes("pricing")) return null;
  if (lower.includes("per seat") || lower.includes("per user")) return "Per seat / user";
  if (lower.includes("usage-based") || lower.includes("usage based")) return "Usage-based";
  if (lower.includes("request a demo") || lower.includes("contact sales")) return "Demo / sales-led";
  if (lower.includes("free trial")) return "Free trial";
  return fetchedPricingPath ? "Pricing page" : null;
}

function employeesTextFromBody(text) {
  const m =
    text.match(/\b(\d{1,5})\+?\s+employees?\b/i) ||
    text.match(/\bteam\s+of\s+(\d{1,5})\b/i) ||
    text.match(/\b(\d{1,5})\s+people\s+strong\b/i);
  if (!m) return null;
  return m[0].replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function enrichCandidate(candidate, brief, env, fetchOpts = {}) {
  const resolved = await resolvePublicWebsite(candidate, fetchOpts);
  const domain = normalizeDomain(resolved.website);
  if (!domain || !isLikelyCompanyDomain(domain)) {
    return null;
  }
  const base = resolved.website.startsWith("http") ? resolved.website : `https://${resolved.website}`;
  let origin;
  try {
    origin = new URL(base).origin;
  } catch {
    origin = base;
  }

  const pages = new Set([base, ...EXTRA_PATHS.map((p) => joinUrl(base, p))]);

  try {
    const smUrl = joinUrl(base, "/sitemap.xml");
    const sm = await fetchText(smUrl, { timeout: 8000, ...fetchOpts });
    if (sm.ok && sm.text && sm.text.includes("<url")) {
      const $s = cheerio.load(sm.text, { xmlMode: true });
      $s("loc")
        .toArray()
        .slice(0, 25)
        .forEach((el) => {
          const loc = $s(el).text().trim();
          if (loc && loc.startsWith("http") && normalizeDomain(loc) === domain) pages.add(loc.split("?")[0]);
        });
    }
  } catch {
    /* ignore sitemap */
  }

  let combinedText = "";
  let title = resolved.name;
  const allHeaders = {};
  let fetchedPricingPath = false;
  let rawHtmlForSocial = "";

  for (const p of [...pages]) {
    try {
      const { ok, text, headers } = await fetchText(p, { timeout: 12000, ...fetchOpts });
      if (ok && text) {
        if (p.toLowerCase().includes("/pricing")) fetchedPricingPath = true;
        if (headers) Object.assign(allHeaders, headers);
        const $ = cheerio.load(text);
        const t = $("title").first().text().trim();
        if (t) title = t.split("|")[0].trim();
        const body = visibleTextFromHtml(text).slice(0, 12000);
        combinedText += "\n" + body;
        if (!rawHtmlForSocial && p.split("?")[0] === base.split("?")[0]) {
          rawHtmlForSocial = text;
        }
      }
    } catch {
      /* ignore */
    }
  }

  combinedText = sanitizeScrapedPlainText(combinedText);

  const htmlLower = (rawHtmlForSocial || "").toLowerCase();
  const $first = cheerio.load(rawHtmlForSocial || `<html><body>${combinedText}</body></html>`);
  const social = extractSocials($first);
  const techHints = extractTechHints(allHeaders, htmlLower);

  const structured = extractOrganizationSignals(rawHtmlForSocial || "");

  const lower = combinedText.toLowerCase();
  const oc = await openCorporatesSearch(resolved.name);

  let foundedYear = resolved.foundedYear ?? null;
  if (!foundedYear && structured.foundedYear) foundedYear = structured.foundedYear;
  const fyMatch = lower.match(/\bfounded\s*(?:in)?\s*(\d{4})\b/) || lower.match(/\best\.?\s*(\d{4})\b/);
  if (!foundedYear && fyMatch) foundedYear = parseInt(fyMatch[1], 10);
  if (resolved.rawMetadata?.apolloFoundedYear && !foundedYear) {
    const y = parseInt(String(resolved.rawMetadata.apolloFoundedYear), 10);
    if (!Number.isNaN(y)) foundedYear = y;
  }
  if (!foundedYear && oc?.incorporationDate) {
    const y = parseInt(oc.incorporationDate.slice(0, 4), 10);
    if (!Number.isNaN(y)) foundedYear = y;
  }

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
  const leadership = extractLeadership(combinedText.slice(0, 12000));

  /** @type {string|null} */
  let employeesText = employeesTextFromBody(combinedText);
  if (!employeesText && structured.employeesBand) employeesText = structured.employeesBand;
  /** @type {string|null} */
  const employeesMerged = resolved.employees ?? structured.employeesBand ?? null;
  /** @type {string|null} */
  const hq = extractHqLine(combinedText, oc?.registeredAddress) ?? structured.addressSnippet ?? null;

  const atsSignals = await tryFetchAtsSignals((rawHtmlForSocial || "") + "\n" + combinedText.slice(0, 20000));

  const pricingModel = inferPricingModel(lower, fetchedPricingPath);

  const swHits = countKeywordHits(lower, SOFTWARE_KW);
  const hwHits = countKeywordHits(lower, HARDWARE_KW);
  const { companyType, companyTypeConfidence } = classifyCompanyType(swHits, hwHits);

  const productLabel =
    (resolved.matchedProducts?.length && resolved.matchedProducts.join(" · ")) || brief.activeProduct || "Software";

  const products =
    resolved.matchedProducts?.length > 0
      ? [...new Set(resolved.matchedProducts)]
      : brief.activeProduct
        ? [brief.activeProduct]
        : [];

  return {
    ...resolved,
    sourceTags: resolved.sourceTags || [resolved.sourceTag].filter(Boolean),
    domain,
    website: base.split("?")[0],
    name: resolved.name || title,
    description: buildDescription(combinedText, resolved.name, productLabel),
    foundedYear,
    hq,
    country: oc?.jurisdiction || "US",
    employees: employeesMerged,
    revenue: resolved.revenue ?? null,
    schemaOrgEmployeesBand: structured.employeesBand,
    homepageMetaDescription: structured.metaDescription,
    atsOpenRoles: atsSignals?.openRoles ?? null,
    atsProvider: atsSignals?.provider ?? null,
    verticals: brief.selectedVerticals?.length ? brief.selectedVerticals : [],
    products,
    tags: Array.isArray(brief.selectedTags) ? brief.selectedTags : [],
    acquisitionHistory,
    founderStillOperating,
    openCorporates: oc,
    homepageTextSample: combinedText.slice(0, 4000),
    braveSnippet: braveSnippet.slice(0, 2000),
    missionCriticalKeywords: countKeywordHits(lower, MISSION_KW),
    ossSignals: countKeywordHits(lower, OSS_KW),
    softwareKeywordHits: swHits,
    hardwareKeywordHits: hwHits,
    companyType,
    companyTypeConfidence,
    leadership,
    social,
    techHints,
    pricingModel,
    employeesText,
  };
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
  const t = sanitizeScrapedPlainText(text).slice(0, 280);
  if (t.length < 40) return `${name} — B2B software vendor in ${product} (limited public text).`;
  return `${name}: ${t.slice(0, 240)}…`;
}
