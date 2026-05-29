import { getCached, putCached } from "./dbCache.js";
import { searchWebQuery } from "./webSearch.js";
import {
  extractHeadcountFromText,
  extractFoundedYearFromText,
  extractRevenueFromText,
  formatEmployeeBandFromCount,
} from "./companyTextExtract.js";
import { extractLeadershipFromText } from "./leadershipExtract.js";

const FACT_SEARCH_TTL_DAYS = 7;

/** @param {Array<{ url?: string, title?: string, snippet?: string }>} results */
function resultsToCorpus(results) {
  return results
    .map((r) => [r.title, r.snippet].filter(Boolean).join(" — "))
    .filter(Boolean)
    .join("\n");
}

/** @param {string} text */
function extractLeadershipFromSnippets(text) {
  const fromRegex = extractLeadershipFromText(text);
  const extra = [];
  const titleRe =
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:is\s+)?(?:the\s+)?(?:a\s+)?(?:CEO|Chief Executive Officer|Founder|President|Managing Director|Owner)(?:\s+of|\s+at|\s*,|\s*\.|$)/gi;
  let m;
  while ((m = titleRe.exec(text)) !== null && extra.length < 6) {
    extra.push({ name: m[1].trim(), title: "CEO" });
  }
  return [...fromRegex, ...extra];
}

/** @param {Array<{ url?: string }>} results */
function pickLinkedInUrl(results) {
  for (const r of results) {
    const u = String(r.url || "");
    if (/linkedin\.com\/company\//i.test(u)) return u.split("?")[0];
  }
  return null;
}

/**
 * @param {string} name
 * @param {string} domain
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<{
 *   employees: string|null,
 *   foundedYear: number|null,
 *   revenue: string|null,
 *   leadershipCandidates: Array<{name:string,title:string}>,
 *   linkedinUrl: string|null,
 *   snippetCorpus: string
 * }>}
 */
export async function searchCompanyFacts(name, domain, env) {
  const trimmed = String(name || "").trim();
  const empty = {
    employees: null,
    foundedYear: null,
    revenue: null,
    leadershipCandidates: [],
    linkedinUrl: null,
    snippetCorpus: "",
  };
  if (!trimmed) return empty;

  const cacheKey = `fact-search:${domain || trimmed.toLowerCase()}`;
  const cached = getCached(cacheKey, FACT_SEARCH_TTL_DAYS);
  if (cached?.ok && cached.payload) return cached.payload;

  const queries = [
    `"${trimmed}" employees OR headcount OR "team of"`,
    `"${trimmed}" founded OR established OR "since"`,
    `"${trimmed}" revenue OR "annual sales" OR turnover`,
    `"${trimmed}" CEO OR founder OR owner OR president`,
    domain ? `site:linkedin.com/company "${trimmed}"` : `"${trimmed}" site:linkedin.com/company`,
  ];

  /** @type {Array<{ url?: string, title?: string, snippet?: string }>} */
  const allResults = [];
  for (const q of queries) {
    try {
      const results = await searchWebQuery(q, env);
      allResults.push(...results);
    } catch {
      /* ignore */
    }
  }

  const snippetCorpus = resultsToCorpus(allResults);
  if (!snippetCorpus) {
    putCached(cacheKey, "fact-search", false, empty);
    return empty;
  }

  const headcount = extractHeadcountFromText(snippetCorpus);
  const foundedYear = extractFoundedYearFromText(snippetCorpus);
  const revenue = extractRevenueFromText(snippetCorpus);
  const leadershipCandidates = extractLeadershipFromSnippets(snippetCorpus);
  const linkedinUrl = pickLinkedInUrl(allResults);

  const payload = {
    employees: headcount ? formatEmployeeBandFromCount(headcount) : null,
    foundedYear,
    revenue,
    leadershipCandidates,
    linkedinUrl,
    snippetCorpus: snippetCorpus.slice(0, 8000),
  };

  const hasData =
    !!payload.employees ||
    !!payload.foundedYear ||
    !!payload.revenue ||
    payload.leadershipCandidates.length > 0 ||
    !!payload.linkedinUrl;

  putCached(cacheKey, "fact-search", hasData, payload);
  return payload;
}

export { extractRevenueFromText };
