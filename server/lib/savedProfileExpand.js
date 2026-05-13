/**
 * Expand discovery brief from saved portfolio (LLM or heuristic).
 */

import { KNOWN_VERTICALS, PORTFOLIO_PRODUCT_NAMES } from "./portfolioProductNames.js";

function parseJsonFromText(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

/** @param {object} row flattened company from rowToCompany */
function snapshotRow(row) {
  if (!row || typeof row !== "object") return {};
  let nested = {};
  if (row.data && typeof row.data === "object") nested = row.data;
  return {
    name: row?.name || nested.name || "",
    domain: row?.domain || nested.domain || "",
    description: String(row.description ?? nested.description ?? "").slice(0, 500),
    homepageTextSample: String(row.homepageTextSample ?? nested.homepageTextSample ?? "").slice(0, 400),
    matchedProducts: Array.isArray(row.matchedProducts)
      ? row.matchedProducts
      : Array.isArray(nested.matchedProducts)
        ? nested.matchedProducts
        : [],
    products: Array.isArray(row.products) ? row.products : Array.isArray(nested.products) ? nested.products : [],
    verticals: Array.isArray(row.verticals) ? row.verticals : Array.isArray(nested.verticals) ? nested.verticals : [],
    ownership:
      row.ownership_class ??
      nested.ownership_class ??
      row.ownership ??
      nested.ownership ??
      "",
    tags: Array.isArray(row.tags) ? row.tags : Array.isArray(nested.tags) ? nested.tags : [],
  };
}

function heuristicExpand(snapshots) {
  const vertSet = new Set();
  const productSet = new Set();
  for (const s of snapshots) {
    for (const v of s.verticals || []) {
      if (KNOWN_VERTICALS.includes(v)) vertSet.add(v);
    }
    for (const p of [...(s.matchedProducts || []), ...(s.products || [])]) {
      if (typeof p === "string" && PORTFOLIO_PRODUCT_NAMES.includes(p)) productSet.add(p);
    }
  }
  let selectedVerticals = [...vertSet];
  if (selectedVerticals.length === 0) selectedVerticals = ["Bulk Materials"];

  const productsPick = [...productSet];
  const primary = productsPick[0] || "ERP & Operations";

  const searchQueries = [];
  for (const v of selectedVerticals.slice(0, 4)) {
    searchQueries.push(`${v} ${primary} software vendors`);
    searchQueries.push(`"${v}" ${primary.replace(/&/g, "and").toLowerCase()} B2B SaaS`);
    searchQueries.push(`"${v}" bootstrapped software company`);
  }
  searchQueries.push(`${primary} industrial vertical software`);

  const exaQueries = [
    `${selectedVerticals[0] || "industrial B2B"} ${primary} mission critical operations software`,
  ];

  const seen = new Set();
  const uniq = searchQueries.filter((q) => {
    const k = q.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    selectedVerticals,
    matchedProductHints: productsPick.length ? productsPick : [primary],
    searchQueries: uniq.slice(0, 15),
    exaQueries: exaQueries.slice(0, 3),
    source: "heuristic",
  };
}

async function expandOpenAi(env, portfolioText, emit) {
  const system = buildSystemPrompt();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Saved portfolio snapshots (JSON lines):\n${portfolioText.slice(0, 28000)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return normalizeExpanded(parseJsonFromText(text), emit);
}

async function expandAnthropic(env, portfolioText, emit) {
  const system = buildSystemPrompt();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022",
      max_tokens: 1536,
      system,
      messages: [
        {
          role: "user",
          content: `Saved portfolio snapshots (JSON lines):\n${portfolioText.slice(0, 28000)}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return normalizeExpanded(parseJsonFromText(text), emit);
}

async function expandGemini(env, portfolioText, emit) {
  const model = env.GEMINI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: `${buildSystemPrompt()}\n\nSaved portfolio snapshots:\n${portfolioText.slice(0, 28000)}` }],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return normalizeExpanded(parseJsonFromText(text), emit);
}

async function expandOllama(env, portfolioText, emit) {
  const base = (env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = env.OLLAMA_MODEL || "llama3.2";
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "user",
          content: `${buildSystemPrompt()}\n\nSnapshots:\n${portfolioText.slice(0, 12000)}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  const text = data.message?.content || "";
  return normalizeExpanded(parseJsonFromText(text), emit);
}

function buildSystemPrompt() {
  return `You help find similar B2B vertical/industrial software companies to a user's saved portfolio.
Reply ONLY valid JSON with this shape (no markdown):
{"selectedVerticals":string[],"matchedProductHints":string[],"searchQueries":string[],"exaQueries":string[]}

Rules:
- selectedVerticals: 1-6 items; each MUST be exactly one of: ${JSON.stringify(KNOWN_VERTICALS)}
- matchedProductHints: 0-8 items from this catalog only: ${JSON.stringify(PORTFOLIO_PRODUCT_NAMES)}
- searchQueries: 8-14 web-search query strings; put industry/vertical wording FIRST, product keywords SECOND (Brave-style).
- exaQueries: 1-3 short phrases for semantic web search (vertical-first).
Infer verticals/products from company names + descriptions even if vague. Prefer overlap with portfolio themes.`;
}

function normalizeExpanded(j, emit) {
  const emitFn = typeof emit === "function" ? emit : () => {};
  if (!j || typeof j !== "object") return null;

  let selectedVerticals = Array.isArray(j.selectedVerticals) ? j.selectedVerticals.map(String) : [];
  selectedVerticals = [...new Set(selectedVerticals)].filter((v) => KNOWN_VERTICALS.includes(v));
  if (selectedVerticals.length === 0) return null;

  let hints = Array.isArray(j.matchedProductHints) ? j.matchedProductHints.map(String) : [];
  hints = [...new Set(hints)].filter((p) => PORTFOLIO_PRODUCT_NAMES.includes(p));

  let searchQueries = Array.isArray(j.searchQueries) ? j.searchQueries.map(String).filter(Boolean) : [];
  searchQueries = searchQueries.slice(0, 16);

  let exaQueries = Array.isArray(j.exaQueries) ? j.exaQueries.map(String).filter(Boolean) : [];
  exaQueries = exaQueries.slice(0, 3);

  emitFn({ type: "log", message: `[recommendations] LLM expanded ${selectedVerticals.length} verticals, ${searchQueries.length} queries` });

  return {
    selectedVerticals,
    matchedProductHints: hints,
    searchQueries,
    exaQueries,
    source: "llm",
  };
}

/**
 * @param {{ rows: object[], llmProvider: string, env: NodeJS.ProcessEnv, emit?: function }} opts
 */
export async function expandFromSavedPortfolio({ rows, llmProvider, env, emit }) {
  const snaps = rows.map(snapshotRow).filter((s) => s.name || s.domain);
  if (snaps.length === 0) {
    return { ok: false, message: "No saved companies to analyze." };
  }

  const portfolioText = snaps.map((s) => JSON.stringify(s)).join("\n");
  const p = (llmProvider || "none").toLowerCase();

  let expanded = null;
  try {
    if (p === "openai" && env.OPENAI_API_KEY) expanded = await expandOpenAi(env, portfolioText, emit);
    else if (p === "anthropic" && env.ANTHROPIC_API_KEY) expanded = await expandAnthropic(env, portfolioText, emit);
    else if (p === "gemini" && env.GEMINI_API_KEY) expanded = await expandGemini(env, portfolioText, emit);
    else if (p === "ollama") expanded = await expandOllama(env, portfolioText, emit);
  } catch (e) {
    expanded = null;
    if (typeof emit === "function") {
      emit({ type: "log", message: `[recommendations] LLM expand failed: ${e.message || String(e)}` });
    }
  }

  if (!expanded) {
    expanded = heuristicExpand(snaps);
  }

  return {
    ok: true,
    source: expanded.source,
    selectedVerticals: expanded.selectedVerticals,
    matchedProductHints: expanded.matchedProductHints || [],
    additionalSearchQueries: expanded.searchQueries || [],
    recommendationExaQueries: expanded.exaQueries || [],
  };
}
