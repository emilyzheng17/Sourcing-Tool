import * as cheerio from "cheerio";
import PQueue from "p-queue";
import { enrichCandidateStageA, enrichCandidateStageB } from "./enrich.js";
import { fetchText } from "./lib/fetchText.js";
import { getCached, putCached } from "./lib/dbCache.js";
import {
  normalizeDomain,
  isLikelyCompanyDomain,
  isBlockedEnrichUrl,
  normalizeToSiteRoot,
  urlPathDepth,
} from "./lib/domains.js";
import { inferOwnershipClass } from "./lib/ownershipClassify.js";
import {
  visibleTextFromHtml,
  sanitizeScrapedPlainText,
  pickBestOverview,
  isJunkOverviewText,
} from "./lib/visiblePageText.js";
import { extractOrganizationSignals } from "./lib/schemaOrgSignals.js";
import { pickEnrichListVerticals, sanitizeCorpus } from "./lib/verticalFit.js";
import { ollamaEnrichListGapFill } from "./providers/ollamaEnrichList.js";
import { scoreThesis } from "./score.js";
import { searchSerperQuery, searchTavilyQuery, searchBraveQuery } from "./lib/webSearch.js";
import { searchCompanyFacts } from "./lib/factSearch.js";
import {
  looksLikePersonName,
  extractHeadcountFromText,
  extractFoundedYearFromText,
  formatEmployeeBandFromCount,
} from "./lib/companyTextExtract.js";
import {
  extractLeadershipFromText,
  mergeLeadershipCandidates,
  pickLeadershipContact,
} from "./lib/leadershipExtract.js";

export { looksLikePersonName, extractHeadcountFromText };

const DOMAIN_LOOKUP_TTL_DAYS = 7;
const MIN_DOMAIN_LOOKUP_SCORE = 22;

const PERMISSIVE_BRIEF = {
  selectedVerticals: [],
  selectedProducts: [],
  selectedTags: [],
  activeProduct: null,
};

// #region Header helpers
function normalizeHeader(h) {
  return String(h ?? "")
    .toLowerCase()
    .trim();
}

function findRowKey(row, aliases) {
  for (const key of Object.keys(row || {})) {
    const norm = normalizeHeader(key);
    if (aliases.some((a) => norm === a)) return key;
  }
  return null;
}

export function detectCompanyColumn(row) {
  const keys = Object.keys(row || {});
  const companyKey = findRowKey(row, ["company", "name"]);
  if (companyKey) return companyKey;
  return keys[0] || "Company";
}

function getRowValue(row, aliases) {
  const key = findRowKey(row, aliases);
  if (!key) return "";
  const v = row[key];
  return v == null ? "" : String(v).trim();
}

function setRowValue(out, row, aliases, value) {
  const key = findRowKey(row, aliases);
  if (key && value != null && String(value).trim() !== "") {
    out[key] = value;
  }
}

