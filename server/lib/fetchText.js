const UA = "SourcingTool/1.0 (+https://github.com/)";

export async function fetchText(url, opts = {}) {
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
    return { ok: res.ok, status: res.status, text, url: res.url };
  } finally {
    clearTimeout(t);
  }
}
