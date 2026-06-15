import pLimit from "p-limit";
import { normalizeDomain, isLikelyCompanyDomain } from "../lib/domains.js";
import { breadthMultiplier } from "../lib/breadth.js";
import { getCached, putCached } from "../lib/dbCache.js";

const GITHUB_CACHE_TTL_DAYS = 7;
const GITHUB_CONCURRENCY = 4;
const USER_AGENT = "SourcingTool/1.0 (+https://github.com/)";

function ghHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
  };
}

function buildQueries(brief) {
  const verts = Array.isArray(brief?.selectedVerticals) && brief.selectedVerticals.length
    ? brief.selectedVerticals
    : ["industrial B2B"];
  const products = Array.isArray(brief?.selectedProducts) && brief.selectedProducts.length
    ? brief.selectedProducts
    : [brief?.activeProduct || "software"];
  const out = [];
  for (const v of verts) {
    out.push(`${v} software`);
    for (const p of products) {
      out.push(`${v} ${p}`);
    }
  }
  for (const p of products) {
    out.push(`${p} vertical software`);
  }
  const seen = new Set();
  return out.filter((q) => {
    const k = q.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function searchOrgLogins(query, token) {
  const cacheKey = `github:search:${query}`;
  const cached = getCached(cacheKey, GITHUB_CACHE_TTL_DAYS);
  if (cached) return cached.ok ? cached.payload || [] : [];
  try {
    const url = `https://api.github.com/search/users?q=${encodeURIComponent(`${query} type:org`)}&per_page=10`;
    const res = await fetch(url, { headers: ghHeaders(token), signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      putCached(cacheKey, "github", false, null);
      return [];
    }
    const data = await res.json();
    const logins = (data.items || []).map((i) => i.login).filter(Boolean);
    putCached(cacheKey, "github", true, logins);
    return logins;
  } catch {
    putCached(cacheKey, "github", false, null);
    return [];
  }
}

async function fetchOrgDetail(login, token) {
  const cacheKey = `github:org:${login}`;
  const cached = getCached(cacheKey, GITHUB_CACHE_TTL_DAYS);
  if (cached) return cached.ok ? cached.payload : null;
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
      headers: ghHeaders(token),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      putCached(cacheKey, "github", false, null);
      return null;
    }
    const data = await res.json();
    putCached(cacheKey, "github", true, data);
    return data;
  } catch {
    putCached(cacheKey, "github", false, null);
    return null;
  }
}

/** Fixture helper — map GitHub org detail objects (with `blog`) to candidates. */
export function testParseGithubOrgs(details) {
  const out = [];
  const seen = new Set();
  for (const d of details || []) {
    const blog = d?.blog;
    if (!blog || typeof blog !== "string") continue;
    const url = /^https?:\/\//i.test(blog) ? blog : `https://${blog}`;
    const domain = normalizeDomain(url);
    if (!domain || !isLikelyCompanyDomain(domain)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({
      name: d.name || d.login || domain.split(".")[0],
      website: url.split("?")[0],
      sourceTag: "GitHub",
      rawMetadata: {
        githubLogin: d.login,
        ...(d.bio ? { description: d.bio } : {}),
        ...(d.location ? { githubLocation: d.location } : {}),
      },
    });
  }
  return out;
}

/**
 * GitHub organization discovery — gated on GITHUB_TOKEN (degrades to [] without it).
 * Searches orgs by vertical keyword, then resolves each org's homepage (`blog`).
 *
 * @param {object} brief
 * @param {NodeJS.ProcessEnv} env
 */
export async function searchGithub(brief, env) {
  const token = (env || process.env).GITHUB_TOKEN;
  if (!token) return [];

  const m = breadthMultiplier(brief);
  const queries = buildQueries(brief).slice(0, Math.min(20, 4 + 4 * m));
  const maxOrgs = Math.min(200, 40 * m);

  const logins = new Set();
  for (const q of queries) {
    if (logins.size >= maxOrgs) break;
    for (const login of await searchOrgLogins(q, token)) {
      logins.add(login);
      if (logins.size >= maxOrgs) break;
    }
  }

  const limit = pLimit(GITHUB_CONCURRENCY);
  const details = await Promise.all(
    [...logins].map((login) => limit(() => fetchOrgDetail(login, token))),
  );
  return testParseGithubOrgs(details.filter(Boolean));
}
