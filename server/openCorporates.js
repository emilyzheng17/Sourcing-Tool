import { fetchText } from "./lib/fetchText.js";

/**
 * Best-effort incorporation lookup (free tier, rate-limited).
 */
export async function openCorporatesSearch(companyName) {
  if (!companyName || companyName.length < 2) return null;
  try {
    const q = encodeURIComponent(companyName);
    const url = `https://api.opencorporates.com/v0.4/companies/search?q=${q}&inactive=false`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const c = data?.results?.companies?.[0]?.company;
    if (!c) return null;
    return {
      name: c.name,
      jurisdiction: c.jurisdiction_code,
      incorporationDate: c.incorporation_date || null,
      companyNumber: c.company_number,
      ocUrl: c.opencorporates_url,
      registeredAddress: c.registered_address_in_full || c.registered_address || null,
    };
  } catch {
    return null;
  }
}
