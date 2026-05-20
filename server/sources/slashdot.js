import { SLASHDOT_PATHS } from "../lib/productCategoryPaths.js";
import { searchDirectoryCategories } from "../lib/directorySource.js";
import { extractSlashdotListings } from "../lib/directoryExtractors.js";

/**
 * @param {string} seg
 * @param {number} page
 */
function buildSlashdotUrl(seg, page) {
  const base = `https://slashdot.org/software/${seg}/`;
  return page <= 1 ? base : `${base}?page=${page}`;
}

/**
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchSlashdot(brief, fetchOpts = {}) {
  return searchDirectoryCategories(brief, fetchOpts, {
    sourceTag: "Slashdot",
    categoryPaths: SLASHDOT_PATHS,
    fallbackPath: "erp",
    buildUrl: buildSlashdotUrl,
    extract: extractSlashdotListings,
    defaultMaxPages: 3,
    defaultCap: 90,
  });
}

/** @param {string} html */
export function testParseSlashdotListings(html) {
  return extractSlashdotListings(html, "field-service");
}