function looksLikeUrl(val) {
  if (/^https?:\/\//i.test(val)) return true;
  if (/^[^\s|]+\.[a-z]{2,}(\/|$)/i.test(val)) return true;
  return false;
}
// #endregion

// #region Domain resolution
function nameTokens(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function domainMatchesName(domain, name) {
  const tokens = nameTokens(name);
  if (!tokens.length) return true;
  const label = domain.split(".")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!label) return false;
  return tokens.some((t) => {
    if (t.length < 3) return false;
    return label.includes(t) || t.includes(label.slice(0, Math.min(5, label.length)));
  });
}

const DEEP_PATH_PENALTY = /\/(?:support|blog|products|video|fileadmin|wp-content\/uploads)\//i;

/** Score a search result for enrich-list domain resolution (exported for tests). */
export function scoreDomainLookupResult(result, name) {
  const u = result.url || result.link;
  if (!u || isBlockedEnrichUrl(u)) return -1;

  const domain = normalizeDomain(u);
  if (!domain || !isLikelyCompanyDomain(domain)) return -1;

  let score = 0;
  const depth = urlPathDepth(u);
  if (depth === 0) score += 35;
  else if (depth === 1) score += 18;
  else if (depth >= 3) score -= 22;

  if (DEEP_PATH_PENALTY.test(u)) score -= 25;

  const title = String(result.title || "").toLowerCase();
  const snippet = String(result.snippet || "").toLowerCase();
  const nameLower = String(name || "").toLowerCase();
  const tokens = nameTokens(name);

  if (domainMatchesName(domain, name)) score += 38;
  else if (tokens.length) score -= 12;

  if (title.includes(nameLower) || snippet.includes(nameLower)) score += 16;
  for (const t of tokens) {
    if (t.length >= 4 && (title.includes(t) || snippet.includes(t))) score += 6;
  }

  return score;
}

/** Pick best scored search result; returns null if below minimum threshold. */
export function pickBestDomainLookupResult(results, name) {
  let best = null;
  let bestScore = -1;

  for (const r of results) {
    const score = scoreDomainLookupResult(r, name);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }

  if (!best || bestScore < MIN_DOMAIN_LOOKUP_SCORE) return null;

  const u = (best.url || best.link).split("?")[0];
  const domain = normalizeDomain(u);
  return { website: normalizeToSiteRoot(u), domain, score: bestScore };
}

function pickBestResult(results, name) {
  return pickBestDomainLookupResult(results, name);
}

async function searchWebForDomain(query, env) {
  const providers = [
    () => searchSerperQuery(query, env),
    () => searchTavilyQuery(query, env),
    () => searchBraveQuery(query, env),
  ];
  for (const provider of providers) {
    try {
      const results = await provider();
      if (results.length) return results;
    } catch {
      /* try next */
    }
  }
  return [];
}

export async function resolveDomainForName(name, env) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;

  const cacheKey = `domain-lookup:${trimmed.toLowerCase()}`;
  const cached = getCached(cacheKey, DOMAIN_LOOKUP_TTL_DAYS);
  if (cached?.ok && cached.payload) return cached.payload;

  const query = `"${trimmed}" official site`;
  const results = await searchWebForDomain(query, env);
  const picked = pickBestResult(results, trimmed);
  if (picked) {
    const payload = { website: picked.website, domain: picked.domain };
    putCached(cacheKey, "domain-lookup", true, payload);
    return payload;
  }

  return null;
}
// #endregion

// #region Email & contact helpers
function joinUrl(base, path) {
  try {
    const u = new URL(base.startsWith("http") ? base : `https://${base}`);
    return new URL(path, u.origin).href;
  } catch {
    return base + path;
  }
}

const GENERIC_EMAIL_LOCAL = /^(info|sales|support|contact|hello|admin|office|marketing|hr|careers|jobs|noreply|no-reply)$/i;

/** @param {string} email @param {string} [companyDomain] @param {string} [contactName] */
function scoreEmailCandidate(email, companyDomain, contactName) {
  let score = 0;
  const parts = email.split("@");
  if (parts.length !== 2) return -1;
  const [local, domain] = parts;
  if (companyDomain && domain === companyDomain) score += 25;
  else if (companyDomain && domain.endsWith(`.${companyDomain}`)) score += 15;
  if (/^[a-z][a-z0-9._-]*\.[a-z][a-z0-9._-]*@/i.test(email)) score += 10;
  if (GENERIC_EMAIL_LOCAL.test(local)) score -= 8;
  if (/\.(png|jpg|gif|svg|webp)$/i.test(email)) return -1;

  if (contactName) {
    const nameParts = contactName
      .toLowerCase()
      .split(/\s+/)
      .filter((p) => p.length >= 2);
    const localLower = local.toLowerCase();
    if (nameParts.length >= 2) {
      const first = nameParts[0];
      const last = nameParts[nameParts.length - 1];
      if (localLower === `${first}.${last}`) score += 30;
      else if (localLower.includes(`${first}.${last}`)) score += 22;
      else if (localLower.includes(first) && localLower.includes(last)) score += 18;
      else if (localLower.startsWith(first[0]) && localLower.includes(last)) score += 12;
    }
  }

  return score;
}

