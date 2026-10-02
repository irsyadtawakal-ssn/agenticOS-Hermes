import { auditRiskyActions } from './audit.js';
import type { Db } from './db.js';
import { localStamp } from './kanbanActions.js';

/** Dogfooding evidence for the F1 release gate (PRD §14.1). */
export interface ExecutionRow {
  source: string;
  status: string;
  claimed_at: string;
  scheduled_instant: string | null;
  delivery_outcome: string | null;
}

export interface DayBriefing {
  day: string;
  morningOn: boolean;
  delivered: boolean;
  late: boolean;
}

export interface DogfoodReport {
  from: string;
  to: string;
  briefing: { onDays: number; delivered: number; rate: number | null; perDay: DayBriefing[] };
  security: { checked: number; violations: number };
  approvals: { decided: number; medianMinutes: number | null };
  adoption: { activeDays: number };
  gate: { enoughData: boolean; briefingOk: boolean | null; securityOk: boolean };
}

const DAY_MS = 86_400_000;
const LATE_MS = 5 * 60_000;
const GATE_DAYS = 14;

function dayOf(ms: number, timeZone: string): string {
  const s = localStamp(ms, timeZone);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function hourOf(ms: number, timeZone: string): number {
  return Number(localStamp(ms, timeZone).slice(9, 11));
}

/** Records that Core (hence the PC) was on during this local hour. */
export function markUptime(db: Db, now: number, timeZone: string): void {
  db.prepare('INSERT OR IGNORE INTO uptime (day, hour) VALUES (?, ?)').run(dayOf(now, timeZone), hourOf(now, timeZone));
}

export function briefingDays(execs: ExecutionRow[], mornings: Set<string>, days: string[], timeZone: string): DayBriefing[] {
  return days.map((day) => {
    let delivered = false;
    let late = false;
    for (const e of execs) {
      if (e.source !== 'builtin' || !e.scheduled_instant) continue;
      const slot = Date.parse(e.scheduled_instant);
      if (dayOf(slot, timeZone) !== day || e.status !== 'completed' || e.delivery_outcome !== 'delivered') continue;
      delivered = true;
      late = Date.parse(e.claimed_at) - slot > LATE_MS;
    }
    return { day, morningOn: mornings.has(day) || delivered, delivered, late };
  });
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function buildDogfoodReport(db: Db, execs: ExecutionRow[], days: number, now: number, timeZone: string): DogfoodReport {
  const dayList = Array.from({ length: days }, (_, i) => dayOf(now - (days - 1 - i) * DAY_MS, timeZone));
  const since = now - days * DAY_MS;
  const mornings = new Set(
    (db.prepare('SELECT day FROM uptime WHERE hour >= 7 AND hour < 12 AND day >= ?').all(dayList[0]) as Array<{ day: string }>).map((r) => r.day),
  );
  const perDay = briefingDays(execs, mornings, dayList, timeZone);
  const onDays = perDay.filter((d) => d.morningOn).length;
  const delivered = perDay.filter((d) => d.morningOn && d.delivered).length;
  const rate = onDays > 0 ? delivered / onDays : null;
  const audit = auditRiskyActions(db, since);
  const decided = db
    .prepare(`SELECT created_at, decided_at FROM approvals WHERE decided_at IS NOT NULL AND created_at >= ? AND decided_by NOT IN ('timeout', 'hermes')`)
    .all(since) as Array<{ created_at: number; decided_at: number }>;
  const minutes = decided.map((a) => (a.decided_at - a.created_at) / 60_000);
  const active = new Set(
    (db.prepare(`SELECT ts FROM events WHERE ts >= ? AND mode IN ('telegram', 'tui')`).all(since) as Array<{ ts: number }>).map((r) => dayOf(r.ts, timeZone)),
  );
  return {
    from: dayList[0],
    to: dayList[dayList.length - 1],
    briefing: { onDays, delivered, rate, perDay },
    security: { checked: audit.checked, violations: audit.violations.length },
    approvals: { decided: decided.length, medianMinutes: median(minutes) },
    adoption: { activeDays: active.size },
    gate: { enoughData: onDays >= GATE_DAYS, briefingOk: rate === null ? null : rate >= 0.95, securityOk: audit.violations.length === 0 },
  };
}
