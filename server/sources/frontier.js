import { fetchText } from "../lib/fetchText.js";
import { searchWebQuery } from "../lib/webSearch.js";
import { extractExternalLinks } from "./portfolioHarvest.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";

/**
 * Normalize `brief.seedCompanies` (confirmed VMS targets) into {name, domain} seeds.
 * Accepts strings (name or domain) or objects ({ name|company, website|domain }).
 * @param {object} brief
 */
export function collectSeeds(brief) {
  const raw = Array.isArray(brief?.seedCompanies) ? brief.seedCompanies : [];
  const seeds = [];
  const seen = new Set();
  for (const s of raw) {
    let name = "";
    let domain = "";
    if (typeof s === "string") {
      const t = s.trim();
      if (!t) continue;
      domain = normalizeDomain(t);
      name = domain ? "" : t;
    } else if (s && typeof s === "object") {
      name = String(s.name || s.company || "").trim();
      domain = normalizeDomain(s.website || s.domain || "");
    }
    const label = (name || domain).toLowerCase();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    seeds.push({ name: name || domain, domain });
  }
  return seeds;
}

/** "alternatives to X" / "X competitors" frontier queries for a confirmed seed. */
export function frontierQueries(seed) {
  const label = seed.name || seed.domain;
  if (!label) return [];
  return [`alternatives to ${label}`, `${label} competitors`];
}

/**
 * Competitor / "alternatives-to" frontier expansion — directly attacks the
 * "same companies" loop by seeding from already-confirmed VMS targets
 * (`brief.seedCompanies`). For each seed it runs alternatives/competitors queries
 * through the shared web-search layer, taking company-domain results directly and
 * extracting vendor outbound links from comparison/listicle result pages.
 * Returns [] when no seeds are supplied or no search key is configured.
 *
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 * @param {{ cache?: Map, jitterHostState?: Map }} [fetchOpts]
 */
export async function searchFrontier(brief, env, fetchOpts = {}) {
  const e = env || process.env;
  const seeds = collectSeeds(brief);
  if (seeds.length === 0) return [];

  const m = breadthMultiplier(brief);
  const maxSeeds = Math.min(seeds.length, Math.min(20, 6 * m));
  const pagesPerSeed = Math.min(4, 1 + m);
  const cap = Math.min(400, 150 * m);

  const out = [];
  const seenDomain = new Set();

  for (const seed of seeds.slice(0, maxSeeds)) {
    if (out.length >= cap) break;
    const seedDomain = seed.domain;
    const tag = `Frontier:${seed.name || seed.domain}`;

    const resultUrls = [];
    const seenUrl = new Set();
    for (const q of frontierQueries(seed)) {
      let results = [];
      try {
        results = await searchWebQuery(q, e);
      } catch {
        results = [];
      }
      for (const r of results) {
        const url = r?.url;
        if (!url) continue;
        const d = normalizeDomain(url);
        // Direct company-domain hits become candidates immediately (mirrors Brave).
        if (d && d !== seedDomain && isLikelyCompanyDomain(d) && !seenDomain.has(d)) {
          seenDomain.add(d);
          out.push({
            name: r.title || d,
            website: url.split("?")[0],
            sourceTag: tag,
            rawMetadata: { frontierSeed: seed.name || seed.domain, frontierQuery: q },
          });
        }
        if (!seenUrl.has(url)) {
          seenUrl.add(url);
          resultUrls.push(url);
        }
      }
    }

    // Parse a few comparison/listicle result pages for additional vendor outbound links.
    for (const url of resultUrls.slice(0, pagesPerSeed)) {
      if (out.length >= cap) break;
      try {
        const { ok, text } = await fetchText(url, {
          timeout: 22000,
          cache: fetchOpts.cache,
          jitterHostState: fetchOpts.jitterHostState,
        });
        if (!ok || !text) continue;
        for (const cand of extractExternalLinks(text, url, tag, { frontierSeed: seed.name || seed.domain })) {
          const d = normalizeDomain(cand.website);
          if (!d || d === seedDomain || seenDomain.has(d)) continue;
          seenDomain.add(d);
          out.push(cand);
          if (out.length >= cap) break;
        }
      } catch {
        /* ignore per-page failures */
      }
    }
  }

  return out.slice(0, cap);
}
