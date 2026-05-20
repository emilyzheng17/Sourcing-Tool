import { SAASHUB_PATHS } from "../lib/productCategoryPaths.js";
import { searchDirectoryCategories } from "../lib/directorySource.js";
import { extractSaaSHubListings } from "../lib/directoryExtractors.js";

/**
 * @param {string} seg
 * @param {number} page
 */
function buildSaaSHubUrl(seg, page) {
  const base = `https://www.saashub.com/${seg}`;
  return page <= 1 ? base : `${base}?page=${page}`;
}

/**
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchSaaSHub(brief, fetchOpts = {}) {
  return searchDirectoryCategories(brief, fetchOpts, {
    sourceTag: "SaaSHub",
    categoryPaths: SAASHUB_PATHS,
    fallbackPath: "best-erp-software",
    buildUrl: buildSaaSHubUrl,
    extract: extractSaaSHubListings,
    defaultMaxPages: 2,
    defaultCap: 80,
  });
}

/** @param {string} html */
export function testParseSaaSHubListings(html) {
  return extractSaaSHubListings(
    html,
    "best-field-management-software"
  );
}
