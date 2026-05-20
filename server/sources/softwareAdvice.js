import { SOFTWARE_ADVICE_PATHS } from "../lib/productCategoryPaths.js";
import { searchDirectoryCategories } from "../lib/directorySource.js";
import { extractSoftwareAdviceListings } from "../lib/directoryExtractors.js";

/**
 * @param {string} seg
 * @param {number} page
 */
function buildSoftwareAdviceUrl(seg, page) {
  const base = `https://www.softwareadvice.com/${seg}/`;
  return page <= 1 ? base : `${base}?page=${page}`;
}

/**
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchSoftwareAdvice(brief, fetchOpts = {}) {
  return searchDirectoryCategories(brief, fetchOpts, {
    sourceTag: "SoftwareAdvice",
    categoryPaths: SOFTWARE_ADVICE_PATHS,
    fallbackPath: "erp",
    buildUrl: buildSoftwareAdviceUrl,
    extract: extractSoftwareAdviceListings,
    defaultMaxPages: 4,
    defaultCap: 110,
  });
}

/** @param {string} html */
export function testParseSoftwareAdviceListings(html) {
  return extractSoftwareAdviceListings(html, "field-service");
}
