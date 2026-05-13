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

/** Crunchbase v4 data search — best-effort field parsing */
export async function searchCrunchbase(brief, env) {
  if (!env.CRUNCHBASE_API_KEY) return [];
  const m = breadthMultiplier(brief);
  const limit = Math.min(150, Math.max(18, 22 * m));
  try {
    const res = await fetch("https://api.crunchbase.com/v4/data/searches/organizations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-cb-user-key": env.CRUNCHBASE_API_KEY,
      },
      body: JSON.stringify({
        field_ids: ["identifier", "short_description", "website", "linkedin", "num_employees_enum", "location_identifiers"],
        limit,
        query: [
          {
            type: "predicate",
            field_id: "categories",
            operator_id: "includes",
            values: ["enterprise_software"],
          },
        ],
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const entities = data.entities || [];
    return entities
      .map((e) => {
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
        };
      })
      .filter((x) => x.website);
  } catch {
    return [];
  }
}
