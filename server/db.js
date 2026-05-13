import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { applyManualOverrides } from "./score.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "universe.db");

let db;

export function getDb() {
  if (!db) {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL UNIQUE,
        name TEXT,
        website TEXT,
        data TEXT NOT NULL DEFAULT '{}',
        is_saved INTEGER NOT NULL DEFAULT 0,
        manual_mission_critical TEXT,
        manual_vertically_integrated TEXT,
        manual_proprietary TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain);
      CREATE INDEX IF NOT EXISTS idx_companies_saved ON companies(is_saved);
    `);
  }
  return db;
}

export function upsertCompany({ domain, name, website, data, isSaved }) {
  const d = getDb();
  const row = d.prepare("SELECT id, is_saved, manual_mission_critical, manual_vertically_integrated, manual_proprietary FROM companies WHERE domain = ?").get(domain);
  const payload = JSON.stringify(data ?? {});
  if (row) {
    const keepSaved = row.is_saved || isSaved ? 1 : 0;
    d.prepare(
      `UPDATE companies SET name = ?, website = ?, data = ?, is_saved = ?, updated_at = datetime('now') WHERE domain = ?`
    ).run(name ?? null, website ?? null, payload, keepSaved, domain);
    return row.id;
  }
  d.prepare(
    `INSERT INTO companies (domain, name, website, data, is_saved) VALUES (?, ?, ?, ?, ?)`
  ).run(domain, name ?? null, website ?? null, payload, isSaved ? 1 : 0);
  return d.prepare("SELECT last_insert_rowid() as id").get().id;
}

export function getCompanyById(id) {
  return getDb().prepare("SELECT * FROM companies WHERE id = ?").get(id);
}

export function getCompanyByDomain(domain) {
  return getDb().prepare("SELECT * FROM companies WHERE domain = ?").get(domain);
}

export function setSaved(id, saved) {
  getDb().prepare("UPDATE companies SET is_saved = ?, updated_at = datetime('now') WHERE id = ?").run(saved ? 1 : 0, id);
}

export function setManualClassify(id, { manualMissionCritical, manualVerticallyIntegrated, manualProprietary }) {
  const d = getDb();
  const row = d.prepare("SELECT * FROM companies WHERE id = ?").get(id);
  if (!row) return;
  const mission =
    manualMissionCritical === undefined
      ? row.manual_mission_critical
      : manualMissionCritical === "unset"
        ? null
        : manualMissionCritical;
  const vert =
    manualVerticallyIntegrated === undefined
      ? row.manual_vertically_integrated
      : manualVerticallyIntegrated === "unset"
        ? null
        : manualVerticallyIntegrated;
  const prop =
    manualProprietary === undefined
      ? row.manual_proprietary
      : manualProprietary === "unset"
        ? null
        : manualProprietary;
  d.prepare(
    `UPDATE companies SET manual_mission_critical = ?, manual_vertically_integrated = ?, manual_proprietary = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(mission, vert, prop, id);
}

export function listUniverse({ offset = 0, limit = 50, savedOnly = false }) {
  const d = getDb();
  const where = savedOnly ? "WHERE is_saved = 1" : "";
  const rows = d.prepare(`SELECT * FROM companies ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  const total = d.prepare(`SELECT COUNT(*) as c FROM companies ${where}`).get().c;
  return { rows, total };
}

export function rowToCompany(row) {
  if (!row) return null;
  let data = {};
  try {
    data = JSON.parse(row.data || "{}");
  } catch {
    /* ignore */
  }
  const base = {
    id: row.id,
    domain: row.domain,
    name: row.name || data.name,
    website: row.website || data.website,
    is_saved: !!row.is_saved,
    manual_mission_critical: row.manual_mission_critical,
    manual_vertically_integrated: row.manual_vertically_integrated,
    manual_proprietary: row.manual_proprietary,
    ...data,
  };
  return applyManualOverrides(base, {
    manual_mission_critical: row.manual_mission_critical,
    manual_vertically_integrated: row.manual_vertically_integrated,
    manual_proprietary: row.manual_proprietary,
  });
}
