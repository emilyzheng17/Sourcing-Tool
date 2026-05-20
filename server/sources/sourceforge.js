import { SOURCEFORGE_PATHS } from "../lib/productCategoryPaths.js";
import { searchDirectoryCategories } from "../lib/directorySource.js";
import { extractSourceForgeListings } from "../lib/directoryExtractors.js";

/**
 * @param {string} seg
 * @param {number} page
 */
function buildSourceForgeUrl(seg, page) {
  const base = `https://sourceforge.net/software/${seg}/`;
  return page <= 1 ? base : `${base}?page=${page}`;
}

/**
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchSourceForge(brief, fetchOpts = {}) {
  return searchDirectoryCategories(brief, fetchOpts, {
    sourceTag: "SourceForge",
    categoryPaths: SOURCEFORGE_PATHS,
    fallbackPath: "erp",
    buildUrl: buildSourceForgeUrl,
    extract: extractSourceForgeListings,
    defaultMaxPages: 3,
    defaultCap: 100,
  });
}

/** @param {string} html */
export function testParseSourceForgeListings(html) {
  return extractSourceForgeListings(html, "fleet-management");
}
