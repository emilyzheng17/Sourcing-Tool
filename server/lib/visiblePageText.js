import * as cheerio from "cheerio";

/** Cheerio/jQuery-style .text() on body includes text inside <script>/<style>; remove those first. */
export function visibleTextFromHtml(html) {
  if (!html || typeof html !== "string") return "";
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, template, [aria-hidden='true']").remove();
  const body = $("body");
  const raw = body.length ? body.text() : $.root().text();
  return raw.replace(/\s+/g, " ").trim();
}

const EARLY_INLINE_JS = [
  /\(\s*function\s*\(\s*\)\s*\{/,
  /\(\s*function\s*\([^)]*\)\s*\{/,
  /!\s*function\s*\([^)]*\)\s*\{/,
  /\btypeof\s+[A-Za-z_$][\w$]*\s*!==\s*["']undefined["']/,
  /document\.body\.classList/,
  /window\.addEventListener\s*\(\s*["']load["']/,
];

/**
 * Drop leading "example.com: " when it introduces JS, and truncate before obvious inline script that slipped through.
 */
export function sanitizeScrapedPlainText(s) {
  if (!s || typeof s !== "string") return "";
  let t = s.replace(/\s+/g, " ").trim();
  const urlPrefix = t.match(/^(?:(?:https?:\/\/)?(?:www\.)?[\w.-]+\.[a-z]{2,})\s*:\s*/i);
  if (urlPrefix) {
    const after = t.slice(urlPrefix[0].length);
    if (/^\s*\(\s*function|^\s*typeof\s|^\s*var\s|^\s*!function/i.test(after)) t = after.trim();
  }
  let cut = t.length;
  for (const re of EARLY_INLINE_JS) {
    const i = t.search(re);
    if (i !== -1 && i < 200 && i < cut) cut = i;
  }
  if (cut < t.length) t = t.slice(0, cut).trim();
  return t.replace(/\s+/g, " ").trim();
}
