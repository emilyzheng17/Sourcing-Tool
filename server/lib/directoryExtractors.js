import * as cheerio from "cheerio";

const B2B_NOISE = new Set([
  "facebook",
  "twitter",
  "instagram",
  "youtube",
  "wikipedia",
  "reddit",
  "pinterest",
  "tiktok",
  "spotify",
  "netflix",
  "amazon",
  "apple",
  "google",
  "microsoft",
  "adobe",
  "notion",
  "slack",
  "zoom",
  "dropbox",
  "figma",
  "canva",
  "spotify",
  "whatsapp",
  "telegram",
  "discord",
  "twitch",
  "snapchat",
]);

/**
 * @param {string} name
 */
export function isLikelyB2BSoftwareName(name) {
  const n = (name || "").trim().toLowerCase();
  if (!n || n.length < 2 || n.length > 120) return false;
  if (B2B_NOISE.has(n.split(/\s+/)[0])) return false;
  if (/^(free|open source|download|app store|play store)$/i.test(n)) return false;
  return true;
}

/**
 * @param {string} html
 * @param {string} pathLabel
 * @param {string} sourceTag
 * @param {string} origin
 * @param {string} hrefPattern
 * @param {string} metaKey
 */
export function extractProfileAnchors(html, pathLabel, sourceTag, origin, hrefPattern, metaKey) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const rows = [];
  $(`a[href*="${hrefPattern}"]`).each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.includes("/reviews")) return;
    let abs;
    try {
      abs = new URL(href, origin).href;
    } catch {
      return;
    }
    if (!abs.includes(hrefPattern)) return;
    const key = abs.split("?")[0].toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const name = $(el).text().trim().split("\n")[0].trim();
    if (!isLikelyB2BSoftwareName(name)) return;
    rows.push({
      name,
      website: abs.split("?")[0],
      sourceTag,
      rawMetadata: { [metaKey]: abs.split("?")[0], category: pathLabel },
    });
  });
  return rows;
}

/** @param {string} html @param {string} pathLabel */
export function extractSoftwareAdviceListings(html, pathLabel) {
  return extractProfileAnchors(
    html,
    pathLabel,
    "SoftwareAdvice",
    "https://www.softwareadvice.com",
    "-profile",
    "softwareAdviceUrl"
  );
}

/** @param {string} html @param {string} pathLabel */
export function extractSourceForgeListings(html, pathLabel) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const rows = [];
  $('a[href*="/software/product/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.includes("#reviews")) return;
    let abs;
    try {
      abs = new URL(href, "https://sourceforge.net").href;
    } catch {
      return;
    }
    const key = abs.split("?")[0].toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const name =
      $(el).text().trim().split("\n")[0].trim() ||
      abs.split("/product/")[1]?.replace(/\/$/, "").replace(/-/g, " ") ||
      "";
    if (!isLikelyB2BSoftwareName(name)) return;
    rows.push({
      name: name.slice(0, 120),
      website: abs.split("?")[0],
      sourceTag: "SourceForge",
      rawMetadata: { sourceForgeUrl: abs.split("?")[0], category: pathLabel },
    });
  });
  return rows;
}

/** @param {string} html @param {string} pathLabel */
export function extractSlashdotListings(html, pathLabel) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const rows = [];
  $('a[href*="/software/p/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.includes("#reviews")) return;
    let abs;
    try {
      abs = new URL(href, "https://slashdot.org").href;
    } catch {
      return;
    }
    const key = abs.split("?")[0].toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const name = $(el).text().trim().split("\n")[0].trim();
    if (!isLikelyB2BSoftwareName(name)) return;
    rows.push({
      name,
      website: abs.split("?")[0],
      sourceTag: "Slashdot",
      rawMetadata: { slashdotUrl: abs.split("?")[0], category: pathLabel },
    });
  });
  return rows;
}

/** @param {string} html @param {string} pathLabel */
export function extractSaaSHubListings(html, pathLabel) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const rows = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let abs;
    try {
      abs = new URL(href, "https://www.saashub.com").href;
    } catch {
      return;
    }
    if (!abs.includes("saashub.com/")) return;
    let pathname = "";
    try {
      pathname = new URL(abs).pathname;
    } catch {
      return;
    }
    if (
      pathname.startsWith("/best-") ||
      pathname.startsWith("/category/") ||
      pathname.startsWith("/tag/") ||
      pathname.startsWith("/register") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/experts") ||
      pathname.startsWith("/startups") ||
      pathname === "/" ||
      pathname.includes("#")
    ) {
      return;
    }
    const slug = pathname.replace(/^\/|\/$/g, "");
    if (!slug || slug.includes("/") || slug.length < 2) return;
    const key = slug.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const name = $(el).text().trim().split("\n")[0].trim();
    if (!isLikelyB2BSoftwareName(name)) return;
    const clean = `https://www.saashub.com/${slug}`;
    rows.push({
      name,
      website: clean,
      sourceTag: "SaaSHub",
      rawMetadata: { saashubUrl: clean, category: pathLabel },
    });
  });
  return rows;
}

/** @param {string} html @param {string} pathLabel */
export function extractAlternativeToListings(html, pathLabel) {
  const $ = cheerio.load(html);
  const seen = new Set();
  const rows = [];
  $('a[href*="/software/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !href.includes("/about")) return;
    let abs;
    try {
      abs = new URL(href, "https://alternativeto.net").href;
    } catch {
      return;
    }
    if (!abs.includes("alternativeto.net/software/")) return;
    const key = abs.split("?")[0].toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const name =
      $(el).closest("article, li, div").find("h2, h3").first().text().trim() ||
      $(el).text().trim().split("\n")[0].trim();
    if (!isLikelyB2BSoftwareName(name)) return;
    rows.push({
      name: name.slice(0, 120),
      website: abs.split("?")[0],
      sourceTag: "AlternativeTo",
      rawMetadata: { alternativeToUrl: abs.split("?")[0], category: pathLabel },
    });
  });
  return rows;
}
