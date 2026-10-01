import { PROFILES } from './config.js';
import type { Db } from './db.js';
import type { AosEvent } from './events.js';

export type AgentStateName = 'idle' | 'thinking' | 'typing' | 'reading' | 'running' | 'offline';

export interface AgentState {
  profile: string;
  state: AgentStateName;
  task_id: string | null;
  session_id: string | null;
  detail: string | null;
  updated_at: number | null;
}

const CATEGORY_STATE: Record<string, AgentStateName> = { read: 'reading', write: 'typing', run: 'running' };

export function nextState(ev: AosEvent): { state: AgentStateName; detail: string | null } {
  const p = ev.payload as Record<string, unknown>;
  switch (ev.type) {
    case 'llm.started':
      return { state: 'thinking', detail: typeof p.model === 'string' ? p.model : null };
    case 'tool.started':
      return { state: CATEGORY_STATE[String(p.category)] ?? 'thinking', detail: typeof p.tool === 'string' ? p.tool : null };
    case 'tool.finished':
      return { state: 'thinking', detail: typeof p.tool === 'string' ? p.tool : null };
    default:
      return { state: 'idle', detail: null };
  }
}

export function projectState(db: Db, ev: AosEvent): void {
  const next = nextState(ev);
  db.prepare(
    `INSERT INTO agent_state (profile, state, task_id, session_id, detail, updated_at)
     VALUES (@profile, @state, @task_id, @session_id, @detail, @ts)
     ON CONFLICT(profile) DO UPDATE SET state = excluded.state, task_id = excluded.task_id,
       session_id = excluded.session_id, detail = excluded.detail, updated_at = excluded.updated_at
     WHERE excluded.updated_at >= agent_state.updated_at`,
  ).run({ profile: ev.profile, state: next.state, task_id: ev.task_id ?? null, session_id: ev.session_id ?? null, detail: next.detail, ts: ev.ts });
}

export function listAgentStates(db: Db): AgentState[] {
  const rows = db.prepare('SELECT profile, state, task_id, session_id, detail, updated_at FROM agent_state').all() as AgentState[];
  const byProfile = new Map(rows.map((r) => [r.profile, r]));
  const known: AgentState[] = PROFILES.map(
    (profile) => byProfile.get(profile) ?? { profile, state: 'offline', task_id: null, session_id: null, detail: null, updated_at: null },
  );
  const extra = rows.filter((r) => !(PROFILES as readonly string[]).includes(r.profile));
  return [...known, ...extra];
}
