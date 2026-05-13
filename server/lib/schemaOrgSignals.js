/**
 * Homepage schema.org Organization signals (SSR).
 * @param {string} html
 */
export function extractOrganizationSignals(html) {
  /** @type {number|null} */
  let foundedYear = null;
  /** @type {string|null} */
  let employeesBand = null;
  /** @type {string|null} */
  let addressSnippet = null;

  /** @type {string|null} */
  const metaDescription = extractMetaDesc(html);

  const blocks = [];

  /** @param {unknown} node */
  const walkLd = (node) => {
    if (!node || typeof node !== "object") return;
    /** @type {any} */
    const n = node;
    const typesRaw = Array.isArray(n["@type"]) ? n["@type"] : n["@type"] ? [String(n["@type"])] : [];
    const typesLow = typesRaw.map((t) => String(t).toLowerCase());
    const isOrgLike =
      typesLow.some((t) =>
        ["organization", "corporation", "localbusiness", "professionalservice", "business", "softwareapplication"].includes(
          t
        )
      );

    const graph = n["@graph"];
    if (Array.isArray(graph)) {
      for (const g of graph) walkLd(g);
    }

    if (isOrgLike) {
      const fd = n.foundingDate ?? n.yearFounded ?? n.established ?? null;
      if (typeof fd === "string") {
        const y = parseInt(fd.slice(0, 4), 10);
        if (!Number.isNaN(y) && y >= 1850 && y <= 2099 && !foundedYear) foundedYear = y;
      }

      const ne = n.numberOfEmployees;
      const bandFromNe = coerceEmployeesBand(ne);
      if (bandFromNe && !employeesBand) employeesBand = bandFromNe;

      const addr = formatAddressSnippet(n.address);
      if (addr && (!addressSnippet || addr.length > addressSnippet.length)) addressSnippet = addr;
    }
  };

  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    blocks.push(match[1]);
  }

  for (const raw of blocks) {
    const txt = stripTags(raw).trim();
    if (!txt.startsWith("{") && !txt.startsWith("[")) continue;
    try {
      const json = JSON.parse(txt);
      if (Array.isArray(json)) json.forEach(walkLd);
      else walkLd(json);
    } catch {
      continue;
    }
  }

  return { foundedYear, employeesBand, addressSnippet, metaDescription };
}

function extractMetaDesc(html) {
  if (!html || html.length < 20) return null;
  const patterns = [
    /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i,
    /<meta\b[^>]*property=["']og:description["'][^>]*content=["']([^"']+)/i,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      const t = stripTags(m[1]).slice(0, 320);
      if (t.length > 15) return t;
    }
  }
  return null;
}

function stripTags(s) {
  if (!s) return "";
  return s.replace(/\s+/g, " ").trim();
}

/** @param {unknown} addr */
function formatAddressSnippet(addr) {
  if (!addr || typeof addr !== "object") return null;
  const a = addr;
  if (typeof a === "object" && "@type" in a && typeof a["@type"] === "string") {
    const parts = [];
    if (typeof a.streetAddress === "string") parts.push(a.streetAddress);
    if (typeof a.addressLocality === "string") parts.push(a.addressLocality);
    if (typeof a.addressRegion === "string") parts.push(a.addressRegion);
    if (typeof a.postalCode === "string") parts.push(a.postalCode);
    if (typeof a.addressCountry === "string") parts.push(a.addressCountry);
    if (parts.length) return parts.join(", ").slice(0, 220);
  }
  if (typeof a === "string") return stripTags(a).slice(0, 220);
  return null;
}

/** @param {unknown} ne */
function coerceEmployeesBand(ne) {
  if (ne == null) return null;
  if (typeof ne === "number" && Number.isFinite(ne)) {
    const n = ne;
    if (n <= 10) return "1-10";
    if (n <= 50) return "11-50";
    if (n <= 200) return "51-200";
    if (n <= 500) return "201-500";
    if (n <= 1000) return "501-1,000";
    return "1,000+";
  }
  if (typeof ne === "string") {
    const raw = stripTags(ne);
    const mRange = raw.match(/(\d{1,5})\s*[-–]\s*(\d{1,6})/);
    if (mRange) return `${mRange[1]}-${mRange[2]}`;
    const mPlus = raw.match(/(\d{1,5})\+/);
    if (mPlus) return `${mPlus[1]}+`;
    return raw.length <= 120 ? raw : null;
  }
  if (typeof ne === "object" && ne !== null) {
    const o = ne;
    if (typeof o.value === "number") return coerceEmployeesBand(o.value);
    const mn = typeof o.minValue === "number" ? o.minValue : null;
    const mx = typeof o.maxValue === "number" ? o.maxValue : null;
    if (mn != null && mx != null && mx >= mn) return `${mn}-${mx}`;
    if (mn != null) return `${mn}+`;
    if (mx != null) return coerceEmployeesBand(mx);
  }
  return null;
}
