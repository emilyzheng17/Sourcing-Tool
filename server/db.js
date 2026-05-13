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
    const cols = db.prepare("PRAGMA table_info(companies)").all();
    if (!cols.some((c) => c.name === "is_rejected")) {
      db.exec(`ALTER TABLE companies ADD COLUMN is_rejected INTEGER NOT NULL DEFAULT 0`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_companies_rejected ON companies(is_rejected)`);
  }
  return db;
}

export function upsertCompany({ domain, name, website, data, isSaved }) {
  const d = getDb();
  const row = d.prepare(
    "SELECT id, is_saved, is_rejected, manual_mission_critical, manual_vertically_integrated, manual_proprietary FROM companies WHERE domain = ?"
  ).get(domain);
  const payload = JSON.stringify(data ?? {});
  if (row) {
    const keepSaved = row.is_saved || isSaved ? 1 : 0;
    const keepRejected = row.is_rejected ? 1 : 0;
    d.prepare(
      `UPDATE companies SET name = ?, website = ?, data = ?, is_saved = ?, is_rejected = ?, updated_at = datetime('now') WHERE domain = ?`
    ).run(name ?? null, website ?? null, payload, keepSaved, keepRejected, domain);
    return row.id;
  }
  d.prepare(
    `INSERT INTO companies (domain, name, website, data, is_saved, is_rejected) VALUES (?, ?, ?, ?, ?, 0)`
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

export function setRejected(id, rejected) {
  const d = getDb();
  if (rejected) {
    d.prepare(
      `UPDATE companies SET is_rejected = 1, is_saved = 0, updated_at = datetime('now') WHERE id = ?`
    ).run(id);
  } else {
    d.prepare(`UPDATE companies SET is_rejected = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
  }
}

export function bulkRejectIds(ids) {
  const d = getDb();
  const txn = d.transaction((list) => {
    const upd = d.prepare(
      `UPDATE companies SET is_rejected = 1, is_saved = 0, updated_at = datetime('now') WHERE id = ? AND is_rejected = 0`
    );
    let n = 0;
    for (const id of list) {
      n += upd.run(id).changes;
    }
    return n;
  });
  return txn(ids);
}

export function bulkRestoreRejectedIds(ids) {
  const d = getDb();
  const txn = d.transaction((list) => {
    const upd = d.prepare(
      `UPDATE companies SET is_rejected = 0, updated_at = datetime('now') WHERE id = ? AND is_rejected = 1`
    );
    let n = 0;
    for (const id of list) {
      n += upd.run(id).changes;
    }
    return n;
  });
  return txn(ids);
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

export function listUniverse({ offset = 0, limit = 50, savedOnly = false, rejectedOnly = false }) {
  const d = getDb();
  let where = "WHERE is_rejected = 0";
  if (rejectedOnly) {
    where = "WHERE is_rejected = 1";
  } else if (savedOnly) {
    where = "WHERE is_saved = 1 AND is_rejected = 0";
  }
  const rows = d.prepare(`SELECT * FROM companies ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  const total = d.prepare(`SELECT COUNT(*) as c FROM companies ${where}`).get().c;
  return { rows, total };
}

/** Active companies only (for similarity candidate pool). */
export function listActiveCompanySimilarityStubs() {
  const rows = getDb()
    .prepare(`SELECT id, domain, name, data FROM companies WHERE is_rejected = 0`)
    .all();
  return rows;
}

/** Active rows in default universe list order (for filtered pagination). */
export function iterateActiveUniverseRows() {
  return getDb()
    .prepare(`SELECT * FROM companies WHERE is_rejected = 0 ORDER BY updated_at DESC`)
    .iterate();
}

export function getCompaniesByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return getDb().prepare(`SELECT * FROM companies WHERE id IN (${placeholders})`).all(...ids);
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
    ...data,
    id: row.id,
    domain: row.domain,
    name: row.name || data.name,
    website: row.website || data.website,
    is_saved: !!row.is_saved,
    is_rejected: !!(row.is_rejected ?? 0),
    manual_mission_critical: row.manual_mission_critical,
    manual_vertically_integrated: row.manual_vertically_integrated,
    manual_proprietary: row.manual_proprietary,
  };
  return applyManualOverrides(base, {
    manual_mission_critical: row.manual_mission_critical,
    manual_vertically_integrated: row.manual_vertically_integrated,
    manual_proprietary: row.manual_proprietary,
  });
}
