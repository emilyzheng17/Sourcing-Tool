/** Public ATS endpoints (no secrets) — counts are open roles proxy, not company size. */

const UA = "SourcingTool/1.0 (+https://github.com/)";

/** @returns {Promise<{ provider: string, openRoles?: number|null, boardUrl?: string } | null>} */
export async function tryFetchAtsSignals(htmlSnippet) {
  if (!htmlSnippet || htmlSnippet.length < 40) return null;

  const gh = htmlSnippet.match(/\b(?:https?:)?\/\/(?:www\.)?boards\.greenhouse\.io\/([^/"'\s>?]+)/i);
  if (gh?.[1]) {
    const slug = gh[1].replace(/[^\w\-]+/gi, "");
    if (!slug) return null;
    const count = await fetchGreenhouse(slug);
    return {
      provider: "Greenhouse",
      openRoles: count,
      boardUrl: `https://boards.greenhouse.io/${slug}`,
    };
  }

  return null;
}

/** @param {string} slug */
async function fetchGreenhouse(slug) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5500);
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const jobs = data?.jobs;
    return Array.isArray(jobs) ? jobs.length : null;
  } catch {
    return null;
  }
}
