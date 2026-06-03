import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DB_FILE, DATA_ROOT, DATA_USERS_ROOT } from "../config";

const ensureDir = (dirPath: string): void => {
  fs.mkdirSync(dirPath, { recursive: true });
};

export const initDb = (): DatabaseSync => {
  ensureDir(DATA_ROOT);
  ensureDir(DATA_USERS_ROOT);
  ensureDir(path.dirname(DATA_DB_FILE));

  const db = new DatabaseSync(DATA_DB_FILE);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT NOT NULL UNIQUE,
      data_dir TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      preferred_material_id TEXT,
      token_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone);");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sms_send_log (
      phone TEXT NOT NULL,
      ip TEXT NOT NULL,
      scene TEXT NOT NULL,
      ts INTEGER NOT NULL,
      PRIMARY KEY (phone, ts)
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_sms_send_log_ip_ts ON sms_send_log (ip, ts);");

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_auth_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      user_id TEXT,
      phone_mask TEXT,
      ip TEXT,
      ua TEXT,
      reason TEXT,
      ts INTEGER NOT NULL
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_audit_auth_log_ts ON audit_auth_log (ts);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_audit_auth_log_user ON audit_auth_log (user_id, ts);");

  return db;
};
