/** Crunchbase API — stub; enable with CRUNCHBASE_API_KEY. */
export async function searchCrunchbase(_brief, env) {
  if (!env.CRUNCHBASE_API_KEY) return [];
  try {
    const res = await fetch("https://api.crunchbase.com/v4/data/searches/organizations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-cb-user-key": env.CRUNCHBASE_API_KEY,
      },
      body: JSON.stringify({
        field_ids: ["identifier", "short_description", "website", "linkedin"],
        limit: 15,
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
        const id = props.identifier?.value || props.identifier;
        const web = props.website?.value || props.website;
        return {
          name: (typeof id === "string" ? id : id?.name) || "Unknown",
          website: web ? (String(web).startsWith("http") ? web : `https://${web}`) : "",
          sourceTag: "Crunchbase",
          rawMetadata: {},
        };
      })
      .filter((x) => x.website);
  } catch {
    return [];
  }
}
