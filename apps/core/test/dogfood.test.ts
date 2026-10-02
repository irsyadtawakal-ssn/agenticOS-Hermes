import { describe, expect, it } from 'vitest';
import { openCoreDb } from '../src/db.js';
import { briefingDays, buildDogfoodReport, type ExecutionRow, markUptime } from '../src/dogfood.js';

const TZ = 'Asia/Jakarta';
const exec = (scheduled: string | null, claimed: string, outcome = 'delivered', source = 'builtin', status = 'completed'): ExecutionRow => ({
  source,
  status,
  claimed_at: claimed,
  scheduled_instant: scheduled,
  delivery_outcome: outcome,
});

describe('briefingDays', () => {
  it('counts scheduled deliveries per local day and flags late ones', () => {
    const execs = [
      exec('2026-10-01T00:00:00+00:00', '2026-10-01T07:00:20+07:00'),
      exec('2026-10-02T00:00:00+00:00', '2026-10-02T07:33:16+07:00'),
      exec(null, '2026-10-02T13:00:17+07:00', 'delivered', 'direct'),
      exec('2026-10-03T00:00:00+00:00', '2026-10-03T07:00:05+07:00', 'failed'),
    ];
    const mornings = new Set(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(briefingDays(execs, mornings, ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'], TZ)).toEqual([
      { day: '2026-10-01', morningOn: true, delivered: true, late: false },
      { day: '2026-10-02', morningOn: true, delivered: true, late: true },
      { day: '2026-10-03', morningOn: true, delivered: false, late: false },
      { day: '2026-10-04', morningOn: false, delivered: false, late: false },
    ]);
  });
});

describe('buildDogfoodReport', () => {
  it('combines briefing rate, audit, approval latency and adoption', () => {
    const db = openCoreDb(':memory:');
    const now = Date.parse('2026-10-03T05:00:00Z'); // 12:00 WIB 3 Okt
    markUptime(db, Date.parse('2026-10-02T01:00:00Z'), TZ); // 08:00 WIB 2 Okt
    markUptime(db, Date.parse('2026-10-03T01:00:00Z'), TZ); // 08:00 WIB 3 Okt
    markUptime(db, Date.parse('2026-10-03T01:10:00Z'), TZ); // jam sama, tidak dobel
    db.prepare(
      `INSERT INTO approvals (id, created_at, profile, task_id, session_id, tool_call_id, mode, rule_id, tool, args_preview, args_hash, reason, status, decided_by, decided_at)
       VALUES ('a1', ?, 'dev', NULL, 's', 'c', 'park', 'git-push', 'terminal', '{}', 'h', NULL, 'denied', 'office', ?)`,
    ).run(Date.parse('2026-10-02T02:00:00Z'), Date.parse('2026-10-02T02:10:00Z'));
    db.prepare(`INSERT INTO events (id, ts, type, profile, session_id, task_id, mode, payload) VALUES ('e1', ?, 'session.started', 'chief', 's', NULL, 'telegram', '{}')`).run(
      Date.parse('2026-10-02T03:00:00Z'),
    );
    const execs = [exec('2026-10-02T00:00:00+00:00', '2026-10-02T07:00:30+07:00')];
    const r = buildDogfoodReport(db, execs, 2, now, TZ);
    expect([r.from, r.to]).toEqual(['2026-10-02', '2026-10-03']);
    expect(r.briefing).toMatchObject({ onDays: 2, delivered: 1, rate: 0.5 });
    expect(r.security).toEqual({ checked: 0, violations: 0 });
    expect(r.approvals).toEqual({ decided: 1, medianMinutes: 10 });
    expect(r.adoption).toEqual({ activeDays: 1 });
    expect(r.gate).toEqual({ enoughData: false, briefingOk: false, securityOk: true });
    expect((db.prepare('SELECT count(*) AS n FROM uptime').get() as { n: number }).n).toBe(2);
  });
});
