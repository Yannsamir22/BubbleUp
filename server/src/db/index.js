import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrations } from "./migrations.js";

/**
 * Opens the SQLite database (or an in-memory one for ":memory:"),
 * applies pragmas tuned for a chat workload and runs pending migrations.
 */
export function openDatabase(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA temp_store = MEMORY;
    PRAGMA cache_size = -16000;
  `);

  migrate(db);
  return wrap(db);
}

function migrate(db) {
  const current = db.prepare("PRAGMA user_version").get().user_version;
  for (let v = current; v < migrations.length; v++) {
    db.exec("BEGIN");
    try {
      db.exec(migrations[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${v + 1} failed: ${err.message}`);
    }
  }
}

/**
 * Thin helper around node:sqlite with a statement cache and transactions.
 */
function wrap(raw) {
  const cache = new Map();
  const stmt = (sql) => {
    let s = cache.get(sql);
    if (!s) {
      s = raw.prepare(sql);
      cache.set(sql, s);
    }
    return s;
  };
  let depth = 0;

  return {
    raw,
    get: (sql, ...params) => stmt(sql).get(...params),
    all: (sql, ...params) => stmt(sql).all(...params),
    run: (sql, ...params) => stmt(sql).run(...params),
    exec: (sql) => raw.exec(sql),
    /** Runs fn inside a transaction (nested calls use savepoints). */
    tx(fn) {
      const name = `sp${depth}`;
      raw.exec(depth === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${name}`);
      depth++;
      try {
        const result = fn();
        depth--;
        raw.exec(depth === 0 ? "COMMIT" : `RELEASE ${name}`);
        return result;
      } catch (err) {
        depth--;
        raw.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${name}; RELEASE ${name}`);
        throw err;
      }
    },
    close: () => raw.close(),
  };
}
