import { CROZDESK_PATHS } from "../lib/productCategoryPaths.js";
import { searchDirectoryCategories } from "../lib/directorySource.js";
import { extractCrozdeskListings } from "../lib/directoryExtractors.js";

/**
 * @param {string} seg
 * @param {number} page
 */
function buildCrozdeskUrl(seg, page) {
  const base = `https://crozdesk.com/${seg}`;
  return page <= 1 ? base : `${base}?page=${page}`;
}

/**
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchCrozdesk(brief, fetchOpts = {}) {
  return searchDirectoryCategories(brief, fetchOpts, {
    sourceTag: "Crozdesk",
    categoryPaths: CROZDESK_PATHS,
    fallbackPath: "enterprise-resource-planning-erp-software",
    buildUrl: buildCrozdeskUrl,
    extract: extractCrozdeskListings,
    defaultMaxPages: 2,
    defaultCap: 70,
  });
}

/** @param {string} html */
export function testParseCrozdeskListings(html) {
  return extractCrozdeskListings(html, "field-service-management-software");
}
