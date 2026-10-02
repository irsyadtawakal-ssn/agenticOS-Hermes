import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  profile TEXT NOT NULL,
  session_id TEXT,
  task_id TEXT,
  mode TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_profile_ts ON events(profile, ts);
CREATE INDEX IF NOT EXISTS idx_events_task_ts ON events(task_id, ts);
CREATE TABLE IF NOT EXISTS agent_state (
  profile TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  task_id TEXT,
  session_id TEXT,
  detail TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS llm_usage (
  router_id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  provider TEXT,
  model TEXT,
  profile TEXT NOT NULL,
  task_id TEXT,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  status TEXT
);
CREATE INDEX IF NOT EXISTS idx_usage_ts ON llm_usage(ts);
CREATE TABLE IF NOT EXISTS cursors (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  profile TEXT NOT NULL,
  task_id TEXT,
  session_id TEXT,
  tool_call_id TEXT,
  mode TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  args_preview TEXT NOT NULL,
  args_hash TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  decided_by TEXT,
  decided_at INTEGER,
  instruction TEXT,
  token_expires_at INTEGER,
  resumed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_approvals_match ON approvals(task_id, tool, args_hash, status);
CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, created_at);
CREATE TABLE IF NOT EXISTS office_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_sessions (
  stored_id TEXT PRIMARY KEY,
  profile TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

export function migrate(db: Db): void {
  db.exec(SCHEMA);
}

export function openCoreDb(path: string): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}
