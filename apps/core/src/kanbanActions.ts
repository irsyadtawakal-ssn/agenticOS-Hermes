import { join } from 'node:path';
import { PROFILES } from './config.js';

export const MOVE_TARGETS = ['ready', 'blocked', 'archived'] as const;
export type MoveTarget = (typeof MOVE_TARGETS)[number];

export type Plan = { args: string[] } | { error: string };

/** Office drag & drop → official `hermes kanban` command (ADR-02). The note always travels as data. */
export function planMove(task: { id: string; status: string }, to: string, note: string): Plan {
  const reason = note.trim();
  const refuse = { error: `Kartu berstatus ${task.status} tidak bisa dipindah ke ${to} dari office.` };
  if (task.status === 'triage') return { error: 'Kartu triage perlu diperjelas dulu (minta chief atau pakai `hermes kanban specify`).' };
  if (to === 'ready') {
    if (task.status === 'blocked') return { args: ['kanban', 'unblock', '--reason', reason || 'dilanjutkan owner dari office', task.id] };
    if (task.status === 'todo') return { args: ['kanban', 'promote', task.id, reason || 'dipromosikan owner dari office'] };
    return refuse;
  }
  if (to === 'blocked') {
    if (['todo', 'ready', 'running'].includes(task.status)) return { args: ['kanban', 'block', task.id, reason || 'ditahan owner dari office'] };
    return refuse;
  }
  if (to === 'archived') {
    return task.status === 'archived' ? refuse : { args: ['kanban', 'archive', task.id] };
  }
  return refuse;
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'task';
}

export function planCreate(
  input: { title?: unknown; assignee?: unknown; body?: unknown },
  workspacesRoot: string,
  stamp: string,
): { args: string[]; workspace: string } | { error: string } {
  const title = String(input.title ?? '').trim().slice(0, 80);
  if (!title) return { error: 'Judul wajib diisi.' };
  const assignee = String(input.assignee ?? '');
  if (!(PROFILES as readonly string[]).includes(assignee)) return { error: `assignee harus salah satu dari ${PROFILES.join(', ')}.` };
  const workspace = join(workspacesRoot, `${stamp}-${slugify(title)}`);
  const body = String(input.body ?? '');
  return { workspace, args: ['kanban', 'create', '--assignee', assignee, `--body=${body}`, '--workspace', `dir:${workspace}`, '--', title] };
}
