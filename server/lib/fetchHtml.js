/**
 * Robust HTML fetch + block heuristics for directory scrapers.
 * Uses same jitter/cache contract as fetchText when opts.retry is unset.
 */

import { fetchText, putFetchCache } from "./fetchText.js";

const UA = "SourcingTool/1.0 (+https://github.com/)";

/** @type {ReadonlySet<number>} */
export const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Likely bot/WAF gate or useless shell (SSR sites sometimes return skeleton).
 * @param {{ ok: boolean, status: number, text?: string }} r
 */
export function isLikelyBlockedOrChallengeHtml(r) {
  if (!r || typeof r.text !== "string") return false;
  if (!r.ok) return false;
  const head = r.text.slice(0, 2800).toLowerCase();
  const shortPage = r.text.length < 1200;
  if (shortPage && /enable\s+javascript|checking\s+your\s+browser|captcha/i.test(head)) return true;
  if (/\bpow\b|attention required|\bcloudflare\b|just a moment|verify you are human|captcha\b|access\s+denied/i.test(head))
    return true;
  if (/<title>[^<]{0,120}(blocked|challenge|attention|Forbidden)[^<]*<\/title>/i.test(r.text.slice(0, 5000)))
    return true;
  return false;
}

/**
 * @param {Record<string, string>} headers
 */
function retryAfterMs(headers) {
  const ra = headers?.["retry-after"];
  if (!ra) return null;
  const sec = parseInt(ra, 10);
  if (!Number.isNaN(sec) && sec > 0 && sec < 3600) return sec * 1000;
  const d = new Date(ra).getTime();
  if (!Number.isNaN(d)) {
    const w = d - Date.now();
    if (w > 0 && w < 3600000) return w;
  }
  return null;
}

/**
 * Fetch with retries. Does not write to cache until a non-retryable outcome (or success).
 * @param {string} url
 * @param {{
 *   timeout?: number,
 *   headers?: Record<string, string>,
 *   cache?: Map<string, { ok: boolean, status: number, text: string, url: string, headers: Record<string, string> }>,
 *   jitterHostState?: Map<string, number>,
 *   maxAttempts?: number,
 *   baseDelayMs?: number,
 * }} [opts]
 */
export async function fetchHtml(url, opts = {}) {
  const maxAttempts = Math.min(8, Math.max(1, opts.maxAttempts ?? 4));
  const baseDelay = opts.baseDelayMs ?? 800;
  const cache = opts.cache;

  if (cache?.has(url)) {
    const hit = cache.get(url);
    if (hit) return { ...hit, fromCache: true };
  }

  let last = /** @type {{ ok: boolean, status: number, text: string, url: string, headers: Record<string, string> } | null} */ (null);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const r = await fetchText(url, {
      timeout: opts.timeout,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        ...(opts.headers || {}),
      },
      cache: undefined,
      jitterHostState: opts.jitterHostState,
    });
    last = r;

    const blocked = isLikelyBlockedOrChallengeHtml(r);
    const retriable =
      !r.ok && RETRYABLE_STATUSES.has(r.status) && attempt < maxAttempts && !blocked;

    if (r.ok && !blocked) {
      if (cache) putFetchCache(cache, url, { ok: r.ok, status: r.status, text: r.text, url: r.url, headers: r.headers });
      return { ...r, fromCache: false, blockedHint: false };
    }

    if (blocked && attempt < maxAttempts) {
      const wait = baseDelay * 2 ** (attempt - 1) + Math.floor(Math.random() * 400);
      await new Promise((res) => setTimeout(res, Math.min(wait, 15_000)));
      continue;
    }

    if (!retriable) {
      if (cache && r.ok && !blocked)
        putFetchCache(cache, url, { ok: r.ok, status: r.status, text: r.text, url: r.url, headers: r.headers });
      return { ...r, fromCache: false, blockedHint: blocked };
    }

    const ra = retryAfterMs(r.headers);
    const backoff = ra ?? baseDelay * 2 ** (attempt - 1) + Math.floor(Math.random() * 500);
    await new Promise((res) => setTimeout(res, Math.min(backoff, 30_000)));
  }

  if (last && cache && last.ok && !isLikelyBlockedOrChallengeHtml(last))
    putFetchCache(cache, url, { ok: last.ok, status: last.status, text: last.text, url: last.url, headers: last.headers });
  return last
    ? { ...last, fromCache: false, blockedHint: isLikelyBlockedOrChallengeHtml(last) }
    : { ok: false, status: 0, text: "", url, headers: {}, fromCache: false, blockedHint: false };
}
