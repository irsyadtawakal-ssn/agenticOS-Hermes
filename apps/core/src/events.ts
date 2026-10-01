import { z } from 'zod';
import type { Db } from './db.js';
import { projectState } from './state.js';

export const EVENT_TYPES = ['session.started', 'session.ended', 'llm.started', 'llm.finished', 'tool.started', 'tool.finished'] as const;

export const EventSchema = z.object({
  id: z.string().min(8).max(64),
  ts: z.number().int().nonnegative(),
  type: z.enum(EVENT_TYPES),
  profile: z.string().min(1).max(64),
  session_id: z.string().max(128).nullable().optional(),
  task_id: z.string().max(64).nullable().optional(),
  mode: z.string().min(1).max(32),
  payload: z.record(z.string(), z.unknown()),
});

export type AosEvent = z.infer<typeof EventSchema>;

export function ingestEvents(db: Db, raw: unknown): { accepted: AosEvent[]; inserted: number; duplicates: number; rejected: number } {
  if (!Array.isArray(raw) || raw.length > 500) throw new Error('events must be an array of at most 500 items');
  const insert = db.prepare(
    'INSERT OR IGNORE INTO events (id, ts, type, profile, session_id, task_id, mode, payload) VALUES (@id, @ts, @type, @profile, @session_id, @task_id, @mode, @payload)',
  );
  const result = { accepted: [] as AosEvent[], inserted: 0, duplicates: 0, rejected: 0 };
  db.transaction(() => {
    for (const item of raw) {
      const parsed = EventSchema.safeParse(item);
      if (!parsed.success) {
        result.rejected += 1;
        continue;
      }
      const ev = parsed.data;
      const info = insert.run({
        id: ev.id,
        ts: ev.ts,
        type: ev.type,
        profile: ev.profile,
        session_id: ev.session_id ?? null,
        task_id: ev.task_id ?? null,
        mode: ev.mode,
        payload: JSON.stringify(ev.payload),
      });
      if (info.changes === 1) {
        result.inserted += 1;
        result.accepted.push(ev);
        projectState(db, ev);
      } else {
        result.duplicates += 1;
      }
    }
  })();
  return result;
}
