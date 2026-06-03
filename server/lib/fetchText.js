import { getCached, putCached } from "./dbCache.js";

const UA = "SourcingTool/1.0 (+https://github.com/)";
const FETCH_CACHE_TTL_DAYS = 7;
/** Default cap when callers omit maxBytes — prevents unbounded res.text() OOM. */
export const DEFAULT_MAX_FETCH_BYTES = 3_000_000;

/** Avoid multi-GB heaps: discovery + enrichment can fetch many unique URLs. */
const MAX_FETCH_CACHE_BYTES = 110 * 1024 * 1024;
const MAX_FETCH_CACHE_ENTRIES = 3500;
/** Do not retain very large bodies (listing HTML, bloated SPAs) in the shared cache. */
const MAX_SINGLE_ENTRY_CACHE_BYTES = 1_400_000;

const fetchCacheMeta = new WeakMap();

function cacheByteTotal(cache) {
  let m = fetchCacheMeta.get(cache);
  if (!m) {
    m = { bytes: 0 };
    fetchCacheMeta.set(cache, m);
  }
  return m;
}

/**
 * Store a fetch result in `cache` (a Map), evicting oldest entries when over budget.
 * Call {@link resetFetchCacheAccounting} after `cache.clear()` so byte totals stay correct.
 * @param {Map<string, { ok: boolean, status: number, text: string, url: string, headers: Record<string, string> }>} cache
 * @param {string} url
 * @param {{ ok: boolean, status: number, text: string, url: string, headers: Record<string, string> }} entry
 */
export function putFetchCache(cache, url, entry) {
  if (!cache) return;
  const textLen = typeof entry?.text === "string" ? entry.text.length : 0;
  if (textLen > MAX_SINGLE_ENTRY_CACHE_BYTES) return;

  const meta = cacheByteTotal(cache);
  const prev = cache.get(url);
  if (prev && typeof prev.text === "string") meta.bytes -= prev.text.length;

  cache.set(url, entry);
  meta.bytes += textLen;

  while (cache.size > 0 && (meta.bytes > MAX_FETCH_CACHE_BYTES || cache.size > MAX_FETCH_CACHE_ENTRIES)) {
    const k = cache.keys().next().value;
    const old = cache.get(k);
    cache.delete(k);
    if (old && typeof old.text === "string") meta.bytes -= old.text.length;
  }
}

/** Reset internal byte accounting after `cache.clear()` (WeakMap entry is preserved). */
export function resetFetchCacheAccounting(cache) {
  if (!cache) return;
  const m = fetchCacheMeta.get(cache);
  if (m) m.bytes = 0;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * @param {string} url
 * @param {{
 *   timeout?: number,
 *   maxBytes?: number,
 *   headers?: Record<string, string>,
 *   cache?: Map<string, { ok: boolean, status: number, text: string, url: string, headers: Record<string, string> }>,
 *   jitterHostState?: Map<string, number>,
 * }} [opts]
 */
export async function fetchText(url, opts = {}) {
  const cache = opts.cache;
  if (cache?.has(url)) {
    return { ...cache.get(url) };
  }

  const dbKey = `fetch:${url}`;
  const cached = getCached(dbKey, FETCH_CACHE_TTL_DAYS);
  if (cached) {
    const entry = {
      ok: cached.ok,
      status: cached.payload?.status ?? (cached.ok ? 200 : 0),
      text: cached.payload?.text ?? "",
      url: cached.payload?.url ?? url,
      headers: {},
    };
    if (cache) putFetchCache(cache, url, entry);
    return entry;
  }

  const host = hostnameOf(url);
  if (opts.jitterHostState && host) {
    const last = opts.jitterHostState.get(host) || 0;
    const now = Date.now();
    const gap = now - last;
    const wait = Math.max(0, 250 - gap) + Math.floor(Math.random() * 251);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    opts.jitterHostState.set(host, Date.now());
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeout ?? 20000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        ...(opts.headers || {}),
      },
      redirect: "follow",
    });
    const cap = opts.maxBytes ?? DEFAULT_MAX_FETCH_BYTES;
    const text = await readBodyCapped(res, cap);
    const headers = {};
    try {
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
    } catch {
      /* ignore */
    }
    const out = { ok: res.ok, status: res.status, text, url: res.url, headers };
    if (cache) putFetchCache(cache, url, out);
    putCached(dbKey, "fetch", res.ok, { text, status: res.status, url: res.url });
    return out;
  } catch (err) {
    putCached(dbKey, "fetch", false, { error: err.message });
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Read response body up to `maxBytes` then abort the stream.
 * Returns a UTF-8 string (may be truncated mid-character at boundary).
 */
async function readBodyCapped(res, maxBytes) {
  if (!res.body) {
    const full = await res.text();
    if (full.length <= maxBytes) return full;
    return full.slice(0, maxBytes);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let result = "";
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        const excess = bytesRead - maxBytes;
        const trimmed = value.slice(0, value.byteLength - excess);
        result += decoder.decode(trimmed, { stream: false });
        break;
      }
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return result;
}
