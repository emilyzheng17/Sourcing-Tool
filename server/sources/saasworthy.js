import { SAASWORTHY_PATHS } from "../lib/productCategoryPaths.js";
import { searchDirectoryCategories } from "../lib/directorySource.js";
import { extractSaaSworthyListings } from "../lib/directoryExtractors.js";

/**
 * @param {string} seg
 * @param {number} page
 */
function buildSaaSworthyUrl(seg, page) {
  const base = `https://www.saasworthy.com/list/${seg}`;
  return page <= 1 ? base : `${base}?page=${page}`;
}

/**
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchSaaSworthy(brief, fetchOpts = {}) {
  return searchDirectoryCategories(brief, fetchOpts, {
    sourceTag: "SaaSworthy",
    categoryPaths: SAASWORTHY_PATHS,
    fallbackPath: "erp-software",
    buildUrl: buildSaaSworthyUrl,
    extract: extractSaaSworthyListings,
    defaultMaxPages: 2,
    defaultCap: 70,
  });
}

/** @param {string} html */
export function testParseSaaSworthyListings(html) {
  return extractSaaSworthyListings(html, "field-service-management-software");
}
