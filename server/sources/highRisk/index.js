/**
 * HIGH ToS / account-risk ingestion — DISABLED BY DEFAULT.
 * Merged only when ENABLE_HIGH_TOS_SOURCES=1. See README.md in this folder.
 */

import { isHighTosSourcesEnabled } from "../../lib/highTosEnv.js";
import { readLinkedInExport } from "./linkedinExport.js";

/**
 * @param {object} _brief
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<Array<{ name: string; website: string; sourceTag: string; rawMetadata: object }>>}
 */
export async function searchHighRiskSources(_brief, env) {
  if (!isHighTosSourcesEnabled(env)) return [];
  console.warn(
    "[highRisk] ENABLE_HIGH_TOS_SOURCES=1 — user-provided export ingest only; ToS/account risk is yours."
  );
  try {
    return await readLinkedInExport(env || process.env);
  } catch (e) {
    console.warn(`[highRisk] ingest failed: ${e?.message || e}`);
    return [];
  }
}
