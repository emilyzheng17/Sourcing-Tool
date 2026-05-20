import fs from "fs";

import { normalizeDomain, isLikelyCompanyDomain } from "../../lib/domains.js";
import { resolveLinkedInExportPath } from "../../lib/highTosEnv.js";

/** @param {string} line */
function splitCsvLine(line) {
  const cells = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && c === ",") {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/**
 * Paths to website-like columns from common exports.
 *
 * @param {string[]} header
 */
function guessWebsiteCol(header) {
  const lower = header.map((h) => String(h || "").trim().toLowerCase());
  const candidates = ["company website", "website", "url", "web page", "site"];
  for (const c of candidates) {
    const i = lower.indexOf(c);
    if (i >= 0) return i;
  }
  const hit = lower.findIndex((h) => h.endsWith("url") || h.includes("website"));
  return hit >= 0 ? hit : -1;
}

/**
 * @param {object} raw
 */
function coerceRow(raw, rowIndex) {
  const website =
    typeof raw.website === "string"
      ? raw.website.trim()
      : typeof raw.companyWebsite === "string"
        ? raw.companyWebsite.trim()
        : typeof raw.url === "string"
          ? raw.url.trim()
          : "";
  if (!website || !/^https?:\/\//i.test(website)) return null;
  const domain = normalizeDomain(website);
  if (!isLikelyCompanyDomain(domain)) return null;
  const name =
    typeof raw.name === "string"
      ? raw.name
      : typeof raw.company === "string"
        ? raw.company
        : domain.split(".")[0] || "Unknown";

  return {
    name: name.slice(0, 140),
    website: website.split("?")[0],
    sourceTag: "HighRiskLinkedInExport",
    rawMetadata: { linkedInExportRow: rowIndex + 1 },
  };
}

/**
 * User-supplied CSV or JSON listing companies (offline export / ingestion only).
 *
 * Env: LINKEDIN_EXPORT_PATH — `.json` array of `{ name, website }` or Connections-style CSV with a website column.
 *
 * Cap: LINKEDIN_RISK_MAX_ROWS (default 500)
 *
 * @param {NodeJS.ProcessEnv} env
 */
export async function readLinkedInExport(env) {
  const p = resolveLinkedInExportPath(env?.LINKEDIN_EXPORT_PATH || "");
  if (!p || !fs.existsSync(p)) {
    console.warn("[highRisk] LINKEDIN_EXPORT_PATH missing or file not found; no rows ingested.");
    return [];
  }

  const cap = Math.min(5000, Math.max(1, parseInt(String(env?.LINKEDIN_RISK_MAX_ROWS || "500"), 10) || 500));

  /** @type {Array<{ name: string; website: string; sourceTag: string; rawMetadata: object }>} */
  const out = [];
  const lower = p.toLowerCase();

  if (lower.endsWith(".json")) {
    try {
      const txt = fs.readFileSync(p, "utf8");
      const arr = JSON.parse(txt);
      if (!Array.isArray(arr)) throw new Error("JSON root must be an array");
      for (let i = 0; i < Math.min(arr.length, cap); i++) {
        const row = coerceRow(arr[i] || {}, i);
        if (row) out.push(row);
      }
    } catch (e) {
      console.warn(`[highRisk] JSON parse/read failed: ${e?.message || e}`);
    }
    return out;
  }

  if (!lower.endsWith(".csv")) {
    console.warn("[highRisk] LINKEDIN_EXPORT_PATH must be .csv or .json");
    return out;
  }

  const txt = fs.readFileSync(p, "utf8");
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return out;

  const header = splitCsvLine(lines[0]);
  const websiteCol = guessWebsiteCol(header);
  const exactCompanyIdx = header.findIndex((h) => String(h).toLowerCase().trim() === "company");
  const fuzzyCompanyIdx = header.findIndex((h) => {
    const s = String(h).toLowerCase();
    return /^organization\b/.test(s) || (/company\b/.test(s) && !/email/.test(s));
  });
  const nameCompanyCol = exactCompanyIdx >= 0 ? exactCompanyIdx : fuzzyCompanyIdx >= 0 ? fuzzyCompanyIdx : 0;

  if (websiteCol < 0) {
    console.warn("[highRisk] CSV has no recognizable website column.");
    return out;
  }

  for (let i = 1; i < lines.length && out.length < cap; i++) {
    const cells = splitCsvLine(lines[i]);
    const website = cells[websiteCol]?.trim();
    if (!website || !/^https?:\/\//i.test(website)) continue;
    const domain = normalizeDomain(website);
    if (!isLikelyCompanyDomain(domain)) continue;

    let namePart = "";
    if (nameCompanyCol >= 0 && cells[nameCompanyCol]) namePart = cells[nameCompanyCol].trim();

    const rowObj = coerceRow({ name: namePart, website }, i);
    if (rowObj) out.push(rowObj);
  }

  return out;
}
