import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { now } from './util.mjs';

export function openDatabase(filename, migrationDirectory = path.resolve('server/migrations')) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  migrate(db, migrationDirectory);
  return db;
}

export function migrate(db, migrationDirectory) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
  const migrations = fs.readdirSync(migrationDirectory).filter((file) => file.endsWith('.sql')).sort();
  for (const file of migrations) {
    const version = Number(file.split('-')[0]);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(migrationDirectory, file), 'utf8');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)').run(version, now());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export const get = (db, sql, params = []) => db.prepare(sql).get(...params) || null;
export const all = (db, sql, params = []) => db.prepare(sql).all(...params);
export const run = (db, sql, params = []) => db.prepare(sql).run(...params);

export function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function closeDatabase(db) {
  if (db?.isOpen) db.close();
}
