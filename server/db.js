import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import { applyManualOverrides } from "./score.js";
import queueSignal from "./lib/queueSignal.js";
import {
  PUBLIC_EXCLUSION_REASON,
  isPublicExclusionData,
  canRestoreRejectedRow,
  buildCorpusFromCompanyData,
} from "./lib/publicExclusion.js";
import { isPublicListingCandidate } from "./lib/publicCompanySignals.js";

export { PUBLIC_EXCLUSION_REASON };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "..", "universe.db");

let db;

// #region Schema & getDb
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

      CREATE TABLE IF NOT EXISTS http_cache (
        cache_key  TEXT PRIMARY KEY,
        cache_type TEXT NOT NULL,
        ok         INTEGER NOT NULL DEFAULT 1,
        payload    TEXT,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_http_cache_type ON http_cache(cache_type);
    `);
    const cols = db.prepare("PRAGMA table_info(companies)").all();
    if (!cols.some((c) => c.name === "is_rejected")) {
      db.exec(`ALTER TABLE companies ADD COLUMN is_rejected INTEGER NOT NULL DEFAULT 0`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_companies_rejected ON companies(is_rejected)`);

    // ── Overnight Universe Builder schema ──────────────────────────
    const colNames = new Set(cols.map((c) => c.name));
    const addCol = (name, def) => {
      if (!colNames.has(name)) {
        db.exec(`ALTER TABLE companies ADD COLUMN ${name} ${def}`);
      }
    };
    addCol("status", "TEXT DEFAULT 'ACTIVE'");
    addCol("priority_score", "REAL");
    addCol("discovery_batch_id", "TEXT");
    addCol("last_discovered_at", "TEXT");
    addCol("last_enriched_at", "TEXT");
    addCol("last_classified_at", "TEXT");
    addCol("enrichment_attempt_count", "INTEGER DEFAULT 0");
    addCol("error_message", "TEXT");
    addCol("next_retry_at", "TEXT");

    db.exec(`CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_companies_priority ON companies(priority_score)`);

    db.exec(`
      CREATE TABLE IF NOT EXISTS build_jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'RUNNING',
        config TEXT NOT NULL DEFAULT '{}',
        stats TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_build_jobs_status ON build_jobs(status);

      CREATE TABLE IF NOT EXISTS company_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id),
        source_tag TEXT,
        source_url TEXT,
        raw_metadata TEXT DEFAULT '{}',
        discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
        batch_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_company_sources_company ON company_sources(company_id);

      CREATE TABLE IF NOT EXISTS enrichment_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        job_type TEXT NOT NULL,
        thesis_version TEXT,
        priority REAL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING',
        attempt_count INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        next_retry_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_eq_status_priority ON enrichment_queue(status, priority DESC);
      CREATE INDEX IF NOT EXISTS idx_eq_company_job ON enrichment_queue(company_id, job_type);

      CREATE TABLE IF NOT EXISTS company_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        data TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_ce_company ON company_events(company_id);
    `);
  }
  return db;
}
// #endregion