async function extractEmailFromSite(base, fetchOpts = {}, contactName = "") {
  const urls = [
    base,
    joinUrl(base, "/contact"),
    joinUrl(base, "/about"),
    joinUrl(base, "/team"),
    joinUrl(base, "/leadership"),
  ];
  const emails = new Set();
  const companyDomain = normalizeDomain(base);

  for (const url of urls) {
    try {
      const { ok, text } = await fetchText(url, { timeout: 10000, maxBytes: 120000, ...fetchOpts });
      if (!ok || !text) continue;
      const $ = cheerio.load(text);
      $('a[href^="mailto:"]').each((_, el) => {
        const href = ($(el).attr("href") || "").replace(/^mailto:/i, "").split("?")[0].trim();
        if (href && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(href)) emails.add(href.toLowerCase());
      });
      const re = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
      const matches = text.match(re) || [];
      for (const m of matches) {
        const lower = m.toLowerCase();
        if (/example\.com|sentry\.io|wixpress|cloudflare|schema\.org|w3\.org|gravatar/i.test(lower)) continue;
        emails.add(lower);
      }
    } catch {
      /* ignore */
    }
  }

  const ranked = [...emails]
    .map((email) => ({ email, score: scoreEmailCandidate(email, companyDomain, contactName) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.email || "";
}

function mergeEnrichedWithFacts(enriched, facts) {
  if (!enriched) return enriched;
  if (!facts) return enriched;

  const leadership = mergeLeadershipCandidates(enriched.leadership, facts.leadershipCandidates);
  const out = { ...enriched, leadership };

  if (!out.employees && facts.employees) out.employees = facts.employees;
  if (!out.foundedYear && facts.foundedYear) out.foundedYear = facts.foundedYear;
  if (!out.revenue && facts.revenue) out.revenue = facts.revenue;
  if (facts.snippetCorpus) out.factSearchSnippets = facts.snippetCorpus;
  if (facts.linkedinUrl) {
    out.social = { ...(out.social || {}), linkedin: facts.linkedinUrl };
  }
  return out;
}

function buildEnrichContextText(context, fields = {}) {
  return [
    context?.homepageTextSample,
    context?.combinedTextSample,
    context?.braveSnippet,
    context?.factSearchSnippets,
    context?.description,
    fields.overview,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const QUALITY_GOLD_MIN = 70;
export const QUALITY_SILVER_MIN = 45;

/** @param {number} thesisScore */
export function deriveQualityTier(thesisScore) {
  const s = Number(thesisScore);
  if (!Number.isFinite(s)) return "Bronze";
  if (s >= QUALITY_GOLD_MIN) return "Gold";
  if (s >= QUALITY_SILVER_MIN) return "Silver";
  return "Bronze";
}

function mapOwnershipToSpreadsheet(ownershipClass, founderStillOperating) {
  if (ownershipClass === "VC Backed") return "VC-Backed";
  if (ownershipClass === "PE Owned") return "PE-Owned";
  if (ownershipClass === "Founder Operated" || ownershipClass === "Founder Owned") {
    if (founderStillOperating === true) return "FOFO";
    return "Founder Owned";
  }
  if (ownershipClass === "Publicly Traded") return "Public";
  return ownershipClass || "Unknown";
}

function deriveVertical(enriched) {
  const fromFit = (enriched.verticals || []).filter(Boolean);
  if (fromFit.length) return fromFit.join(", ");
  const ocIndustry = enriched.openCorporates?.industry;
  if (ocIndustry) return String(ocIndustry).trim();
  return "";
}
// #endregion

// #region Minimal fallback enrichment
async function minimalEnrichFromWebsite(name, website, fetchOpts = {}) {
  const base = website.startsWith("http") ? website : `https://${website}`;
  let homepageText = "";
  let structured = { metaDescription: null };

  try {
    const { ok, text } = await fetchText(base, { timeout: 12000, maxBytes: 80000, ...fetchOpts });
    if (ok && text) {
      homepageText = sanitizeScrapedPlainText(visibleTextFromHtml(text)).slice(0, 4000);
      structured = extractOrganizationSignals(text);
    }
  } catch {
    /* ignore */
  }

  const description = pickBestOverview({
    name,
    homepageMetaDescription: structured.metaDescription,
    homepageTextSample: homepageText,
  });

  const leadership = mergeLeadershipCandidates(
    extractLeadershipFromText(homepageText),
    structured.people || [],
  );

  const { contactName, role } = pickLeadershipContact(leadership);
  const email = await extractEmailFromSite(base, fetchOpts, contactName);
  const domain = normalizeDomain(base);

  const fitCorpus = sanitizeCorpus(homepageText);
  const verticals = pickEnrichListVerticals(name, fitCorpus, "");
  const vertical = verticals.join(", ");

  const headcount = extractHeadcountFromText(homepageText);
  const foundedYear = structured.foundedYear ?? extractFoundedYearFromText(homepageText);
  const employees = structured.employeesBand || (headcount ? formatEmployeeBandFromCount(headcount) : null);

  const ownershipResult = inferOwnershipClass({
    name,
    description,
    homepageTextSample: homepageText,
    founderStillOperating: "unknown",
    leadership,
  });

  return {
    website: base.split("?")[0],
    domain,
    name,
    description,
    foundedYear,
    country: "US",
    employees,
    revenue: null,
    vertical,
    verticals,
    ownership: mapOwnershipToSpreadsheet(ownershipResult.ownership_class, false),
    contactName,
    role,
    email,
    leadership,
    homepageTextSample: homepageText,
  };
}
// #endregion

// #region Row enrichment
function buildSpreadsheetFields(enriched, emailOverride) {
  const ownershipResult = inferOwnershipClass(enriched);
  const { contactName, role } = pickLeadershipContact(enriched.leadership);
  const email = emailOverride || "";

  const verticalList = enriched.verticals?.length
    ? enriched.verticals
    : deriveVertical(enriched)
        .split(/,\s*/)
        .filter(Boolean);
  const brief = { ...PERMISSIVE_BRIEF, selectedVerticals: verticalList };
  const { thesisScore } = scoreThesis(enriched, brief);
  const quality = deriveQualityTier(thesisScore);

  return {
    website: enriched.website || (enriched.domain ? `https://${enriched.domain}` : ""),
    vertical: deriveVertical(enriched),
    country: enriched.country || "US",
    yearFounded: enriched.foundedYear ?? "",
    employee: enriched.employees || enriched.employeesText || "",
    estRevenue: enriched.revenue || "",
    overview: enriched.description || "",
    ownership: mapOwnershipToSpreadsheet(ownershipResult.ownership_class, enriched.founderStillOperating),
    contactName,
    role,
    email,
    quality,
  };
}

function applyEnrichedToRow(row, fields) {
  const out = { ...row };
  setRowValue(out, row, ["website"], fields.website);
  setRowValue(out, row, ["vertical"], fields.vertical);
  setRowValue(out, row, ["country"], fields.country);
  setRowValue(out, row, ["year founded"], fields.yearFounded);
  setRowValue(out, row, ["employee", "employees", "employee "], fields.employee);
  setRowValue(out, row, ["est. revenue", "est revenue"], fields.estRevenue);
  setRowValue(out, row, ["overview"], fields.overview);
  setRowValue(out, row, ["ownership"], fields.ownership);
  setRowValue(out, row, ["contact name"], fields.contactName);
  setRowValue(out, row, ["role"], fields.role);
  setRowValue(out, row, ["email"], fields.email);
  setRowValue(out, row, ["quality"], fields.quality);
  return out;
}

function isRuleOverviewWeak(overview) {
  const v = String(overview ?? "").trim();
  return !v || isJunkOverviewText(v);
}

function isRuleVerticalWeak(vertical) {
  return !String(vertical ?? "").trim();
}

function isRuleOwnershipWeak(ownership) {
  const v = String(ownership ?? "").trim();
  return !v || v === "Unknown";
}

function inputCellBlank(row, aliases) {
  return !getRowValue(row, aliases);
}

function isRuleContactWeak(contactName) {
  const v = String(contactName ?? "").trim();
  return !v || !looksLikePersonName(v);
}

function isRuleEmployeeWeak(employee) {
  return !String(employee ?? "").trim();
}

function isRuleYearFoundedWeak(yearFounded) {
  return !String(yearFounded ?? "").trim();
}

function isRuleEstRevenueWeak(estRevenue) {
  return !String(estRevenue ?? "").trim();
}

/** @returns {("overview"|"vertical"|"ownership"|"employee"|"yearFounded"|"estRevenue"|"contactName")[]} */
export function detectEnrichListFieldsNeeded(inputRow, ruleFields, fillBlanksOnly = true) {
  const needed = [];
  const checks = [
    {
      key: "overview",
      aliases: ["overview"],
      weak: () => isRuleOverviewWeak(ruleFields.overview),
    },
    {
      key: "vertical",
      aliases: ["vertical"],
      weak: () => isRuleVerticalWeak(ruleFields.vertical),
    },
    {
      key: "ownership",
      aliases: ["ownership"],
      weak: () => isRuleOwnershipWeak(ruleFields.ownership),
    },
    {
      key: "employee",
      aliases: ["employee", "employees", "employee "],
      weak: () => isRuleEmployeeWeak(ruleFields.employee),
    },
    {
      key: "yearFounded",
      aliases: ["year founded"],
      weak: () => isRuleYearFoundedWeak(ruleFields.yearFounded),
    },
    {
      key: "estRevenue",
      aliases: ["est. revenue", "est revenue"],
      weak: () => isRuleEstRevenueWeak(ruleFields.estRevenue),
    },
    {
      key: "contactName",
      aliases: ["contact name"],
      weak: () => isRuleContactWeak(ruleFields.contactName),
    },
  ];

  for (const { key, aliases, weak } of checks) {
    if (!weak()) continue;
    if (fillBlanksOnly && !inputCellBlank(inputRow, aliases)) continue;
    needed.push(key);
  }
  return needed;
}

export function mergeOllamaEnrichFields(ruleFields, ollamaResult, fieldsNeeded) {
  const out = { ...ruleFields };
  if (!ollamaResult || !fieldsNeeded?.length) return out;

  if (fieldsNeeded.includes("overview") && ollamaResult.overview) {
    out.overview = ollamaResult.overview;
  }
  if (fieldsNeeded.includes("vertical") && ollamaResult.vertical) {
    out.vertical = ollamaResult.vertical;
  }
  if (fieldsNeeded.includes("ownership") && ollamaResult.ownership) {
    out.ownership = ollamaResult.ownership;
  }
  if (fieldsNeeded.includes("employee") && ollamaResult.employees) {
    out.employee = ollamaResult.employees;
  }
  if (fieldsNeeded.includes("yearFounded") && ollamaResult.foundedYear) {
    out.yearFounded = ollamaResult.foundedYear;
  }
  if (fieldsNeeded.includes("estRevenue") && ollamaResult.revenue) {
    out.estRevenue = ollamaResult.revenue;
  }
  if (fieldsNeeded.includes("contactName") && ollamaResult.contactName) {
    out.contactName = ollamaResult.contactName;
    if (ollamaResult.role) out.role = ollamaResult.role;
  }
  return out;
}

function ruleFieldsFromSpreadsheetFields(fields) {
  return {
    website: fields.website || "",
    overview: fields.overview || "",
    vertical: fields.vertical || "",
    ownership: fields.ownership || "",
    employee: fields.employee || "",
    yearFounded: fields.yearFounded ?? "",
    estRevenue: fields.estRevenue || "",
    contactName: fields.contactName || "",
    role: fields.role || "",
  };
}

async function maybeApplyOllamaGapFill(row, fields, enrichedContext, name, env, options = {}) {
  if (!options.useOllama) return fields;

  const ruleFields = ruleFieldsFromSpreadsheetFields(fields);
  const fieldsNeeded = detectEnrichListFieldsNeeded(row, ruleFields, options.fillBlanksOnly !== false);
  if (!fieldsNeeded.length) return fields;

  const homepageText = buildEnrichContextText(enrichedContext, fields);

  const filler = ollamaEnrichListGapFill(env);
  const result = await filler.fill({
    companyName: name,
    website: fields.website,
    homepageText,
    ruleFields,
    fieldsNeeded,
  });

  return mergeOllamaEnrichFields(fields, result, fieldsNeeded);
}

export async function enrichRowByName(row, env, fetchOpts = {}, options = {}) {
  const companyKey = detectCompanyColumn(row);
  const name = String(row[companyKey] ?? "").trim();
  if (!name) {
    throw new Error("Missing company name");
  }

  let website = getRowValue(row, ["website"]);
  const hadWebsiteInRow = !!(website && looksLikeUrl(website));
  if (website && !looksLikeUrl(website)) {
    website = "";
  }
  if (!website) {
    const resolved = await resolveDomainForName(name, env);
    if (!resolved?.website) {
      throw new Error(`Could not resolve website for "${name}"`);
    }
    website = resolved.website;
  }

  if (!website.startsWith("http")) {
    website = `https://${website.replace(/^\/\//, "")}`;
  }

  if (!hadWebsiteInRow) {
    website = normalizeToSiteRoot(website);
  }

  const candidate = {
    name,
    website,
    sourceTag: "EnrichList",
    sourceTags: ["EnrichList"],
  };

  const enrichEnv = { ...env, PRESCORE_THRESHOLD: "0" };

  let enriched = null;
  const stageA = await enrichCandidateStageA(
    candidate,
    PERMISSIVE_BRIEF,
    enrichEnv,
    fetchOpts,
    { skipFilter: true },
  );

  if (stageA) {
    enriched = await enrichCandidateStageB(candidate, stageA, PERMISSIVE_BRIEF, enrichEnv, fetchOpts);
  }

  const baseUrl = enriched?.website || website;
  const domain = normalizeDomain(baseUrl);
  const facts = await searchCompanyFacts(name, domain, env);

  if (enriched) {
    enriched = mergeEnrichedWithFacts(enriched, facts);
    const { contactName } = pickLeadershipContact(enriched.leadership);
    const email = await extractEmailFromSite(baseUrl, fetchOpts, contactName);
    let fields = buildSpreadsheetFields(enriched, email);
    fields = await maybeApplyOllamaGapFill(row, fields, enriched, name, env, options);
    const out = applyEnrichedToRow(row, fields);
    if (options.returnContext) return { row: out, context: enriched };
    return out;
  }

  let minimal = await minimalEnrichFromWebsite(name, baseUrl, fetchOpts);
  minimal = mergeEnrichedWithFacts(minimal, facts);
  const { contactName } = pickLeadershipContact(minimal.leadership);
  const email = await extractEmailFromSite(baseUrl, fetchOpts, contactName);
  let fields = buildSpreadsheetFields(minimal, email);
  fields = await maybeApplyOllamaGapFill(row, fields, minimal, name, env, options);
  const out = applyEnrichedToRow(row, fields);
  if (options.returnContext) return { row: out, context: minimal };
  return out;
}

export async function runEnrichListJob(rows, env, emit, options = {}, deps = {}) {
  const enrichFn = deps.enrichRowByName ?? enrichRowByName;
  const gapFillFactory = deps.ollamaEnrichListGapFill ?? ollamaEnrichListGapFill;
  const fetchCache = new Map();
  const jitterHostState = new Map();
  const fetchOpts = { cache: fetchCache, jitterHostState };

  const useOllama = !!options.useOllama;
  const rulesOptions = { ...options, useOllama: false, returnContext: true };

  const total = rows.length;
  const ollamaTotal = useOllama ? total * 2 : total;
  let processed = 0;

  emit({ type: "progress", processed: 0, total: ollamaTotal });

  const ruleResults = new Array(total);
  const enrichedContexts = new Array(total);

  const rulesQueue = new PQueue({ concurrency: 5 });

  for (let index = 0; index < total; index++) {
    const row = rows[index];
    rulesQueue.add(async () => {
      try {
        const enrichResult = await enrichFn(row, env, fetchOpts, rulesOptions);
        const enrichedRow = enrichResult?.row ?? enrichResult;
        const context = enrichResult?.context ?? null;
        ruleResults[index] = { status: "ok", enriched: enrichedRow };
        enrichedContexts[index] = context;
        emit({ type: "row", index, status: "ok", input: row, enriched: enrichedRow });
      } catch (e) {
        ruleResults[index] = { status: "error", enriched: row };
        emit({
          type: "row",
          index,
          status: "error",
          input: row,
          enriched: row,
          message: e.message || String(e),
        });
      } finally {
        processed += 1;
        emit({ type: "progress", processed, total: ollamaTotal });
      }
    });
  }

  await rulesQueue.onIdle();

  if (useOllama) {
    emit({ type: "log", message: "Starting Ollama gap-fill pass…" });
    const ollamaQueue = new PQueue({ concurrency: 1 });

    for (let index = 0; index < total; index++) {
      const row = rows[index];
      const result = ruleResults[index];
      if (!result || result.status !== "ok") {
        processed += 1;
        emit({ type: "progress", processed, total: ollamaTotal });
        continue;
      }

      ollamaQueue.add(async () => {
        try {
          const spreadsheetFields = {
            website: getRowValue(result.enriched, ["website"]) || "",
            overview: getRowValue(result.enriched, ["overview"]) || "",
            vertical: getRowValue(result.enriched, ["vertical"]) || "",
            ownership: getRowValue(result.enriched, ["ownership"]) || "",
            employee: getRowValue(result.enriched, ["employee", "employees", "employee "]) || "",
            yearFounded: getRowValue(result.enriched, ["year founded"]) || "",
            estRevenue: getRowValue(result.enriched, ["est. revenue", "est revenue"]) || "",
            contactName: getRowValue(result.enriched, ["contact name"]) || "",
            role: getRowValue(result.enriched, ["role"]) || "",
          };
          const ruleFields = ruleFieldsFromSpreadsheetFields(spreadsheetFields);

          const fieldsNeeded = detectEnrichListFieldsNeeded(row, ruleFields, options.fillBlanksOnly !== false);
          if (!fieldsNeeded.length) {
            return;
          }

          const homepageText = buildEnrichContextText(enrichedContexts[index], spreadsheetFields);

          const filler = gapFillFactory(env);
          const ollamaResult = await filler.fill({
            companyName: String(row[detectCompanyColumn(row)] ?? "").trim(),
            website: ruleFields.website,
            homepageText,
            ruleFields,
            fieldsNeeded,
          });

          if (ollamaResult) {
            const merged = mergeOllamaEnrichFields(spreadsheetFields, ollamaResult, fieldsNeeded);
            const updated = { ...result.enriched };
            if (fieldsNeeded.includes("overview") && merged.overview) {
              setRowValue(updated, row, ["overview"], merged.overview);
            }
            if (fieldsNeeded.includes("vertical") && merged.vertical) {
              setRowValue(updated, row, ["vertical"], merged.vertical);
            }
            if (fieldsNeeded.includes("ownership") && merged.ownership) {
              setRowValue(updated, row, ["ownership"], merged.ownership);
            }
            if (fieldsNeeded.includes("employee") && merged.employee) {
              setRowValue(updated, row, ["employee", "employees", "employee "], merged.employee);
            }
            if (fieldsNeeded.includes("yearFounded") && merged.yearFounded) {
              setRowValue(updated, row, ["year founded"], merged.yearFounded);
            }
            if (fieldsNeeded.includes("estRevenue") && merged.estRevenue) {
              setRowValue(updated, row, ["est. revenue", "est revenue"], merged.estRevenue);
            }
            if (fieldsNeeded.includes("contactName") && merged.contactName) {
              setRowValue(updated, row, ["contact name"], merged.contactName);
              if (merged.role) setRowValue(updated, row, ["role"], merged.role);
            }
            ruleResults[index].enriched = updated;
            emit({ type: "row", index, status: "ok", input: row, enriched: updated });
          }
        } catch (e) {
          console.warn(`[ollama-gap-fill] row ${index} error: ${e.message || e}`);
        } finally {
          processed += 1;
          emit({ type: "progress", processed, total: ollamaTotal });
        }
      });
    }

    await ollamaQueue.onIdle();
  }

  fetchCache.clear();
  emit({ type: "done", total: ollamaTotal, processed });
}
// #endregion
