import { normalizeOllamaBase, ollamaChatOrGenerate } from "../lib/ollamaHttp.js";
import { getCached, putCached } from "../lib/dbCache.js";
import { normalizeDomain } from "../lib/domains.js";
import { isJunkOverviewText } from "../lib/visiblePageText.js";
import { KNOWN_VERTICALS } from "../lib/portfolioProductNames.js";

const CACHE_TTL_DAYS = 7;
const MIN_CONFIDENCE = 0.35;

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
 * @returns {{ overview: string, vertical: string, ownership: string, confidence: number } | null}
 */
export function validateOllamaEnrichResult(raw) {
  if (!raw || typeof raw !== "object") return null;

  const confidence = typeof raw.confidence === "number" ? raw.confidence : 0.4;
  if (confidence < MIN_CONFIDENCE) return null;

  let overview = String(raw.overview || "").trim();
  if (overview && isJunkOverviewText(overview)) overview = "";

  let vertical = String(raw.vertical || "").trim();
  if (vertical && !KNOWN_VERTICALS.includes(vertical)) vertical = "";

  let ownership = String(raw.ownership || "").trim();
  if (ownership && !ALLOWED_OWNERSHIP_VALUES.has(ownership)) ownership = "";

  if (!overview && !vertical && !ownership) return null;

  return { overview, vertical, ownership, confidence };
}

function buildPrompt({ companyName, website, homepageText, ruleFields, fieldsNeeded }) {
  const verticalsList = KNOWN_VERTICALS.join(", ");
  const ownershipList = [...ALLOWED_OWNERSHIP_VALUES].join("|");

  return `Return ONLY JSON with this shape:
{"overview":"string","vertical":"string","ownership":"string","confidence":number}

Rules:
- overview: 1-2 sentence B2B product description (plain English, no nav/menu text)
- vertical: exactly one of [${verticalsList}] or empty string if unclear
- ownership: one of ${ownershipList}
- confidence: 0.0-1.0 for your overall answer quality
- Only improve these fields: ${fieldsNeeded.join(", ")}

Company: ${companyName}
Website: ${website}
Current rule-based values:
- overview: ${ruleFields.overview || "(empty)"}
- vertical: ${ruleFields.vertical || "(empty)"}
- ownership: ${ruleFields.ownership || "(empty)"}

Website and search text:
${homepageText.slice(0, 6000)}`;
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
      const cacheKey = `ollama-enrich-list:${domain}:${String(companyName || "").toLowerCase()}`;
      const cached = getCached(cacheKey, CACHE_TTL_DAYS);
      if (cached?.ok && cached.payload) {
        return validateOllamaEnrichResult(cached.payload);
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
        const validated = validateOllamaEnrichResult(parsed || {});
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
