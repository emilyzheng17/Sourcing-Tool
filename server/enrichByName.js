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

async function searchSerperQuery(query, env) {
  const key = env.SERPER_API_KEY;
  if (!key) return [];
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": key },
    body: JSON.stringify({ q: query, num: 8 }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.organic || []).map((r) => ({ url: r.link, title: r.title, snippet: r.snippet }));
}

async function searchTavilyQuery(query, env) {
  const key = env.TAVILY_API_KEY;
  if (!key) return [];
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).map((r) => ({ url: r.url, title: r.title, snippet: r.content }));
}

async function searchBraveQuery(query, env) {
  const key = env.BRAVE_API_KEY;
  if (!key) return [];
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.web?.results || data.results || []).map((r) => ({
    url: r.url || r.link,
    title: r.title,
    snippet: r.description,
  }));
}

export async function resolveDomainForName(name, env) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;

  const cacheKey = `domain-lookup:${trimmed.toLowerCase()}`;
  const cached = getCached(cacheKey, DOMAIN_LOOKUP_TTL_DAYS);
  if (cached?.ok && cached.payload) return cached.payload;

  const query = `"${trimmed}" official site`;
  const providers = [
    () => searchSerperQuery(query, env),
    () => searchTavilyQuery(query, env),
    () => searchBraveQuery(query, env),
  ];

  for (const provider of providers) {
    try {
      const results = await provider();
      const picked = pickBestResult(results, trimmed);
      if (picked) {
        const payload = { website: picked.website, domain: picked.domain };
        putCached(cacheKey, "domain-lookup", true, payload);
        return payload;
      }
    } catch {
      /* try next provider */
    }
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

async function extractEmailFromSite(base, fetchOpts = {}) {
  const urls = [base, joinUrl(base, "/contact")];
  const emails = new Set();

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
        if (/example\.com|sentry\.io|wixpress|cloudflare|schema\.org/i.test(lower)) continue;
        emails.add(lower);
      }
    } catch {
      /* ignore */
    }
  }

  return [...emails].slice(0, 3).join("\r\n");
}

function pickLeadershipContact(leadership) {
  if (!Array.isArray(leadership) || !leadership.length) {
    return { contactName: "", role: "" };
  }
  const priority = /ceo|founder|president|chief executive/i;
  const pick = leadership.find((l) => priority.test(l.title || "")) || leadership[0];
  return { contactName: pick.name || "", role: pick.title || "" };
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

  const leadership = [];
  const re =
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*[,|\-–]?\s*(Chief Executive Officer|CEO|CTO|CFO|COO|Founder|President|VP)/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(homepageText)) !== null && leadership.length < 8) {
    const contactName = m[1]?.trim();
    const role = m[2]?.trim();
    if (!contactName || contactName.length < 3) continue;
    const k = `${contactName}|${role}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    leadership.push({ name: contactName, title: role });
  }

  const email = await extractEmailFromSite(base, fetchOpts);
  const { contactName, role } = pickLeadershipContact(leadership);
  const domain = normalizeDomain(base);

  const fitCorpus = sanitizeCorpus(homepageText);
  const verticals = pickEnrichListVerticals(name, fitCorpus, "");
  const vertical = verticals.join(", ");

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
    foundedYear: null,
    country: "US",
    employees: null,
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

/** @returns {("overview"|"vertical"|"ownership")[]} */
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
  return out;
}

async function maybeApplyOllamaGapFill(row, fields, enrichedContext, name, env, options = {}) {
  if (!options.useOllama) return fields;

  const fieldsNeeded = detectEnrichListFieldsNeeded(row, fields, options.fillBlanksOnly !== false);
  if (!fieldsNeeded.length) return fields;

  const homepageText = [
    enrichedContext?.homepageTextSample,
    enrichedContext?.braveSnippet,
    enrichedContext?.description,
  ]
    .filter(Boolean)
    .join("\n");

  const filler = ollamaEnrichListGapFill(env);
  const result = await filler.fill({
    companyName: name,
    website: fields.website,
    homepageText,
    ruleFields: {
      overview: fields.overview,
      vertical: fields.vertical,
      ownership: fields.ownership,
    },
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

  let email = "";
  const baseUrl = enriched?.website || website;

  if (enriched) {
    email = await extractEmailFromSite(baseUrl, fetchOpts);
    let fields = buildSpreadsheetFields(enriched, email);
    fields = await maybeApplyOllamaGapFill(row, fields, enriched, name, env, options);
    return applyEnrichedToRow(row, fields);
  }

  const minimal = await minimalEnrichFromWebsite(name, baseUrl, fetchOpts);
  let fields = {
    website: minimal.website,
    vertical: minimal.vertical,
    country: minimal.country,
    yearFounded: minimal.foundedYear ?? "",
    employee: minimal.employees || "",
    estRevenue: minimal.revenue || "",
    overview: minimal.description || "",
    ownership: minimal.ownership,
    contactName: minimal.contactName,
    role: minimal.role,
    email: minimal.email,
  };
  fields = await maybeApplyOllamaGapFill(row, fields, minimal, name, env, options);
  return applyEnrichedToRow(row, fields);
}

export async function runEnrichListJob(rows, env, emit, options = {}) {
  const fetchCache = new Map();
  const jitterHostState = new Map();
  const fetchOpts = { cache: fetchCache, jitterHostState };

  const concurrency = options.useOllama ? 2 : 5;
  const queue = new PQueue({ concurrency });
  let processed = 0;
  const total = rows.length;

  emit({ type: "progress", processed: 0, total });

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    queue.add(async () => {
      try {
        const enriched = await enrichRowByName(row, env, fetchOpts, options);
        emit({ type: "row", index, status: "ok", input: row, enriched });
      } catch (e) {
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
        emit({ type: "progress", processed, total });
      }
    });
  }

  await queue.onIdle();
  fetchCache.clear();
  emit({ type: "done", total, processed });
}
// #endregion
