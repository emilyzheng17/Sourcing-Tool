/**
 * Frontier — cursor-based crawl state management.
 *
 * Stores and retrieves pagination cursors so adapters can resume
 * after interruption. Backed by the `expansion_cursors` table in SQLite.
 */

import { getDb } from "../db.js";

/**
 * Ensure the expansion_cursors table exists.
 * Called once during DB init (added to getDb in db.js).
 */
export function ensureFrontierTable() {
  const d = getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS expansion_cursors (
      adapter_id    TEXT NOT NULL,
      cursor_key    TEXT NOT NULL,
      cursor_value  TEXT,
      last_run_at   TEXT,
      items_discovered INTEGER DEFAULT 0,
      status        TEXT DEFAULT 'PENDING',
      metadata      TEXT DEFAULT '{}',
      PRIMARY KEY (adapter_id, cursor_key)
    );
    CREATE INDEX IF NOT EXISTS idx_ec_adapter ON expansion_cursors(adapter_id);
    CREATE INDEX IF NOT EXISTS idx_ec_status ON expansion_cursors(status);
  `);
}

/**
 * Get the current cursor for an adapter + key pair.
 * @param {string} adapterId
 * @param {string} cursorKey - e.g. "page", "offset", "category:erp"
 * @returns {{ cursorValue: string|null, itemsDiscovered: number, status: string, metadata: object }|null}
 */
export function getCursor(adapterId, cursorKey) {
  const row = getDb()
    .prepare("SELECT * FROM expansion_cursors WHERE adapter_id = ? AND cursor_key = ?")
    .get(adapterId, cursorKey);
  if (!row) return null;
  let metadata = {};
  try { metadata = JSON.parse(row.metadata || "{}"); } catch { /* */ }
  return {
    cursorValue: row.cursor_value,
    itemsDiscovered: row.items_discovered || 0,
    status: row.status,
    metadata,
  };
}

/**
 * Save or update a cursor position.
 * @param {string} adapterId
 * @param {string} cursorKey
 * @param {object} update
 * @param {string|null} [update.cursorValue]
 * @param {number} [update.itemsDiscovered]
 * @param {string} [update.status] - "PENDING" | "RUNNING" | "DONE" | "FAILED"
 * @param {object} [update.metadata]
 */
export function saveCursor(adapterId, cursorKey, update) {
  const d = getDb();
  const existing = d
    .prepare("SELECT 1 FROM expansion_cursors WHERE adapter_id = ? AND cursor_key = ?")
    .get(adapterId, cursorKey);

  if (existing) {
    const sets = ["last_run_at = datetime('now')"];
    const vals = [];
    if (update.cursorValue !== undefined) {
      sets.push("cursor_value = ?");
      vals.push(update.cursorValue);
    }
    if (update.itemsDiscovered !== undefined) {
      sets.push("items_discovered = ?");
      vals.push(update.itemsDiscovered);
    }
    if (update.status !== undefined) {
      sets.push("status = ?");
      vals.push(update.status);
    }
    if (update.metadata !== undefined) {
      sets.push("metadata = ?");
      vals.push(JSON.stringify(update.metadata));
    }
    vals.push(adapterId, cursorKey);
    d.prepare(
      `UPDATE expansion_cursors SET ${sets.join(", ")} WHERE adapter_id = ? AND cursor_key = ?`
    ).run(...vals);
  } else {
    d.prepare(
      `INSERT INTO expansion_cursors (adapter_id, cursor_key, cursor_value, items_discovered, status, metadata, last_run_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(
      adapterId,
      cursorKey,
      update.cursorValue ?? null,
      update.itemsDiscovered ?? 0,
      update.status ?? "PENDING",
      JSON.stringify(update.metadata ?? {}),
    );
  }
}

/**
 * Mark all cursors for an adapter as a given status.
 * @param {string} adapterId
 * @param {string} status
 */
export function setAdapterStatus(adapterId, status) {
  getDb()
    .prepare("UPDATE expansion_cursors SET status = ?, last_run_at = datetime('now') WHERE adapter_id = ?")
    .run(status, adapterId);
}

/**
 * Reset all cursors for an adapter (for a fresh crawl).
 * @param {string} adapterId
 */
export function resetAdapter(adapterId) {
  getDb()
    .prepare("DELETE FROM expansion_cursors WHERE adapter_id = ?")
    .run(adapterId);
}

/**
 * List all adapters and their aggregate cursor state.
 * @returns {Array<{ adapterId: string, totalItems: number, status: string, lastRunAt: string|null }>}
 */
export function listAdapterStates() {
  return getDb()
    .prepare(`
      SELECT adapter_id,
             SUM(items_discovered) as total_items,
             MAX(last_run_at) as last_run_at,
             CASE
               WHEN COUNT(*) = SUM(CASE WHEN status = 'DONE' THEN 1 ELSE 0 END) THEN 'DONE'
               WHEN SUM(CASE WHEN status = 'RUNNING' THEN 1 ELSE 0 END) > 0 THEN 'RUNNING'
               WHEN SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) > 0 THEN 'PARTIAL'
               ELSE 'PENDING'
             END as status
      FROM expansion_cursors
      GROUP BY adapter_id
    `)
    .all()
    .map((r) => ({
      adapterId: r.adapter_id,
      totalItems: r.total_items || 0,
      status: r.status,
      lastRunAt: r.last_run_at,
    }));
}
