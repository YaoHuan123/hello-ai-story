import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DATA_DB_FILE, DATA_ROOT, DATA_USERS_ROOT } from "../config";

const ensureDir = (dirPath: string): void => {
  fs.mkdirSync(dirPath, { recursive: true });
};

function tableExists(db: DatabaseSync, name: string): boolean {
  const row = db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) as
    | { ok: number }
    | undefined;
  return row?.ok === 1;
}

function migrateUsersDualAuth(db: DatabaseSync): void {
  const cols = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  if (cols.some((c) => c.name === "login_method")) {
    return;
  }

  db.exec(`
    CREATE TABLE users_new (
      id TEXT PRIMARY KEY,
      phone TEXT,
      apple_sub TEXT,
      login_method TEXT NOT NULL DEFAULT 'phone',
      apple_email TEXT,
      data_dir TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      preferred_material_id TEXT,
      token_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO users_new (id, phone, data_dir, role, preferred_material_id, token_version, created_at, login_method)
      SELECT id, phone, data_dir, role, preferred_material_id, token_version, created_at, 'phone' FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_sub ON users(apple_sub) WHERE apple_sub IS NOT NULL;
  `);
}

function migrateCampaignPlanPortions(db: DatabaseSync): void {
  if (!tableExists(db, "campaign_plans")) {
    return;
  }
  const cols = db.prepare("PRAGMA table_info(campaign_plans)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "start_year")) {
    db.exec("ALTER TABLE campaign_plans ADD COLUMN start_year INTEGER");
    db.exec(
      "UPDATE campaign_plans SET start_year = CAST(substr(created_at, 1, 4) AS INTEGER) WHERE start_year IS NULL",
    );
  }
  if (!cols.some((c) => c.name === "reward_pool_balance")) {
    db.exec("ALTER TABLE campaign_plans ADD COLUMN reward_pool_balance INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE campaign_plans SET reward_pool_balance = escrow_balance WHERE reward_pool_balance = 0");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_portion_executions (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      calendar_year INTEGER NOT NULL,
      slot_index INTEGER NOT NULL,
      points_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_date TEXT NOT NULL,
      next_attempt_on TEXT,
      executed_at TEXT,
      fail_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(plan_id, calendar_year, slot_index)
    );
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_plan_portion_due ON plan_portion_executions (status, scheduled_date, next_attempt_on);",
  );
}

function migrateWatchTaskDispatch(db: DatabaseSync): void {
  if (!tableExists(db, "campaign_plans")) {
    return;
  }
  const cols = db.prepare("PRAGMA table_info(campaign_plans)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "distributed_total")) {
    db.exec("ALTER TABLE campaign_plans ADD COLUMN distributed_total INTEGER NOT NULL DEFAULT 0");
  }
  if (!cols.some((c) => c.name === "completed_total")) {
    db.exec("ALTER TABLE campaign_plans ADD COLUMN completed_total INTEGER NOT NULL DEFAULT 0");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_task_assignments (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      publish_id TEXT NOT NULL,
      portion_execution_id TEXT,
      viewer_user_id TEXT NOT NULL,
      distribution_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      completed_at TEXT,
      UNIQUE(viewer_user_id, publish_id, distribution_date)
    );
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_assignments_viewer_date ON watch_task_assignments (viewer_user_id, distribution_date, status);",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_assignments_date ON watch_task_assignments (distribution_date);");

  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_task_backlog (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      publish_id TEXT NOT NULL,
      portion_execution_id TEXT,
      pending_slots INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_watch_backlog_plan ON watch_task_backlog (plan_id);");

  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduler_runs (
      run_key TEXT PRIMARY KEY,
      ran_at TEXT NOT NULL
    );
  `);

  const assignmentCols = db.prepare("PRAGMA table_info(watch_task_assignments)").all() as { name: string }[];
  if (assignmentCols.length > 0) {
    if (!assignmentCols.some((c) => c.name === "pending_reward_points")) {
      db.exec("ALTER TABLE watch_task_assignments ADD COLUMN pending_reward_points INTEGER NOT NULL DEFAULT 0");
    }
    if (!assignmentCols.some((c) => c.name === "reward_settled")) {
      db.exec("ALTER TABLE watch_task_assignments ADD COLUMN reward_settled INTEGER NOT NULL DEFAULT 0");
    }
    if (!assignmentCols.some((c) => c.name === "updated_at")) {
      db.exec("ALTER TABLE watch_task_assignments ADD COLUMN updated_at TEXT");
    }
  }
}

export const initDb = (): DatabaseSync => {
  ensureDir(DATA_ROOT);
  ensureDir(DATA_USERS_ROOT);
  ensureDir(path.dirname(DATA_DB_FILE));

  const db = new DatabaseSync(DATA_DB_FILE);
  db.exec("PRAGMA busy_timeout=5000");
  try {
    const modeRow = db.prepare("PRAGMA journal_mode").get() as { journal_mode?: string } | undefined;
    if (modeRow?.journal_mode?.toLowerCase() !== "wal") {
      db.exec("PRAGMA journal_mode=WAL");
    }
  } catch {
    // 已有其它进程占用库时跳过 WAL 切换，busy_timeout 仍可缓解并发写
  }

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

  migrateUsersDualAuth(db);

  migrateCampaignPlanPortions(db);
  migrateWatchTaskDispatch(db);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      user_id TEXT PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      ref_type TEXT,
      ref_id TEXT,
      note TEXT,
      created_at TEXT NOT NULL
    );
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_ts ON wallet_transactions (user_id, created_at DESC);",
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_plans (
      id TEXT PRIMARY KEY,
      creator_user_id TEXT NOT NULL,
      end_year INTEGER NOT NULL,
      total_points_budget INTEGER NOT NULL,
      escrow_balance INTEGER NOT NULL,
      rewarded_total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_campaign_plans_creator ON campaign_plans (creator_user_id, created_at DESC);",
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS published_videos (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      interview_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      title TEXT NOT NULL,
      reward_points INTEGER NOT NULL,
      quiz_question_count INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT NOT NULL,
      UNIQUE(interview_id, task_id)
    );
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_published_videos_plan ON published_videos (plan_id, published_at DESC);",
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS published_quiz_questions (
      id TEXT PRIMARY KEY,
      publish_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      reference_answer TEXT NOT NULL,
      reward_points INTEGER NOT NULL DEFAULT 2,
      created_at TEXT NOT NULL
    );
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_published_quiz_publish ON published_quiz_questions (publish_id, sort_order);",
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS watch_quiz_sessions (
      id TEXT PRIMARY KEY,
      publish_id TEXT NOT NULL,
      viewer_user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress',
      current_index INTEGER NOT NULL DEFAULT 0,
      questions_json TEXT NOT NULL,
      answers_json TEXT NOT NULL DEFAULT '[]',
      earned_points INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(publish_id, viewer_user_id)
    );
  `);

  return db;
};
