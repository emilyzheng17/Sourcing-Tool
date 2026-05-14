const UA = "SourcingTool/1.0 (+https://github.com/)";

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
    const text = await res.text();
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
    return out;
  } finally {
    clearTimeout(t);
  }
}
