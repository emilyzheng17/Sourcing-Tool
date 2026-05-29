/**
 * fetch() with AbortController timeout. Node/undici fetch has no default timeout.
 * @param {string} url
 * @param {{ timeout?: number, signal?: AbortSignal } & RequestInit} [opts]
 */
export function fetchWithTimeout(url, opts = {}) {
  const { timeout = 15000, signal: outerSignal, ...fetchOpts } = opts;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);

  if (outerSignal) {
    if (outerSignal.aborted) {
      clearTimeout(t);
      ctrl.abort();
    } else {
      outerSignal.addEventListener("abort", () => ctrl.abort(), { once: true });
    }
  }

  return fetch(url, { ...fetchOpts, signal: ctrl.signal }).finally(() => clearTimeout(t));
}
