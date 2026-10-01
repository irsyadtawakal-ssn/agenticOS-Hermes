import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { attributeTask, costSummary, syncUsage } from '../src/costs.js';
import { openCoreDb } from '../src/db.js';
import type { KanbanRun } from '../src/kanban.js';

function fakeRouter(rows: Array<[number, string, string, string, number, number, number]>): string {
  const path = join(mkdtempSync(join(tmpdir(), 'aos-9r-')), 'data.sqlite');
  const db = new Database(path);
  db.exec(`CREATE TABLE usageHistory (id INTEGER PRIMARY KEY, timestamp TEXT, provider TEXT, model TEXT, connectionId TEXT,
           apiKey TEXT, endpoint TEXT, promptTokens INTEGER, completionTokens INTEGER, cost REAL, status TEXT, tokens TEXT, meta TEXT)`);
  const ins = db.prepare("INSERT INTO usageHistory VALUES (?, ?, 'antigravity', ?, 'c', ?, '/v1/chat/completions', ?, ?, ?, 'ok', '{}', '{}')");
  for (const [id, ts, model, key, p, c, cost] of rows) ins.run(id, ts, model, key, p, c, cost);
  db.close();
  return path;
}

const runs: KanbanRun[] = [
  { id: 1, task_id: 't_a', profile: 'researcher', status: 'done', started_at: 1790000000, ended_at: 1790000100, outcome: 'completed' },
  { id: 2, task_id: 't_b', profile: 'researcher', status: 'running', started_at: 1790000200, ended_at: null, outcome: null },
];

describe('attributeTask', () => {
  it('finds the single run of that profile covering the timestamp', () => {
    expect(attributeTask('researcher', 1790000050_000, runs)).toBe('t_a');
    expect(attributeTask('researcher', 1790000300_000, runs)).toBe('t_b');
    expect(attributeTask('researcher', 1790000150_000, runs)).toBeNull();
    expect(attributeTask('chief', 1790000050_000, runs)).toBeNull();
  });
  it('returns null when two runs of the profile overlap', () => {
    const overlap = [...runs, { ...runs[0], id: 3, task_id: 't_c' }];
    expect(attributeTask('researcher', 1790000050_000, overlap)).toBeNull();
  });
});

const at = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString();

describe('syncUsage + costSummary', () => {
  it('stores known-key rows without the key, advances the cursor, and summarises', () => {
    const router = fakeRouter([
      [1, at(1790000050), 'gemini-3.8-flash', 'k-research', 100, 10, 0.01],
      [2, at(1790000060), 'gemini-3.8-flash', 'k-unknown', 999, 999, 9],
      [3, at(1790000500), 'claude-sonnet-4-6', 'k-chief', 50, 5, 0.02],
    ]);
    const db = openCoreDb(':memory:');
    const keys = new Map([['k-research', 'researcher'], ['k-chief', 'chief']]);
    expect(syncUsage(db, router, keys, runs)).toBe(2);
    expect(syncUsage(db, router, keys, runs)).toBe(0);
    const stored = db.prepare('SELECT * FROM llm_usage ORDER BY router_id').all() as Array<Record<string, unknown>>;
    expect(stored.map((r) => [r.router_id, r.profile, r.task_id])).toEqual([[1, 'researcher', 't_a'], [3, 'chief', null]]);
    expect(JSON.stringify(stored)).not.toContain('k-research');
    const summary = costSummary(db, 0, Date.parse('2027-01-01T00:00:00Z'));
    expect(summary.total).toEqual({ calls: 2, prompt_tokens: 150, completion_tokens: 15, cost_usd: 0.03 });
    expect(summary.byProfile).toEqual([
      { profile: 'chief', calls: 1, prompt_tokens: 50, completion_tokens: 5, cost_usd: 0.02 },
      { profile: 'researcher', calls: 1, prompt_tokens: 100, completion_tokens: 10, cost_usd: 0.01 },
    ]);
    expect(summary.byTask).toEqual([{ task_id: 't_a', calls: 1, prompt_tokens: 100, completion_tokens: 10, cost_usd: 0.01 }]);
    expect(summary.byModel.map((m) => m.model)).toEqual(['claude-sonnet-4-6', 'gemini-3.8-flash']);
  });

  it('returns 0 when the router database is missing', () => {
    expect(syncUsage(openCoreDb(':memory:'), join(tmpdir(), 'no-such-9router.sqlite'), new Map(), [])).toBe(0);
  });
});
