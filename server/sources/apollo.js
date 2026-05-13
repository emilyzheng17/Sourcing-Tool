/** Apollo.io People/Org Search — stub; enable with APOLLO_API_KEY. */
export async function searchApollo(_brief, env) {
  if (!env.APOLLO_API_KEY) return [];
  // Minimal org search (endpoint may vary by Apollo API version)
  try {
    const q = "software";
    const res = await fetch(`https://api.apollo.io/v1/organizations/search?api_key=${env.APOLLO_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q_organization_keyword_tags: [q],
        page: 1,
        per_page: 25,
      }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const orgs = data.organizations || [];
    return orgs
      .map((o) => ({
        name: o.name,
        website: o.website_url || (o.primary_domain ? `https://${o.primary_domain}` : ""),
        sourceTag: "Apollo",
        rawMetadata: { apolloId: o.id },
      }))
      .filter((x) => x.website);
  } catch {
    return [];
  }
}
