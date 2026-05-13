const UA = "SourcingTool/1.0 (+https://github.com/)";

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
    if (cache) cache.set(url, out);
    return out;
  } finally {
    clearTimeout(t);
  }
}
