/**
 * Ollama-powered discovery query generation (replaces broad template-only queries).
 *
 * Local Ollama inference is free, so we lean on it for a large, long-tail
 * query matrix (vertical × product × geography × ownership hint). The cap
 * is env-configurable via OLLAMA_QUERY_GEN_MAX / OLLAMA_QUERY_GEN_EXA_MAX.
 */

import { normalizeOllamaBase, ollamaChatOrGenerate } from "./ollamaHttp.js";
import { DEFAULT_ALLOWED_COUNTRY_CODES } from "../../shared/geoCountry.js";

const DEFAULT_SEARCH_QUERY_CAP = 80;
const DEFAULT_EXA_QUERY_CAP = 6;

function envInt(value, fallback) {
  const n = parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseJsonFromText(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

function isQueryGenEnabled(env) {
  if (!normalizeOllamaBase(env.OLLAMA_URL)) return false;
  const off = String(env.OLLAMA_QUERY_GEN || "1").toLowerCase();
  return !["0", "false", "no", "off"].includes(off);
}

const COUNTRY_NAMES = {
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  IE: "Ireland",
  AU: "Australia",
  NZ: "New Zealand",
  NL: "Netherlands",
  NO: "Norway",
  SE: "Sweden",
  DK: "Denmark",
  FI: "Finland",
  IS: "Iceland",
  DE: "Germany",
  CH: "Switzerland",
  FR: "France",
  SG: "Singapore",
  IL: "Israel",
  EE: "Estonia",
  JP: "Japan",
  KR: "South Korea",
  PT: "Portugal",
  PL: "Poland",
};

function geographyHint(brief) {
  const codes =
    Array.isArray(brief.allowedCountries) && brief.allowedCountries.length
      ? brief.allowedCountries
      : DEFAULT_ALLOWED_COUNTRY_CODES;
  return codes
    .slice(0, 8)
    .map((c) => COUNTRY_NAMES[c] || c)
    .join(", ");
}

function buildPrompt(brief, searchCap, exaCap) {
  const verticals = Array.isArray(brief.selectedVerticals) ? brief.selectedVerticals : [];
  const products = Array.isArray(brief.selectedProducts)
    ? brief.selectedProducts
    : brief.activeProduct
      ? [brief.activeProduct]
      : [];
  const tags = Array.isArray(brief.selectedTags) ? brief.selectedTags.slice(0, 12) : [];
  const geos = geographyHint(brief);

  return `You help discover B2B vertical/industrial software companies for a PE sourcing thesis modelled on Valsoft / Constellation Software.

IDEAL TARGET PROFILE:
- Founder-owned or operated, or vintage (pre-2017) PE-backed.
- Mission-critical vertical/industrial software vendor (system of record for a specific industry niche).
- Small: 15-100 employees, $2M-$10M revenue, proprietary stack (not OSS-driven, not consulting).
- NOT agencies, NOT public SaaS giants, NOT consultancies, NOT marketplaces.

CONTEXT:
- Verticals: ${verticals.length ? verticals.join("; ") : "industrial / vertical B2B"}
- Products/categories: ${products.length ? products.join("; ") : brief.activeProduct || "B2B software"}
- Tags: ${tags.length ? tags.join(", ") : "none"}
- Geographies of interest: ${geos}

Return ONLY valid JSON, no markdown, no commentary:
{"searchQueries":string[],"exaQueries":string[]}

RULES for searchQueries (target ${searchCap} queries, minimum 40):
- Generate a long-tail matrix: vertical × product × geography × ownership/size hint.
- Mix niche industry jargon ("rendering plant ERP", "metal scrap weighbridge software", "lumber yard quoting") with generic ("ERP for X").
- Include ownership hints in some queries: "bootstrapped", "founder-led", "family-owned", "privately held", "Inc 5000".
- Include geo qualifiers in some queries: city / region / country names from the geographies list.
- Include site: queries for niche directories: site:g2.com, site:capterra.com, site:trustradius.com, site:sourceforge.net, site:saashub.com, site:crunchbase.com.
- Include trade-show / association tells: "exhibitor list <vertical> software", "<industry trade show> vendors".
- Include hiring tells: site:linkedin.com/jobs "<vertical> software" small company, site:greenhouse.io "<product>", site:lever.co "<product>".
- AVOID generic noise like "best software companies" or "top SaaS 2024".
- Each query 4-12 words.

RULES for exaQueries (target ${exaCap}, max ${exaCap}):
- Short natural-language semantic phrases for neural search.
- Each focuses on mission-critical operations / system-of-record software in one of the verticals.
- Vary phrasing (e.g. "specialized software for X operators", "system of record used by X plants").`;
}

/**
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {(e: object) => void} [emit]
 * @returns {Promise<{ searchQueries: string[], exaQueries: string[], source: string } | null>}
 */
export async function generateDiscoveryQueries(brief, env, emit = () => {}) {
  if (!isQueryGenEnabled(env)) return null;

  const existingBrave = brief.additionalSearchQueries?.length;
  const existingExa = brief.recommendationExaQueries?.length;
  if (existingBrave && existingExa) {
    return {
      searchQueries: brief.additionalSearchQueries,
      exaQueries: brief.recommendationExaQueries,
      source: "brief",
    };
  }

  const base = normalizeOllamaBase(env.OLLAMA_URL);
  const model = env.OLLAMA_MODEL || "llama3.2";
  const searchCap = envInt(env.OLLAMA_QUERY_GEN_MAX, DEFAULT_SEARCH_QUERY_CAP);
  const exaCap = envInt(env.OLLAMA_QUERY_GEN_EXA_MAX, DEFAULT_EXA_QUERY_CAP);

  try {
    emit({
      type: "log",
      message: `[ollama] Generating discovery queries (model=${model}, cap=${searchCap}/${exaCap})…`,
    });
    const text = await ollamaChatOrGenerate(base, model, buildPrompt(brief, searchCap, exaCap));
    const j = parseJsonFromText(text) || {};
    const searchQueries = (Array.isArray(j.searchQueries) ? j.searchQueries : [])
      .map((q) => String(q).trim())
      .filter((q) => q.length >= 8)
      .slice(0, searchCap);
    const exaQueries = (Array.isArray(j.exaQueries) ? j.exaQueries : [])
      .map((q) => String(q).trim())
      .filter((q) => q.length >= 8)
      .slice(0, exaCap);

    if (!searchQueries.length && !exaQueries.length) {
      emit({ type: "log", message: "[ollama] Query generation returned no queries; using templates only." });
      return null;
    }

    emit({
      type: "log",
      message: `[ollama] Discovery queries: ${searchQueries.length} search, ${exaQueries.length} Exa`,
    });
    return { searchQueries, exaQueries, source: "ollama" };
  } catch (e) {
    emit({ type: "log", message: `[ollama] Query generation failed: ${e.message || String(e)}` });
    return null;
  }
}
