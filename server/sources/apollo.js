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

/**
 * Keyword tag sets — Apollo merges multiple searches; duplicates removed by caller.
 */
function apolloKeywordTagVariants(brief) {
  /** @type {string[][]} */
  const variants = [];
  const product = String(brief.activeProduct || "enterprise software").replace(/&/g, " ").trim();

  variants.push([product]);

  const verts = Array.isArray(brief.selectedVerticals) ? brief.selectedVerticals : [];
  const tagsFlat = Array.isArray(brief.selectedTags) ? brief.selectedTags.slice(0, 10).map(String) : [];

  for (const v of verts.slice(0, 6)) {
    const vclean = String(v).replace(/&/g, "and").trim();
    if (!vclean) continue;
    const combined = [...new Set([product, `${vclean} software`, `${vclean}`, ...tagsFlat.slice(0, 4)])];
    variants.push(combined.slice(0, 12));
  }

  if (verts.length === 0 && tagsFlat.length > 0) {
    variants.push([product, ...tagsFlat.slice(0, 8)]);
  }

  const seenSig = new Set();
  const out = [];
  for (const vr of variants) {
    const sig = [...new Set(vr.map((x) => x.toLowerCase()))].sort().join("|");
    if (!sig || seenSig.has(sig)) continue;
    seenSig.add(sig);
    out.push(vr);
  }
  return out.length ? out.slice(0, 10) : [[product]];
}

function mapOrganizations(orgs) {
  return orgs
    .map((o) => {
      const domain = o.primary_domain || "";
      const website = o.website_url || (domain ? `https://${domain}` : "");
      const n = o.estimated_num_employees;
      const employees = employeesToBand(typeof n === "number" ? n : null);
      const city = o.city || "";
      const state = o.state || "";
      const country = o.country || "";
      const hq = [city, state, country].filter(Boolean).join(", ") || null;
      return {
        name: o.name || domain || "Unknown",
        website,
        sourceTag: "Apollo",
        rawMetadata: {
          apolloId: o.id,
          apolloEmployees: employees,
          apolloEmployeeCount: typeof n === "number" ? n : null,
          apolloFoundedYear: o.founded_year || null,
          apolloIndustry: o.industry || null,
          hq,
        },
      };
    })
    .filter((x) => x.website);
}

/**
 * Apollo.io organization search — multi-page per keyword variant.
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {{ apiBudgets?: { apollo?: { tryConsume: (n?: number) => boolean } } }} [fetchOpts]
 */
export async function searchApollo(brief, env, fetchOpts = {}) {
  if (!env.APOLLO_API_KEY) return [];
  const budget = fetchOpts?.apiBudgets?.apollo;
  const m = breadthMultiplier(brief);
  const perPage = Math.min(100, 25 * m);
  const maxPagesCfg = parseInt(String(env.APOLLO_MAX_PAGES || "12"), 10);
  const maxPages = Math.min(120, Number.isFinite(maxPagesCfg) && maxPagesCfg > 0 ? maxPagesCfg : Math.min(16, Math.max(3, 3 * m)));
  const variants = apolloKeywordTagVariants(brief);

  /** @type {Map<string, object>} keyed by normalized domain */
  const byDomain = new Map();

  try {
    for (const q_organization_keyword_tags of variants) {
      for (let page = 1; page <= maxPages; page++) {
        if (budget && !budget.tryConsume(1)) return [...byDomain.values()];
        const res = await fetch("https://api.apollo.io/v1/organizations/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "X-Api-Key": env.APOLLO_API_KEY,
          },
          body: JSON.stringify({
            q_organization_keyword_tags,
            page,
            per_page: perPage,
          }),
        });
        if (!res.ok) break;
        const data = await res.json();
        const orgs = data.organizations || [];
        const rows = mapOrganizations(orgs);
        for (const r of rows) {
          const d = normalizeDomain(r.website);
          const aid = r.rawMetadata?.apolloId;
          const key = aid != null ? `id:${aid}` : d ? `d:${d}` : `u:${r.name}`;
          if (key && !byDomain.has(key)) byDomain.set(key, r);
        }
        if (orgs.length < perPage) break;
      }
    }
    return [...byDomain.values()];
  } catch {
    return [];
  }
}
