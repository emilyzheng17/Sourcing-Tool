/**
 * Shared web search helpers (Serper, Tavily, Brave).
 * @param {string} query
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<Array<{ url: string, title: string, snippet: string }>>}
 */
export async function searchSerperQuery(query, env) {
  const key = env.SERPER_API_KEY;
  if (!key) return [];
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": key },
    body: JSON.stringify({ q: query, num: 8 }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.organic || []).map((r) => ({ url: r.link, title: r.title, snippet: r.snippet }));
}

/** @param {string} query @param {NodeJS.ProcessEnv} env */
export async function searchTavilyQuery(query, env) {
  const key = env.TAVILY_API_KEY;
  if (!key) return [];
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      max_results: 8,
      include_answer: false,
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).map((r) => ({ url: r.url, title: r.title, snippet: r.content }));
}

/** @param {string} query @param {NodeJS.ProcessEnv} env */
export async function searchBraveQuery(query, env) {
  const key = env.BRAVE_API_KEY;
  if (!key) return [];
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.web?.results || data.results || []).map((r) => ({
    url: r.url || r.link,
    title: r.title,
    snippet: r.description,
  }));
}

/**
 * Try search providers in order until results are returned.
 * @param {string} query
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<Array<{ url: string, title: string, snippet: string }>>}
 */
export async function searchWebQuery(query, env) {
  const providers = [
    () => searchSerperQuery(query, env),
    () => searchTavilyQuery(query, env),
    () => searchBraveQuery(query, env),
  ];
  for (const provider of providers) {
    try {
      const results = await provider();
      if (results.length) return results;
    } catch {
      /* try next */
    }
  }
  return [];
}
