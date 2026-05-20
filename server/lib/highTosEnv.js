import fs from "fs";
import path from "path";

/** @param {NodeJS.ProcessEnv | undefined} env */
export function isHighTosSourcesEnabled(env) {
  const v = String(env?.ENABLE_HIGH_TOS_SOURCES ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** @param {string} rawPath */
export function resolveLinkedInExportPath(rawPath) {
  const p = String(rawPath || "").trim();
  if (!p) return "";
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

/**
 * @param {NodeJS.ProcessEnv | undefined} env
 * @returns {{ enabled: boolean, path: string | null, fileExists: boolean, ready: boolean }}
 */
export function linkedInExportStatus(env) {
  const e = env || process.env;
  const enabled = isHighTosSourcesEnabled(e);
  const raw = String(e?.LINKEDIN_EXPORT_PATH ?? "").trim();
  const resolved = raw ? resolveLinkedInExportPath(raw) : "";
  const fileExists = !!(resolved && fs.existsSync(resolved));
  return {
    enabled,
    path: raw || null,
    fileExists,
    ready: enabled && fileExists,
  };
}
