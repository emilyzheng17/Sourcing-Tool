import { fetchHtml } from "./fetchHtml.js";
import { tryPlaywrightFallback } from "./playwrightRender.js";
import { breadthMultiplier } from "./breadth.js";
import { pathsForProduct } from "./productCategoryPaths.js";

/**
 * @typedef {object} DirectorySourceOptions
 * @property {string} sourceTag
 * @property {Record<string, string | string[]>} categoryPaths
 * @property {string} [fallbackPath]
 * @property {(slug: string, page: number) => string} buildUrl
 * @property {(html: string, pathLabel: string) => object[]} extract
 * @property {number} [defaultMaxPages]
 * @property {number} [defaultCap]
 * @property {number} [timeoutMs]
 */

/**
 * Scrape paginated category/listing pages from a software directory.
 * @param {object} brief
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 * @param {DirectorySourceOptions} opts
 */
export async function searchDirectoryCategories(brief, fetchOpts = {}, opts) {
  const paths = pathsForProduct(opts.categoryPaths, brief.activeProduct, opts.fallbackPath);
  const m = breadthMultiplier(brief);
  const maxPages = Math.min(16, (opts.defaultMaxPages ?? 4) + 3 * m);
  const cap = Math.min(600, (opts.defaultCap ?? 100) * m);
  const merged = [];

  const baseFo = {
    timeout: opts.timeoutMs ?? 24000,
    cache: fetchOpts.cache,
    jitterHostState: fetchOpts.jitterHostState,
    maxAttempts: 4,
  };

  for (const pathSlug of paths) {
    const seg = String(pathSlug).replace(/^\/+|\/+$/g, "");
    let stagnant = 0;
    let prevSig = "";
    for (let page = 1; page <= maxPages; page++) {
      const url = opts.buildUrl(seg, page);
      try {
        const r = await fetchHtml(url, baseFo);
        let text = r.text;
        if ((!r.ok || !text || text.length < 600 || r.blockedHint) && process.env.PLAYWRIGHT === "1") {
          const pw = await tryPlaywrightFallback(url);
          if (pw?.text) text = pw.text;
        }
        if (!text || text.length < 200) break;

        const pageItems = opts.extract(text, seg);
        const sig = pageItems
          .slice(0, 5)
          .map((x) => x.website)
          .join("|");
        if (sig && sig === prevSig) {
          stagnant += 1;
          if (stagnant >= 2) break;
        } else {
          stagnant = 0;
          prevSig = sig;
        }
        if (pageItems.length === 0) break;
        merged.push(...pageItems);
      } catch {
        break;
      }
    }
  }

  const seen = new Set();
  return merged
    .filter((x) => {
      const k = (x.website || x.name || "").toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, cap);
}