// #region Company CRUD
export function upsertCompany({ domain, name, website, data, isSaved }) {
  const d = getDb();
  const row = d.prepare(
    "SELECT id, is_saved, is_rejected, data, manual_mission_critical, manual_vertically_integrated, manual_proprietary FROM companies WHERE domain = ?"
  ).get(domain);
  const payload = JSON.stringify(data ?? {});
  if (row) {
    const keepSaved = row.is_saved || isSaved ? 1 : 0;
    let keepRejected = row.is_rejected ? 1 : 0;
    if (keepRejected === 0) {
      try {
        const existing = JSON.parse(row.data || "{}");
        if (isPublicExclusionData(existing) || isPublicExclusionData(data)) keepRejected = 1;
      } catch {
        if (isPublicExclusionData(data)) keepRejected = 1;
      }
    }
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

/**
 * @param {object} opts
 * @param {string} [opts.domain]
 * @param {number} [opts.id]
 * @param {string} [opts.source]
 * @param {object} [opts.extraData]
 * @returns {{ id: number, domain: string } | null}
 */
export function markPublicCompanyExcluded({ domain, id, source = "unknown", extraData = {} }) {
  const d = getDb();
  const row =
    (id != null ? getCompanyById(id) : null) ||
    (domain ? getCompanyByDomain(domain) : null);

  const mergedBase = {
    ...extraData,
    exclusionReason: PUBLIC_EXCLUSION_REASON,
    excludedAt: extraData.excludedAt || new Date().toISOString(),
    exclusionSource: source,
    ownership_class: extraData.ownership_class || "Publicly Traded",
  };

  if (!row) {
    if (!domain) return null;
    const payload = JSON.stringify({ ...mergedBase, domain, website: extraData.website || `https://${domain}` });
    const info = d
      .prepare(
        `INSERT INTO companies (domain, name, website, data, is_saved, is_rejected)
         VALUES (?, ?, ?, ?, 0, 1)`
      )
      .run(domain, extraData.name ?? null, extraData.website ?? `https://${domain}`, payload);
    return { id: Number(info.lastInsertRowid), domain };
  }

  let data = {};
  try {
    data = JSON.parse(row.data || "{}");
  } catch {
    /* ignore */
  }

  const merged = {
    ...data,
    ...mergedBase,
    excludedAt: data.excludedAt || mergedBase.excludedAt,
    ownership_class: mergedBase.ownership_class || data.ownership_class || "Publicly Traded",
  };

  d.prepare(
    `UPDATE companies SET
       is_rejected = 1,
       is_saved = 0,
       data = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(JSON.stringify(merged), row.id);

  return { id: row.id, domain: row.domain };
}

/** @returns {Set<string>} */
export function listPublicExcludedDomains() {
  const rows = getDb()
    .prepare(
      `SELECT domain FROM companies
       WHERE is_rejected = 1
         AND json_extract(data, '$.exclusionReason') = ?`
    )
    .all(PUBLIC_EXCLUSION_REASON);
  return new Set(rows.map((r) => r.domain).filter(Boolean));
}

export function getFreshCompanyByDomain(domain, ttlDays) {
  return getDb()
    .prepare(
      `SELECT * FROM companies
       WHERE domain = ?
         AND updated_at >= datetime('now', ? || ' days')`
    )
    .get(domain, `-${ttlDays}`);
}

export function setSaved(id, saved) {
  getDb().prepare("UPDATE companies SET is_saved = ?, updated_at = datetime('now') WHERE id = ?").run(saved ? 1 : 0, id);
}

/**
 * @param {number} id
 * @param {boolean} rejected
 * @param {{ force?: boolean }} [opts]
 * @returns {{ ok: boolean, refused?: boolean, message?: string }}
 */
export function setRejected(id, rejected, opts = {}) {
  const d = getDb();
  const row = d.prepare("SELECT * FROM companies WHERE id = ?").get(id);
  if (!row) return { ok: false, message: "Company not found" };
  if (rejected) {
    d.prepare(
      `UPDATE companies SET is_rejected = 1, is_saved = 0, updated_at = datetime('now') WHERE id = ?`
    ).run(id);
    return { ok: true };
  }
  if (!canRestoreRejectedRow(row, !!opts.force)) {
    return {
      ok: false,
      refused: true,
      message: "Cannot restore: auto-excluded as publicly listed",
    };
  }
  d.prepare(`UPDATE companies SET is_rejected = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
  return { ok: true };
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

/**
 * @param {number[]} ids
 * @param {{ force?: boolean }} [opts]
 */
export function bulkRestoreRejectedIds(ids, opts = {}) {
  const d = getDb();
  const force = !!opts.force;
  const txn = d.transaction((list) => {
    const sel = d.prepare("SELECT * FROM companies WHERE id = ?");
    const upd = d.prepare(
      `UPDATE companies SET is_rejected = 0, updated_at = datetime('now') WHERE id = ? AND is_rejected = 1`
    );
    let n = 0;
    for (const id of list) {
      const row = sel.get(id);
      if (!row || !canRestoreRejectedRow(row, force)) continue;
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

/** Scan active universe rows and permanently exclude obvious public listings. */
export function rejectPublicListingsBackfill() {
  let scanned = 0;
  let rejected = 0;
  for (const row of iterateActiveUniverseRows()) {
    scanned += 1;
    let data = {};
    try {
      data = JSON.parse(row.data || "{}");
    } catch {
      /* ignore */
    }
    const isPublic =
      data.ownership_class === "Publicly Traded" ||
      isPublicListingCandidate({ combinedText: buildCorpusFromCompanyData(data) });
    if (!isPublic) continue;
    markPublicCompanyExcluded({
      domain: row.domain,
      id: row.id,
      source: "backfill",
      extraData: data,
    });
    rejected += 1;
  }
  return { scanned, rejected };
}

/** Active rows in thesis-score order (for filtered pagination). */
export function iterateActiveUniverseRows() {
  return getDb()
    .prepare(
      `SELECT * FROM companies WHERE is_rejected = 0
       ORDER BY COALESCE(json_extract(data, '$.score'), json_extract(data, '$.thesisScore'), 0) DESC,
                updated_at DESC`
    )
    .iterate();
}

export function getCompaniesByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  return getDb().prepare(`SELECT * FROM companies WHERE id IN (${placeholders})`).all(...ids);
}
// #endregion

// #region Overnight Universe Builder
export function createBuildJob(id, config) {
  const d = getDb();
  d.prepare(
    `INSERT INTO build_jobs (id, status, config, stats) VALUES (?, 'RUNNING', ?, '{}')`
  ).run(id, JSON.stringify(config));
}

export function getBuildJob(id) {
  return getDb().prepare("SELECT * FROM build_jobs WHERE id = ?").get(id);
}

export function listBuildJobs(limit = 20) {
  return getDb()
    .prepare("SELECT * FROM build_jobs ORDER BY created_at DESC LIMIT ?")
    .all(limit);
}

export function updateBuildJobStatus(id, status) {
  getDb()
    .prepare("UPDATE build_jobs SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, id);
}

export function updateBuildJobStats(id, stats) {
  getDb()
    .prepare("UPDATE build_jobs SET stats = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(stats), id);
}

export function upsertDiscoveredCompany({ domain, name, website, batchId, priorityScore }) {
  const d = getDb();
  const row = d.prepare(
    "SELECT id, status, is_saved, is_rejected FROM companies WHERE domain = ?"
  ).get(domain);
  if (row) {
    d.prepare(
      `UPDATE companies SET
         last_discovered_at = datetime('now'),
         discovery_batch_id = COALESCE(?, discovery_batch_id),
         priority_score = COALESCE(?, priority_score),
         updated_at = datetime('now')
       WHERE id = ?`
    ).run(batchId, priorityScore, row.id);
    return row.id;
  }
  const info = d.prepare(
    `INSERT INTO companies (domain, name, website, status, discovery_batch_id, last_discovered_at, priority_score, data)
     VALUES (?, ?, ?, 'DISCOVERED', ?, datetime('now'), ?, '{}')`
  ).run(domain, name ?? null, website ?? null, batchId, priorityScore ?? null);
  return Number(info.lastInsertRowid);
}

export function insertCompanySource({ companyId, sourceTag, sourceUrl, rawMetadata, batchId }) {
  getDb()
    .prepare(
      `INSERT INTO company_sources (company_id, source_tag, source_url, raw_metadata, batch_id)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(companyId, sourceTag, sourceUrl ?? null, JSON.stringify(rawMetadata ?? {}), batchId);
}

export function insertEnrichmentJob({ companyId, jobType, priority, thesisVersion }) {
  const d = getDb();
  const existing = d.prepare(
    "SELECT id FROM enrichment_queue WHERE company_id = ? AND job_type = ? AND status IN ('PENDING','RUNNING')"
  ).get(companyId, jobType);
  if (existing) return existing.id;
  const info = d.prepare(
    `INSERT INTO enrichment_queue (company_id, job_type, priority, thesis_version)
     VALUES (?, ?, ?, ?)`
  ).run(companyId, jobType, priority ?? 0, thesisVersion ?? null);
  queueSignal.emit("enqueued", { companyId, jobType });
  return Number(info.lastInsertRowid);
}

export function claimEnrichmentJobs(jobType, limit = 4) {
  const d = getDb();
  const rows = d.prepare(
    `SELECT eq.*, c.domain, c.name, c.website, c.data, c.priority_score
     FROM enrichment_queue eq
     JOIN companies c ON c.id = eq.company_id
     WHERE eq.status = 'PENDING'
       AND eq.job_type = ?
       AND (eq.next_retry_at IS NULL OR eq.next_retry_at <= datetime('now'))
     ORDER BY eq.priority DESC
     LIMIT ?`
  ).all(jobType, limit);
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    d.prepare(
      `UPDATE enrichment_queue SET status = 'RUNNING' WHERE id IN (${ids.map(() => "?").join(",")})`
    ).run(...ids);
  }
  return rows;
}

export function completeEnrichmentJob(queueId) {
  getDb()
    .prepare("UPDATE enrichment_queue SET status = 'DONE' WHERE id = ?")
    .run(queueId);
}

export function failEnrichmentJob(queueId, errorMsg, maxAttempts = 3) {
  const d = getDb();
  const row = d.prepare("SELECT attempt_count FROM enrichment_queue WHERE id = ?").get(queueId);
  const attempts = (row?.attempt_count ?? 0) + 1;
  if (attempts >= maxAttempts) {
    d.prepare(
      "UPDATE enrichment_queue SET status = 'FAILED', attempt_count = ?, error = ? WHERE id = ?"
    ).run(attempts, errorMsg, queueId);
  } else {
    const backoffMin = Math.pow(5, attempts);
    d.prepare(
      `UPDATE enrichment_queue
       SET status = 'PENDING', attempt_count = ?, error = ?,
           next_retry_at = datetime('now', '+' || ? || ' minutes')
       WHERE id = ?`
    ).run(attempts, errorMsg, backoffMin, queueId);
  }
}

export function updateCompanyStatus(id, status, extraCols = {}) {
  const d = getDb();
  const sets = ["status = ?", "updated_at = datetime('now')"];
  const vals = [status];
  for (const [col, val] of Object.entries(extraCols)) {
    sets.push(`${col} = ?`);
    vals.push(val);
  }
  vals.push(id);
  d.prepare(`UPDATE companies SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
}

export function insertCompanyEvent(companyId, eventType, data = {}) {
  getDb()
    .prepare("INSERT INTO company_events (company_id, event_type, data) VALUES (?, ?, ?)")
    .run(companyId, eventType, JSON.stringify(data));
}

export function getEnrichmentQueueStats(batchId) {
  const d = getDb();
  const rows = d.prepare(
    `SELECT eq.status, COUNT(*) as cnt
     FROM enrichment_queue eq
     JOIN companies c ON c.id = eq.company_id
     WHERE c.discovery_batch_id = ?
     GROUP BY eq.status`
  ).all(batchId);
  const stats = {};
  for (const r of rows) stats[r.status] = r.cnt;
  return stats;
}
// #endregion

// #region Row mapping
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
// #endregion

// #region Queue helpers
export function countPendingJobs(batchId) {
  return getDb().prepare(
    `SELECT COUNT(*) as cnt FROM enrichment_queue eq
     JOIN companies c ON c.id = eq.company_id
     WHERE c.discovery_batch_id = ? AND eq.status IN ('PENDING','RUNNING')`
  ).get(batchId).cnt;
}
// #endregion
