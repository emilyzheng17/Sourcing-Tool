/**
 * Deterministic search query strings from UI brief (no LLM).
 * @param {{ activeProduct: string, selectedVerticals: string[], selectedTags: string[], ownershipFilter: string }} brief
 */
export function buildSearchQueries(brief) {
  const { activeProduct, selectedVerticals = [], selectedTags = [], ownershipFilter } = brief;
  const vert = selectedVerticals.length ? selectedVerticals : ["industrial B2B"];
  const productSlug = activeProduct.replace(/&/g, "and").toLowerCase();
  const tags = (Array.isArray(selectedTags) ? selectedTags : []).slice(0, 5).join(" ");
  const queries = [];

  for (const v of vert) {
    queries.push(`${v} ${activeProduct} software vendors`);
    queries.push(`"${v}" ${productSlug} software companies`);
    queries.push(`${v} vertical software proprietary`);
    queries.push(`site:g2.com ${v} ${productSlug}`);
    queries.push(`site:capterra.com ${v} ${productSlug}`);
    queries.push(`site:trustradius.com ${v} ${productSlug}`);
    queries.push(`site:getapp.com ${v} ${productSlug}`);
    queries.push(`site:softwareadvice.com ${v} ${productSlug}`);
    queries.push(`site:sourceforge.net ${v} ${productSlug}`);
    queries.push(`site:saashub.com ${v} ${productSlug}`);
    queries.push(`"${v}" "private equity" software acquisition`);
    queries.push(`"${v}" bootstrapped software company`);
    queries.push(`"${v}" founder led enterprise software`);
    queries.push(`${v} ${productSlug} B2B SaaS vendors`);
    queries.push(`industrial ${v} ${productSlug} platform`);
    queries.push(`${productSlug} software for ${v} industry`);
  }

  if (tags) {
    queries.push(`${activeProduct} ${tags} industrial`);
    queries.push(`${productSlug} ${tags} enterprise`);
  }

  if (ownershipFilter === "Founder-Operated") {
    queries.push(`founder owned ${productSlug} software`);
    queries.push(`bootstrapped ${productSlug} B2B`);
  }
  if (ownershipFilter === "Private Equity" || ownershipFilter === "Vintage PE" || ownershipFilter === "Recent PE") {
    queries.push(`private equity portfolio ${productSlug} software`);
    queries.push(`acquired ${productSlug} software 2015..2019`);
  }
  if (ownershipFilter === "VC-Backed") {
    queries.push(`${productSlug} B2B SaaS series A`);
    queries.push(`venture backed ${productSlug} software`);
  }
  if (ownershipFilter === "Publicly Traded") {
    queries.push(`${productSlug} enterprise software publicly traded`);
    queries.push(`site:sec.gov ${productSlug} software 10-K`);
  }
  if (ownershipFilter === "Acquired") {
    queries.push(`acquired ${productSlug} software company`);
    queries.push(`M&A ${productSlug} vertical software`);
  }
  if (ownershipFilter === "Family-Owned") {
    queries.push(`family owned ${productSlug} software`);
  }
  if (ownershipFilter === "Employee-Owned (ESOP)") {
    queries.push(`ESOP ${productSlug} software company`);
  }

  if (!selectedVerticals.length) {
    queries.push(`site:crunchbase.com ${productSlug}`);
    queries.push(`site:softwareequity.com ${productSlug}`);
    queries.push(`industrial ${productSlug} "system of record"`);
    queries.push(`${productSlug} mission critical operations software`);
  } else {
    for (const v of vert) {
      const vslug = String(v).replace(/&/g, "and").toLowerCase();
      queries.push(`site:crunchbase.com ${vslug} ${productSlug}`);
    }
    queries.push(`site:softwareequity.com ${vert.map((v) => String(v).replace(/&/g, "and").toLowerCase()).join(" ")} ${productSlug}`);
  }

  // Dedupe while preserving order
  const seen = new Set();
  return queries.filter((q) => {
    const k = q.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
