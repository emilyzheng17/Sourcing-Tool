/**
 * Native Ollama HTTP helpers. Some installs return 404 on POST /api/chat
 * (older daemons or reverse proxies); POST /api/generate is the stable fallback.
 */

/** @param {string | undefined} raw */
export function normalizeOllamaBase(raw) {
  const fallback = "http://127.0.0.1:11434";
  let u = String(raw ?? fallback).trim();
  if (!u) u = fallback;
  u = u.replace(/\/+$/, "");
  u = u.replace(/\/v1$/i, "");
  return u;
}

/**
 * @param {Response} res
 * @param {{ raw: string, json: object | null }} body
 */
function formatOllamaHttpError(res, body) {
  const hint = body.json && typeof body.json.error === "string" ? body.json.error : body.raw?.slice(0, 400);
  const suffix = hint ? `: ${hint}` : "";
  return `Ollama HTTP ${res.status}${suffix}`;
}

/**
 * @param {string} base
 * @param {string} model
 * @param {string} userContent full user message (same string for chat and generate)
 * @returns {Promise<string>} model text (JSON or prose to parse downstream)
 */
export async function ollamaChatOrGenerate(base, model, userContent) {
  const chatRes = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  const chatBody = await readBody(chatRes);
  if (chatRes.ok) {
    const text = chatBody.json?.message?.content;
    if (typeof text === "string") return text;
    throw new Error(formatOllamaHttpError(chatRes, chatBody));
  }

  if (chatRes.status !== 404) {
    throw new Error(formatOllamaHttpError(chatRes, chatBody));
  }

  const genRes = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: userContent,
      stream: false,
    }),
  });
  const genBody = await readBody(genRes);
  if (!genRes.ok) {
    throw new Error(formatOllamaHttpError(genRes, genBody));
  }
  const text = genBody.json?.response;
  if (typeof text === "string") return text;
  throw new Error(formatOllamaHttpError(genRes, genBody));
}

/** @param {Response} res */
async function readBody(res) {
  const raw = await res.text();
  try {
    return { raw, json: JSON.parse(raw) };
  } catch {
    return { raw, json: null };
  }
}
