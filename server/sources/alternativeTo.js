import { ALTERNATIVETO_PATHS } from "../lib/productCategoryPaths.js";
import { searchDirectoryCategories } from "../lib/directorySource.js";
import { extractAlternativeToListings } from "../lib/directoryExtractors.js";

/**
 * @param {string} seg
 * @param {number} page
 */
function buildAlternativeToUrl(seg, page) {
  const base = `https://alternativeto.net/category/business-and-commerce/${seg}/?platform=online`;
  return page <= 1 ? base : `${base}&p=${page}`;
}

/**
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchAlternativeTo(brief, fetchOpts = {}) {
  return searchDirectoryCategories(brief, fetchOpts, {
    sourceTag: "AlternativeTo",
    categoryPaths: ALTERNATIVETO_PATHS,
    fallbackPath: "erp",
    buildUrl: buildAlternativeToUrl,
    extract: extractAlternativeToListings,
    defaultMaxPages: 2,
    defaultCap: 70,
  });
}

/** @param {string} html */
export function testParseAlternativeToListings(html) {
  return extractAlternativeToListings(html, "field-service-management");
}
