import { looksLikePersonName } from "./companyTextExtract.js";

const LEADERSHIP_TITLE =
  "Chief Executive Officer|CEO|Chief Technology Officer|CTO|Chief Financial Officer|CFO|Chief Operating Officer|COO|Founder|Co-Founder|Co-founder|President|Vice President|VP|Managing Director|Owner|Principal|Partner|General Manager|Director";

const LEADERSHIP_RE = new RegExp(
  `([A-Z][a-z]+(?:\\s+[A-Z][a-z]+){0,2})\\s*[,|\\-–]?\\s*(${LEADERSHIP_TITLE})`,
  "gi",
);

/**
 * @param {string} text
 * @returns {Array<{ name: string, title: string }>}
 */
export function extractLeadershipFromText(text) {
  const leadership = [];
  if (!text) return leadership;
  let m;
  const seen = new Set();

  while ((m = LEADERSHIP_RE.exec(text)) !== null && leadership.length < 12) {
    const name = m[1]?.trim();
    const title = m[2]?.trim();
    if (!name || name.length < 3 || name.length > 48) continue;
    if (!looksLikePersonName(name)) continue;
    const k = `${name}|${title}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    leadership.push({ name, title });
  }

  const isTheRe =
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+is\s+the\s+(Chief Executive Officer|CEO|Chief Technology Officer|CTO|Chief Financial Officer|CFO|Chief Operating Officer|COO|Founder|Co-Founder|Co-founder|President|Vice President|VP|Managing Director|Owner|Principal|Partner|General Manager|Director)/gi;
  while ((m = isTheRe.exec(text)) !== null && leadership.length < 12) {
    const name = m[1]?.trim();
    const title = m[2]?.trim();
    if (!name || !looksLikePersonName(name)) continue;
    const k = `${name}|${title}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    leadership.push({ name, title });
  }

  return leadership;
}

/**
 * @param {...Array<{ name: string, title: string } | null | undefined>} lists
 * @returns {Array<{ name: string, title: string }>}
 */
export function mergeLeadershipCandidates(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const name = String(item?.name || "").trim();
      const title = String(item?.title || item?.role || "").trim();
      if (!name || !title) continue;
      const k = `${name.toLowerCase()}|${title.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ name, title });
    }
  }
  return out;
}

/**
 * @param {Array<{ name: string, title: string }>} leadership
 * @returns {{ contactName: string, role: string }}
 */
export function pickLeadershipContact(leadership) {
  if (!Array.isArray(leadership) || !leadership.length) {
    return { contactName: "", role: "" };
  }

  const valid = leadership.filter(
    (l) => looksLikePersonName(l.name) && String(l.title || "").trim().length >= 2,
  );
  if (!valid.length) {
    return { contactName: "", role: "" };
  }

  const priority =
    /ceo|founder|co-founder|president|chief executive|managing director|owner|general manager|principal|partner/i;
  const pick = valid.find((l) => priority.test(l.title || "")) || valid[0];
  return { contactName: pick.name || "", role: pick.title || "" };
}
