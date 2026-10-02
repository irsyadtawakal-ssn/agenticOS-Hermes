import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Db } from './db.js';
import type { KanbanRun } from './kanban.js';

export interface CostTotals {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
}

export interface CostSummary {
  since: number;
  until: number;
  total: CostTotals;
  byProfile: Array<CostTotals & { profile: string }>;
  byModel: Array<CostTotals & { model: string }>;
  byTask: Array<CostTotals & { task_id: string }>;
}

interface UsageRow {
  id: number;
  timestamp: string;
  provider: string | null;
  model: string | null;
  apiKey: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  cost: number | null;
  status: string | null;
}

const CURSOR = 'router_usage_id';

export function attributeTask(profile: string, tsMs: number, runs: KanbanRun[]): string | null {
  const t = Math.floor(tsMs / 1000);
  const matches = runs.filter(
    (r) => r.profile === profile && r.started_at !== null && r.started_at <= t && (r.ended_at === null || t <= r.ended_at),
  );
  return matches.length === 1 ? matches[0].task_id : null;
}

export function syncUsage(db: Db, routerDbPath: string, keyProfiles: Map<string, string>, runs: KanbanRun[], limit = 2000): number {
  if (!existsSync(routerDbPath)) return 0;
  const cursorRow = db.prepare('SELECT value FROM cursors WHERE name = ?').get(CURSOR) as { value: number } | undefined;
  const cursor = cursorRow?.value ?? 0;
  const router = new Database(routerDbPath, { readonly: true, fileMustExist: true });
  let rows: UsageRow[];
  try {
    rows = router
      .prepare(
        `SELECT id, timestamp, provider, model, apiKey, promptTokens, completionTokens, cost, status
         FROM usageHistory WHERE id > ? ORDER BY id LIMIT ?`,
      )
      .all(cursor, limit) as UsageRow[];
  } finally {
    router.close();
  }
  if (rows.length === 0) return 0;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO llm_usage (router_id, ts, provider, model, profile, task_id, prompt_tokens, completion_tokens, cost_usd, status)
     VALUES (@router_id, @ts, @provider, @model, @profile, @task_id, @prompt_tokens, @completion_tokens, @cost_usd, @status)`,
  );
  let stored = 0;
  db.transaction(() => {
    for (const row of rows) {
      const profile = row.apiKey ? keyProfiles.get(row.apiKey) : undefined;
      if (!profile) continue;
      const ts = Date.parse(row.timestamp);
      const info = insert.run({
        router_id: row.id,
        ts: Number.isNaN(ts) ? 0 : ts,
        provider: row.provider,
        model: row.model,
        profile,
        task_id: Number.isNaN(ts) ? null : attributeTask(profile, ts, runs),
        prompt_tokens: row.promptTokens ?? 0,
        completion_tokens: row.completionTokens ?? 0,
        cost_usd: row.cost ?? 0,
        status: row.status,
      });
      stored += info.changes;
    }
    db.prepare('INSERT INTO cursors (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(
      CURSOR,
      rows[rows.length - 1].id,
    );
  })();
  return stored;
}

const TOTALS = `COUNT(*) AS calls, COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
  COALESCE(SUM(completion_tokens), 0) AS completion_tokens, ROUND(COALESCE(SUM(cost_usd), 0), 6) AS cost_usd`;

export function costSummary(db: Db, sinceMs: number, untilMs: number): CostSummary {
  const where = 'WHERE ts >= @since AND ts < @until';
  const params = { since: sinceMs, until: untilMs };
  return {
    since: sinceMs,
    until: untilMs,
    total: db.prepare(`SELECT ${TOTALS} FROM llm_usage ${where}`).get(params) as CostTotals,
    byProfile: db.prepare(`SELECT profile, ${TOTALS} FROM llm_usage ${where} GROUP BY profile ORDER BY profile`).all(params) as CostSummary['byProfile'],
    byModel: db.prepare(`SELECT model, ${TOTALS} FROM llm_usage ${where} GROUP BY model ORDER BY model`).all(params) as CostSummary['byModel'],
    byTask: db
      .prepare(`SELECT task_id, ${TOTALS} FROM llm_usage ${where} AND task_id IS NOT NULL GROUP BY task_id ORDER BY task_id`)
      .all(params) as CostSummary['byTask'],
  };
}

export interface DailyCost {
  day: string;
  cost_usd: number;
  calls: number;
}

/** Cost per local calendar day for the last `days` days (today last), empty days included. */
export function dailyCosts(db: Db, days: number, now: number, timeZone: string): DailyCost[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayOf = (ms: number) => fmt.format(new Date(ms));
  const buckets = new Map<string, DailyCost>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = dayOf(now - i * 86_400_000);
    buckets.set(day, { day, cost_usd: 0, calls: 0 });
  }
  const rows = db
    .prepare('SELECT ts, cost_usd FROM llm_usage WHERE ts >= ? AND ts <= ?')
    .all(now - (days + 1) * 86_400_000, now) as Array<{ ts: number; cost_usd: number }>;
  for (const row of rows) {
    const bucket = buckets.get(dayOf(row.ts));
    if (!bucket) continue;
    bucket.cost_usd = Math.round((bucket.cost_usd + row.cost_usd) * 1e6) / 1e6;
    bucket.calls += 1;
  }
  return [...buckets.values()];
}
