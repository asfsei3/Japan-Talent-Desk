/**
 * Thin wrapper around node:sqlite.
 *
 * Zero third-party dependencies is a deliberate choice: the whole platform must
 * be deployable on a plain Node host with `npm start` and no native build step.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { config, rootDir } from "../config/index.js";

// node:sqlite still carries an ExperimentalWarning on Node 22. The npm scripts
// pass `--disable-warning=ExperimentalWarning`; see package.json.

let db = null;
const statementCache = new Map();

export function getDb() {
  if (db) return db;

  mkdirSync(dirname(config.database.file), { recursive: true });
  db = new DatabaseSync(config.database.file);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  return db;
}

export function closeDb() {
  if (!db) return;
  statementCache.clear();
  db.close();
  db = null;
}

function prepare(sql) {
  let statement = statementCache.get(sql);
  if (!statement) {
    statement = getDb().prepare(sql);
    statementCache.set(sql, statement);
  }
  return statement;
}

/** node:sqlite rejects undefined and booleans; normalise them at the boundary. */
function normaliseParams(params) {
  return params.map((value) => {
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value instanceof Date) return value.toISOString();
    return value;
  });
}

export function run(sql, ...params) {
  return prepare(sql).run(...normaliseParams(params));
}

export function get(sql, ...params) {
  return prepare(sql).get(...normaliseParams(params)) ?? null;
}

export function all(sql, ...params) {
  return prepare(sql).all(...normaliseParams(params));
}

export function exec(sql) {
  return getDb().exec(sql);
}

export function transaction(fn) {
  const database = getDb();
  database.exec("BEGIN");
  try {
    const result = fn();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // The transaction was already rolled back by SQLite.
    }
    throw error;
  }
}

export function migrate() {
  const schema = readFileSync(join(rootDir, "src", "db", "schema.sql"), "utf8");
  getDb().exec(schema);
  run(
    "INSERT INTO schema_meta (key, value) VALUES ('migrated_at', ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    new Date().toISOString()
  );
  return { ok: true };
}

/** Convenience for `INSERT ... ON CONFLICT DO UPDATE` upserts. */
export function upsert(table, row, conflictColumns, updateColumns) {
  const columns = Object.keys(row);
  const placeholders = columns.map(() => "?").join(", ");
  const updates = (updateColumns ?? columns.filter((c) => !conflictColumns.includes(c)))
    .map((column) => `${column} = excluded.${column}`)
    .join(", ");

  const sql =
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ` +
    `ON CONFLICT(${conflictColumns.join(", ")}) DO UPDATE SET ${updates || columns[0] + " = " + table + "." + columns[0]}`;

  return run(sql, ...columns.map((column) => row[column]));
}

export default { getDb, closeDb, run, get, all, exec, transaction, migrate, upsert };
