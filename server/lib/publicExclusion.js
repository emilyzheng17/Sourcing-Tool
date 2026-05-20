/**
 * Durable exclusion for publicly listed companies (reject + block rediscovery).
 */

export const PUBLIC_EXCLUSION_REASON = "public_listing";

/**
 * @param {object} data
 */
export function isPublicExclusionData(data) {
  return data?.exclusionReason === PUBLIC_EXCLUSION_REASON;
}

/**
 * @param {object} row — companies table row
 */
export function isPublicExcludedRow(row) {
  if (!row) return false;
  if (!row.is_rejected) return false;
  let data = {};
  try {
    data = JSON.parse(row.data || "{}");
  } catch {
    /* ignore */
  }
  return isPublicExclusionData(data);
}

/**
 * @param {object} [data]
 * @returns {string}
 */
export function buildCorpusFromCompanyData(data = {}) {
  const parts = [
    data.homepageTextSample,
    data.braveSnippet,
    data.description,
    data.metaDescription,
    data.title,
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

/**
 * @param {object} row
 * @param {boolean} [force]
 */
export function canRestoreRejectedRow(row, force = false) {
  if (!row?.is_rejected) return true;
  if (force) return true;
  return !isPublicExcludedRow(row);
}
