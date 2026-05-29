import { normalizeOllamaBase, ollamaChatOrGenerate } from "../lib/ollamaHttp.js";
import { getCached, putCached } from "../lib/dbCache.js";
import { normalizeDomain } from "../lib/domains.js";
import { isJunkOverviewText } from "../lib/visiblePageText.js";
import { KNOWN_VERTICALS } from "../lib/portfolioProductNames.js";
import {
  isValidEmployeeBand,
  isValidRevenueString,
  looksLikePersonName,
} from "../lib/companyTextExtract.js";

const CACHE_TTL_DAYS = 7;
const MIN_CONFIDENCE = 0.35;
const MIN_REVENUE_ESTIMATE_CONFIDENCE = 0.25;

export const ALLOWED_OWNERSHIP_VALUES = new Set([
  "Unknown",
  "FOFO",
  "VC-Backed",
  "PE-Owned",
  "Founder Owned",
  "Public",
]);

function parseJsonFromText(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/**
 * Validate and normalize raw Ollama JSON for enrich-list gap fill.
 * @param {object} raw
 * @param {string[]} [fieldsNeeded]
 * @returns {object | null}
 */
export function validateOllamaEnrichResult(raw, fieldsNeeded = []) {
  if (!raw || typeof raw !== "object") return null;

  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0.4;
  if (confidence < MIN_CONFIDENCE) return null;

  let overview = String(raw.overview || "").trim();
  if (overview && isJunkOverviewText(overview)) overview = "";

  let vertical = String(raw.vertical || "").trim();
  if (vertical && !KNOWN_VERTICALS.includes(vertical)) vertical = "";

  let ownership = String(raw.ownership || "").trim();
  if (ownership && !ALLOWED_OWNERSHIP_VALUES.has(ownership)) ownership = "";

  let employees = String(raw.employees || raw.employee || "").trim();
  if (employees && !isValidEmployeeBand(employees)) employees = "";

  let foundedYear = raw.foundedYear ?? raw.yearFounded ?? "";
  if (typeof foundedYear === "string" && foundedYear.trim()) {
    foundedYear = parseInt(foundedYear.trim(), 10);
  }
  if (!Number.isFinite(foundedYear) || foundedYear < 1850 || foundedYear > 2099) {
    foundedYear = "";
  }

  let revenue = String(raw.revenue || raw.estRevenue || "").trim();
  const revenueIsEstimate = !!raw.revenueIsEstimate;
  if (revenue) {
    const minRevConf = revenueIsEstimate ? MIN_REVENUE_ESTIMATE_CONFIDENCE : MIN_CONFIDENCE;
    if (confidence < minRevConf || !isValidRevenueString(revenue)) revenue = "";
  }

  let contactName = String(raw.contactName || "").trim();
  if (contactName && !looksLikePersonName(contactName)) contactName = "";

  let role = String(raw.role || "").trim();
  if (role && !contactName) role = "";

  const hasAny =
    overview ||
    vertical ||
    ownership ||
    employees ||
    foundedYear ||
    revenue ||
    contactName;

  if (!hasAny) return null;

  const out = {
    overview,
    vertical,
    ownership,
    employees,
    foundedYear: foundedYear || "",
    revenue,
    contactName,
    role,
    confidence,
    ...(revenueIsEstimate && revenue ? { revenueIsEstimate: true } : {}),
  };

  if (fieldsNeeded.length) {
    const requestedHit = fieldsNeeded.some((f) => {
      if (f === "employee") return !!out.employees;
      if (f === "yearFounded") return !!out.foundedYear;
      if (f === "estRevenue") return !!out.revenue;
      return !!out[f];
    });
    if (!requestedHit) return null;
  }

  return out;
}

function buildPrompt({ companyName, website, homepageText, ruleFields, fieldsNeeded }) {
  const verticalsList = KNOWN_VERTICALS.join(", ");
  const ownershipList = [...ALLOWED_OWNERSHIP_VALUES].join("|");

  return `Return ONLY JSON with this shape:
{"overview":"string","vertical":"string","ownership":"string","employees":"string","foundedYear":number,"revenue":"string","revenueIsEstimate":boolean,"contactName":"string","role":"string","confidence":number}

Rules:
- Use ONLY facts explicitly present in the website and search text below. If a field is not supported by the text, return empty string or 0.
- Never invent names, emails, employee counts, founding years, or revenue figures.
- overview: 1-2 sentence B2B product description (plain English, no nav/menu text)
- vertical: exactly one of [${verticalsList}] or empty string if unclear
- ownership: one of ${ownershipList}
- employees: employee band like "1-10", "11-50", "51-200", "201-500", "501-1,000", "1,000+" or empty
- foundedYear: 4-digit year or 0 if unknown
- revenue: dollar amount with unit (e.g. "$5M", "$12 million") only if explicitly stated in text; otherwise empty
- revenueIsEstimate: true ONLY if you estimate revenue from employee count + industry because no revenue figure appears in text (lower confidence)
- contactName: full person name (First Last) of CEO/founder/owner ONLY if explicitly named in text
- role: job title for contactName or empty
- confidence: 0.0-1.0 for your overall answer quality
- Only improve these fields: ${fieldsNeeded.join(", ")}

Company: ${companyName}
Website: ${website}
Current rule-based values:
- overview: ${ruleFields.overview || "(empty)"}
- vertical: ${ruleFields.vertical || "(empty)"}
- ownership: ${ruleFields.ownership || "(empty)"}
- employees: ${ruleFields.employee || "(empty)"}
- foundedYear: ${ruleFields.yearFounded || "(empty)"}
- revenue: ${ruleFields.estRevenue || "(empty)"}
- contactName: ${ruleFields.contactName || "(empty)"}
- role: ${ruleFields.role || "(empty)"}

Website and search text:
${homepageText.slice(0, 8000)}`;
}

/** @param {NodeJS.ProcessEnv} env */
export function ollamaEnrichListGapFill(env) {
  const base = normalizeOllamaBase(env.OLLAMA_URL);
  const model = env.OLLAMA_MODEL || "llama3.2";

  return {
    name: "ollama-enrich-list",
    async fill({ companyName, website, homepageText, ruleFields, fieldsNeeded }) {
      if (!fieldsNeeded?.length) return null;

      const domain = normalizeDomain(website || "");
      const cacheKey = `ollama-enrich-list:${domain}:${String(companyName || "").toLowerCase()}:${fieldsNeeded.sort().join(",")}`;
      const cached = getCached(cacheKey, CACHE_TTL_DAYS);
      if (cached?.ok && cached.payload) {
        return validateOllamaEnrichResult(cached.payload, fieldsNeeded);
      }

      try {
        const userContent = buildPrompt({
          companyName,
          website,
          homepageText,
          ruleFields,
          fieldsNeeded,
        });
        const text = await ollamaChatOrGenerate(base, model, userContent);
        const parsed = parseJsonFromText(text);
        const validated = validateOllamaEnrichResult(parsed || {}, fieldsNeeded);
        putCached(cacheKey, "ollama-enrich-list", !!validated, validated);
        if (!validated) {
          console.warn(
            `[ollama-enrich-list] no usable result company="${String(companyName).slice(0, 72)}" rawLen=${text.length}`,
          );
        }
        return validated;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[ollama-enrich-list] error company="${String(companyName).slice(0, 72)}" ${msg}`);
        putCached(cacheKey, "ollama-enrich-list", false, null);
        return null;
      }
    },
  };
}
