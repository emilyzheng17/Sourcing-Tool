import { getDb } from "../db.js";

const FAILURE_TTL_DAYS = 1;

/**
 * Retrieve a cached entry if it exists and is still fresh.
 * @param {string} key - Cache key (e.g. "fetch:https://...")
 * @param {number} ttlDays - Max age in days for successful entries
 * @returns {{ ok: boolean, payload: any } | null}
 */
export function getCached(key, ttlDays) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT ok, payload, julianday('now') - julianday(fetched_at) AS age_days FROM http_cache WHERE cache_key = ?`
    )
    .get(key);
  if (!row) return null;
  const maxAge = row.ok ? ttlDays : FAILURE_TTL_DAYS;
  if (row.age_days > maxAge) return null;
  let payload = null;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    payload = row.payload;
  }
  return { ok: !!row.ok, payload };
}

/**
 * Store (or replace) a cache entry.
 * @param {string} key - Cache key
 * @param {string} type - Category (e.g. "fetch", "brave", "exa", "oc")
 * @param {boolean|number} ok - Whether the fetch succeeded
 * @param {any} payload - Data to persist (will be JSON-stringified)
 */
export function putCached(key, type, ok, payload) {
  const db = getDb();
  const json = typeof payload === "string" ? payload : JSON.stringify(payload);
  db.prepare(
    `INSERT OR REPLACE INTO http_cache (cache_key, cache_type, ok, payload, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
  ).run(key, type, ok ? 1 : 0, json);
}
