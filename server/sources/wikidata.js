import crypto from "node:crypto";
import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { getCached, putCached } from "../lib/dbCache.js";

const WIKIDATA_CACHE_TTL_DAYS = 14;
const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "SourcingTool/1.0 (https://github.com/sourcing-tool; research) keyless-discovery";

/**
 * Serial-acquirer / holdco names resolved against Wikidata via EntitySearch (top-1).
 * Names that don't resolve are silently skipped — the SPARQL block degrades gracefully.
 * Kept exported for tests and overnight crawlers that want the master list.
 */
export const ACQUIRER_PARENT_NAMES = [
  // Constellation Software universe (parents + operating groups)
  "Constellation Software",
  "Topicus.com",
  "Lumine Group",
  "Vela Software",
  "Volaris Group",
  "Harris Computer Systems",
  "Jonas Software",
  "Modaxo",
  "Vencora",
  "Perseus Operating Group",
  "Vela Software Group",
  // Valsoft universe
  "Valsoft Corporation",
  "Aspire Software",
  // Other major serial acquirers
  "Banyan Software",
  "Vitec Software Group",
  "Visma",
  "Enghouse Systems",
  "Addnode Group",
  "Roper Technologies",
  "Total Specific Solutions",
  "Trimble Inc.",
  "Sage Group",
  "Jack Henry & Associates",
  "Everfield",
  "Hawk Infinity Software",
  "Tyler Technologies",
  "Sylogist",
  "Asseco",
  "Esker",
  "Cegid",
  "Kerridge Commercial Systems",
  "Insight Enterprises",
  "N. Harris Computer Corporation",
  "ESW Capital",
  "Riverside Company",
  "Battery Ventures",
  "Thoma Bravo",
];

function sparqlSubsidiaries() {
  const values = ACQUIRER_PARENT_NAMES.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(" ");
  return `SELECT DISTINCT ?company ?companyLabel ?website ?parent ?parentLabel WHERE {
  VALUES ?parentName { ${values} }
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:api "EntitySearch" .
    bd:serviceParam wikibase:endpoint "www.wikidata.org" .
    bd:serviceParam mwapi:search ?parentName .
    bd:serviceParam mwapi:language "en" .
    bd:serviceParam mwapi:limit "1" .
    ?parent wikibase:apiOutputItem mwapi:item .
  }
  ?parent wdt:P31/wdt:P279* wd:Q4830453 .
  { ?company wdt:P749 ?parent. } UNION { ?company wdt:P127 ?parent. } UNION { ?company wdt:P361 ?parent. }
  ?company wdt:P856 ?website .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 800`;
}

function sparqlSoftwareByKeyword(keyword) {
  const safe = String(keyword).slice(0, 80).replace(/"/g, '\\"');
  return `SELECT DISTINCT ?company ?companyLabel ?website ?description WHERE {
  SERVICE wikibase:mwapi {
    bd:serviceParam wikibase:api "EntitySearch" .
    bd:serviceParam wikibase:endpoint "www.wikidata.org" .
    bd:serviceParam mwapi:search "${safe} software" .
    bd:serviceParam mwapi:language "en" .
    bd:serviceParam mwapi:limit "20" .
    ?company wikibase:apiOutputItem mwapi:item .
  }
  ?company wdt:P31/wdt:P279* wd:Q4830453 ;
           wdt:P856 ?website .
  OPTIONAL { ?company schema:description ?description . FILTER(LANG(?description) = "en") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 60`;
}

function queryHash(q) {
  return crypto.createHash("sha1").update(q).digest("hex").slice(0, 20);
}

async function runSparql(query) {
  const cacheKey = `wikidata:${queryHash(query)}`;
  const cached = getCached(cacheKey, WIKIDATA_CACHE_TTL_DAYS);
  if (cached && cached.ok) return cached.payload || { results: { bindings: [] } };
  if (cached) return null;

  try {
    const params = new URLSearchParams({ query, format: "json" });
    const res = await fetch(`${WIKIDATA_ENDPOINT}?${params}`, {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": USER_AGENT,
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      putCached(cacheKey, "wikidata", false, null);
      return null;
    }
    const json = await res.json();
    putCached(cacheKey, "wikidata", true, json);
    return json;
  } catch {
    putCached(cacheKey, "wikidata", false, null);
    return null;
  }
}

/** Map a SPARQL JSON binding row into a discovery candidate (or null to skip). */
function bindingToCandidate(b, ctx) {
  const url = b.website?.value;
  if (!url) return null;
  const domain = normalizeDomain(url);
  if (!domain || !isLikelyCompanyDomain(domain)) return null;
  const parent = b.parentLabel?.value || ctx.parent;
  const description = b.description?.value;
  return {
    name: b.companyLabel?.value || domain.split(".")[0],
    website: url.split("?")[0],
    sourceTag: parent ? `Wikidata:${parent}` : "Wikidata",
    rawMetadata: {
      ...(parent ? { parent } : {}),
      ...(description ? { description } : {}),
      ...(ctx.keyword ? { wikidataKeyword: ctx.keyword } : {}),
      ...(b.company?.value ? { wikidataItem: b.company.value } : {}),
    },
  };
}

/** Fixture helper — parse Wikidata SPARQL JSON results into discovery candidates. */
export function testParseWikidataResults(json, ctx = {}) {
  const bindings = json?.results?.bindings || [];
  const seen = new Set();
  const out = [];
  for (const b of bindings) {
    const cand = bindingToCandidate(b, ctx);
    if (!cand) continue;
    const d = normalizeDomain(cand.website);
    if (seen.has(d)) continue;
    seen.add(d);
    out.push(cand);
  }
  return out;
}

/**
 * Wikidata SPARQL discovery — keyless. Two queries:
 *   A) Subsidiaries / owned-by / part-of of known serial-software acquirers.
 *   B) Companies whose Wikidata search hits "<keyword> software" and that have an official website.
 *
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} _env
 */
export async function searchWikidata(brief, _env) {
  const m = breadthMultiplier(brief);
  const maxResults = Math.min(800, 250 * m);
  const all = [];

  const subsJson = await runSparql(sparqlSubsidiaries());
  if (subsJson) all.push(...testParseWikidataResults(subsJson, {}));

  const keywords = collectKeywords(brief).slice(0, Math.min(12, 3 + 2 * m));
  for (const kw of keywords) {
    const json = await runSparql(sparqlSoftwareByKeyword(kw));
    if (json) all.push(...testParseWikidataResults(json, { keyword: kw }));
  }

  return dedupeDomain(all).slice(0, maxResults);
}

function collectKeywords(brief) {
  const out = [];
  const verts = Array.isArray(brief?.selectedVerticals) ? brief.selectedVerticals : [];
  const products = Array.isArray(brief?.selectedProducts) ? brief.selectedProducts : [];
  const ap = brief?.activeProduct;
  for (const v of verts) {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  }
  for (const p of products) {
    if (typeof p === "string" && p.trim()) out.push(p.trim());
  }
  if (typeof ap === "string" && ap.trim()) out.push(ap.trim());
  const seen = new Set();
  return out.filter((s) => {
    const k = s.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function dedupeDomain(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    const d = normalizeDomain(x.website);
    if (!d || seen.has(d)) return false;
    seen.add(d);
    return true;
  });
}
