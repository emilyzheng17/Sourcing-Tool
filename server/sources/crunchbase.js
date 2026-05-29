import { breadthMultiplier } from "../lib/breadth.js";
import { normalizeDomain } from "../lib/domains.js";

function employeesToBand(n) {
  if (n == null || !Number.isFinite(n)) return null;
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 200) return "51-200";
  if (n <= 500) return "201-500";
  if (n <= 1000) return "501-1,000";
  return "1,000+";
}

/** Crunchbase organization category taxonomy slugs (best-effort; empty rows skipped). */
const CRUNCHBASE_PRIMARY_CATEGORIES = [
  "enterprise_software",
  "saas",
  "computer_software",
  "internet_software_and_services",
];

/**
 * Variant = one category facet + optional short_description contains (AND predicates).
 */
function crunchbaseVariants(brief, env) {
  /** @type {Array<{category: string, keyword?: string}>} */
  const out = [];
  for (const category of CRUNCHBASE_PRIMARY_CATEGORIES) {
    out.push({ category });
  }
  const verts = Array.isArray(brief.selectedVerticals) ? brief.selectedVerticals.slice(0, 8) : [];
  const slug = String(brief.activeProduct || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
  for (const v of verts) {
    const vw = String(v).replace(/\s*&\s*/g, " and ").trim();
    const kw = slug ? `${slug.slice(0, 32)}`.trim() : "";
    /** Single token from vertical for description match */
    const firstWord = vw.split(/\s+/).find((w) => w.length >= 4) || vw.slice(0, 48);
    if (firstWord.length >= 4) {
      out.push({ category: "enterprise_software", keyword: firstWord });
    }
    if (kw.length >= 5) out.push({ category: "saas", keyword: `${kw} ${vw}`.slice(0, 64) });
  }
  const maxVariants = parseInt(String(env?.CRUNCHBASE_MAX_QUERY_VARIANTS || "10"), 10);
  const cap = Number.isFinite(maxVariants) ? Math.min(32, Math.max(1, maxVariants)) : 12;
  return out.slice(0, cap);
}

/**
 * Build query array — two predicates AND when keyword present.
 * @returns {object[]}
 */
function variantToQuery(variant) {
  const q = [];
  q.push({
    type: "predicate",
    field_id: "categories",
    operator_id: "includes",
    values: [variant.category],
  });
  if (variant.keyword && variant.keyword.trim().length >= 4) {
    q.push({
      type: "predicate",
      field_id: "short_description",
      operator_id: "contains",
      value: variant.keyword.trim().slice(0, 96),
    });
  }
  return q;
}

async function fetchOrgSearch(env, variant, limit, afterId) {
  const body = {
    field_ids: ["identifier", "short_description", "website", "linkedin", "num_employees_enum", "location_identifiers"],
    limit,
    query: variantToQuery(variant),
  };
  if (afterId) body.after_id = afterId;

  const res = await fetch("https://api.crunchbase.com/v4/data/searches/organizations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-cb-user-key": env.CRUNCHBASE_API_KEY,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

/** @param {Awaited<ReturnType<typeof fetchOrgSearch>>} data */
function mapEntities(data) {
  const entities = data.entities || [];
  return entities.map((e) => {
    const props = e.properties || {};
    const id = props.identifier?.value ?? props.identifier;
    const name =
      (typeof id === "object" && id?.name) ||
      (typeof id === "string" ? id : null) ||
      "Unknown";
    const webRaw = props.website?.value ?? props.website;
    const web =
      typeof webRaw === "string"
        ? webRaw.startsWith("http")
          ? webRaw
          : webRaw
            ? `https://${webRaw}`
            : ""
        : "";
    const empEnum = props.num_employees_enum;
    let employees = null;
    if (typeof empEnum === "string") {
      const mm = empEnum.match(/(\d+)/g);
      if (mm?.length) {
        const nums = mm.map((x) => parseInt(x, 10)).filter(Number.isFinite);
        if (nums.length) employees = employeesToBand(nums.reduce((a, b) => a + b, 0) / nums.length);
      }
    }
    const loc = props.location_identifiers?.value?.[0]?.value || props.location_identifiers?.[0];
    const hq = typeof loc === "string" ? loc : loc?.value || null;
    return {
      name,
      website: web,
      sourceTag: "Crunchbase",
      rawMetadata: {
        crunchbaseUuid: e.uuid,
        shortDescription: props.short_description?.value ?? props.short_description,
        crunchbaseEmployees: employees,
        hq,
      },
      _cbUuid: e.uuid,
    };
  });
}

/**
 * Crunchbase v4 — paginated + multi-variant queries.
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {{ apiBudgets?: { crunchbase?: { tryConsume: (n?: number) => boolean } } }} [fetchOpts]
 */
export async function searchCrunchbase(brief, env, fetchOpts = {}) {
  if (!env.CRUNCHBASE_API_KEY) return [];
  const budget = fetchOpts?.apiBudgets?.crunchbase;
  const m = breadthMultiplier(brief);
  const limit = Math.min(100, Math.max(24, Math.round(20 * m)));
  const pagesCfg = parseInt(String(env.CRUNCHBASE_MAX_PAGES_PER_VARIANT || "8"), 10);
  const maxPages = Number.isFinite(pagesCfg) ? Math.min(30, Math.max(1, pagesCfg)) : Math.min(12, Math.max(2, 3 * m));
  const variants = crunchbaseVariants(brief, env);

  /** @type {Map<string, object>} */
  const byKey = new Map();

  try {
    for (const variant of variants) {
      let afterId = null;
      for (let pg = 0; pg < maxPages; pg++) {
        if (budget && !budget.tryConsume(1)) return [...byKey.values()];
        const data = await fetchOrgSearch(env, variant, limit, afterId);
        if (!data?.entities?.length) break;

        const mapped = mapEntities(data).filter((x) => x.website);
        for (const row of mapped) {
          const d = normalizeDomain(row.website);
          const uuid = row._cbUuid || row.rawMetadata?.crunchbaseUuid;
          const key = uuid ? `u:${uuid}` : d ? `d:${d}` : "";
          if (!key || byKey.has(key)) continue;
          const { _cbUuid, ...rest } = row;
          byKey.set(key, rest);
        }

        const lastEnt = data.entities[data.entities.length - 1];
        const nextAfter = lastEnt?.uuid || null;
        if (!nextAfter || data.entities.length < limit) break;
        afterId = nextAfter;
      }
    }
    return [...byKey.values()];
  } catch {
    return [];
  }
}
