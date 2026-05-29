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

const NAV_BOILERPLATE_RES = [
  /^skip to content\s*/i,
  /^0\s+skip to content\s*/i,
  /^open menu close menu\s*/i,
  /^(?:home|about|contact|products|services|login|cart|menu)\s+/i,
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

/** True when text is unsuitable for a company overview field. */
export function isJunkOverviewText(t) {
  if (!t || typeof t !== "string") return true;
  const s = t.trim();
  if (s.length < 25) return true;
  if (/%PDF-|^\s*\{["']css/i.test(s)) return true;
  if (/^\s*\{["']@/i.test(s)) return true;
  if (/^open menu close menu/i.test(s)) return true;
  if (/^skip to content/i.test(s) && s.length < 120) return true;
  if (/^(?:jobs|teams|career programs|working at meta)/i.test(s)) return true;
  return false;
}

/** Strip common nav/menu prefixes from scraped visible text. */
export function stripNavBoilerplate(t) {
  if (!t || typeof t !== "string") return "";
  let s = sanitizeScrapedPlainText(t);
  for (let i = 0; i < 6; i++) {
    const before = s;
    for (const re of NAV_BOILERPLATE_RES) {
      s = s.replace(re, "").trim();
    }
    if (s === before) break;
  }
  return s.trim();
}

/** First sentence-like chunk that looks like product copy, not nav. */
export function extractSubstantiveParagraph(text) {
  const cleaned = stripNavBoilerplate(text);
  if (!cleaned) return "";

  const sentences = cleaned.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  for (const sent of sentences) {
    if (sent.length >= 50 && !isJunkOverviewText(sent)) {
      if (!/^(?:home|about|contact|products|login|menu|search for)/i.test(sent)) {
        return sent;
      }
    }
  }

  const chunk = cleaned.slice(0, 280).trim();
  return isJunkOverviewText(chunk) ? "" : chunk;
}

function truncateOverview(text, maxLen = 200) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

/**
 * Pick the best overview string for enrich-list export (meta-first).
 * @param {{ name: string, metaDescription?: string, homepageMetaDescription?: string, homepageTextSample?: string, combinedText?: string, productLabel?: string }} opts
 */
export function pickBestOverview(opts) {
  const name = opts.name || "Company";
  const meta = (opts.homepageMetaDescription || opts.metaDescription || "").trim();
  if (meta.length >= 40 && !isJunkOverviewText(meta)) {
    return truncateOverview(meta);
  }

  const body = extractSubstantiveParagraph(opts.homepageTextSample || opts.combinedText || "");
  if (body.length >= 40) {
    return truncateOverview(body);
  }

  const product = opts.productLabel || "software";
  return `${name} — B2B software vendor in ${product} (limited public text).`;
}
