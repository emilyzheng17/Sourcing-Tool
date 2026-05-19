import { fetchText } from "./lib/fetchText.js";
import { getCached, putCached } from "./lib/dbCache.js";

const OC_CACHE_TTL_DAYS = 30;

/**
 * Best-effort incorporation lookup (free tier, rate-limited).
 */
export async function openCorporatesSearch(companyName) {
  if (!companyName || companyName.length < 2) return null;

  const cacheKey = `oc:${companyName.trim().toLowerCase()}`;
  const cached = getCached(cacheKey, OC_CACHE_TTL_DAYS);
  if (cached) return cached.ok ? cached.payload : null;

  try {
    const q = encodeURIComponent(companyName);
    const url = `https://api.opencorporates.com/v0.4/companies/search?q=${q}&inactive=false`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      putCached(cacheKey, "oc", false, null);
      return null;
    }
    const data = await res.json();
    const c = data?.results?.companies?.[0]?.company;
    if (!c) {
      putCached(cacheKey, "oc", true, null);
      return null;
    }
    const result = {
      name: c.name,
      jurisdiction: c.jurisdiction_code,
      incorporationDate: c.incorporation_date || null,
      companyNumber: c.company_number,
      ocUrl: c.opencorporates_url,
      registeredAddress: c.registered_address_in_full || c.registered_address || null,
    };
    putCached(cacheKey, "oc", true, result);
    return result;
  } catch {
    putCached(cacheKey, "oc", false, null);
    return null;
  }
}
