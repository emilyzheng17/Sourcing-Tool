import { breadthMultiplier } from "../lib/breadth.js";

function employeesToBand(n) {
  if (n == null || !Number.isFinite(n)) return null;
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 200) return "51-200";
  if (n <= 500) return "201-500";
  if (n <= 1000) return "501-1,000";
  return "1,000+";
}

/** Apollo.io organization search */
export async function searchApollo(brief, env) {
  if (!env.APOLLO_API_KEY) return [];
  const product = brief.activeProduct || "software";
  const m = breadthMultiplier(brief);
  const perPage = Math.min(100, 25 * m);
  try {
    const res = await fetch("https://api.apollo.io/v1/organizations/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": env.APOLLO_API_KEY,
      },
      body: JSON.stringify({
        q_organization_keyword_tags: [product.replace(/&/g, " ")],
        page: 1,
        per_page: perPage,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const orgs = data.organizations || [];
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
  } catch {
    return [];
  }
}
