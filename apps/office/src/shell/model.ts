import { activityLabel, PROFILES, PROFILE_TIERS } from '../hermes/labels.ts';

export type Profile = (typeof PROFILES)[number];

// Mirrors infra/profiles/roster.yaml.
export const TIERS = PROFILE_TIERS;

export const KANBAN_COLUMNS = ['triage', 'todo', 'ready', 'running', 'blocked', 'review', 'done'] as const;
export type KanbanColumn = (typeof KANBAN_COLUMNS)[number];

// Mirrors apps/core/src/kanbanActions.ts planMove.
export function canMove(from: string, to: string): boolean {
  if (from === 'triage') return false;
  if (to === 'ready') return from === 'blocked' || from === 'todo';
  if (to === 'blocked') return from === 'todo' || from === 'ready' || from === 'running';
  if (to === 'archived') return from !== 'archived';
  return false;
}

export function applyKanbanChanges(changes: unknown[]): 'refetch' | 'same' {
  return changes.length > 0 ? 'refetch' : 'same';
}

export interface CoreEventLike {
  id: string;
  ts: number;
  type: string;
  profile: string;
  mode: string;
  payload: Record<string, unknown>;
}

export interface ActivityItem {
  id: string;
  ts: number;
  text: string;
  status: string;
}

export type ActivityLog = Record<string, ActivityItem[]>;

export function activityLine(ev: CoreEventLike): { ts: number; text: string; status: string } | null {
  const p = ev.payload ?? {};
  const tool = typeof p.tool === 'string' ? p.tool : '?';
  if (ev.type === 'tool.started') return { ts: ev.ts, text: activityLabel(tool, p.args_preview), status: 'mulai' };
  if (ev.type === 'tool.finished') {
    const ms = typeof p.duration_ms === 'number' ? ` (${p.duration_ms} ms)` : '';
    return { ts: ev.ts, text: `${tool} selesai${ms}`, status: typeof p.status === 'string' ? p.status : 'ok' };
  }
  if (ev.type === 'breaker.tripped') return { ts: ev.ts, text: `Circuit breaker: ${String(p.reason ?? '')}`, status: 'breaker' };
  return null;
}

export function pushActivity(log: ActivityLog, events: CoreEventLike[], max = 100): ActivityLog {
  const next: ActivityLog = { ...log };
  for (const ev of events) {
    const line = activityLine(ev);
    if (!line) continue;
    next[ev.profile] = [{ id: ev.id, ...line }, ...(next[ev.profile] ?? [])].slice(0, max);
  }
  return next;
}

export function todayCost<T extends { cost_usd: number }>(daily: T[]): number {
  return daily.length ? daily[daily.length - 1].cost_usd : 0;
}

export function formatUsd(n: number): string {
  return `$${(Math.floor(n * 100) / 100).toFixed(2)}`;
}

const BARS = '▁▂▃▄▅▆▇█';

export function sparkline(values: number[]): string {
  const max = Math.max(...values, 0);
  return values.map((v) => (max === 0 ? BARS[0] : BARS[Math.round((v / max) * (BARS.length - 1))])).join('');
}

export type KeyAction =
  | { type: 'focus'; profile: Profile }
  | { type: 'approvals' }
  | { type: 'kanban' }
  | { type: 'close' }
  | { type: 'chat' }
  | { type: 'chat_all' }
  | { type: 'settings' };

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
  target: unknown;
}

function typing(target: unknown): boolean {
  const t = target as { tagName?: string; isContentEditable?: boolean } | null;
  return !!t && (t.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(String(t.tagName)));
}

export function keyAction(e: KeyLike): KeyAction | null {
  if (e.key === 'Escape') return { type: 'close' };
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') return { type: 'chat' };
  if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return null;
  const index = '1234567890'.indexOf(e.key);
  if (e.key.length === 1 && index >= 0 && index < PROFILES.length) return { type: 'focus', profile: PROFILES[index] };
  if (e.key.toLowerCase() === 'a') return { type: 'approvals' };
  if (e.key.toLowerCase() === 'b') return { type: 'kanban' };
  if (e.key.toLowerCase() === 's') return { type: 'settings' };
  if (e.shiftKey && e.key.toLowerCase() === 'c') return { type: 'chat_all' };
  if (e.key.toLowerCase() === 'c') return { type: 'chat' };
  return null;
}
