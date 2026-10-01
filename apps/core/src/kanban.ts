import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';

export interface KanbanTask {
  id: string;
  title: string;
  assignee: string | null;
  status: string;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  workspace_kind: string | null;
  workspace_path: string | null;
}

export interface KanbanRun {
  id: number;
  task_id: string;
  profile: string | null;
  status: string;
  started_at: number | null;
  ended_at: number | null;
  outcome: string | null;
}

export interface KanbanSnapshot {
  tasks: KanbanTask[];
  runs: KanbanRun[];
}

export interface KanbanChange {
  id: string;
  change: 'added' | 'removed' | 'status';
  status?: string;
  previous?: string;
}

export function readKanban(path: string): KanbanSnapshot {
  if (!existsSync(path)) return { tasks: [], runs: [] };
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const tasks = db
      .prepare(
        `SELECT id, title, assignee, status, created_at, started_at, completed_at, workspace_kind, workspace_path
         FROM tasks ORDER BY created_at DESC LIMIT 500`,
      )
      .all() as KanbanTask[];
    const runs = db
      .prepare('SELECT id, task_id, profile, status, started_at, ended_at, outcome FROM task_runs ORDER BY id DESC LIMIT 2000')
      .all() as KanbanRun[];
    return { tasks, runs };
  } finally {
    db.close();
  }
}

export function diffTasks(prev: KanbanTask[], next: KanbanTask[]): KanbanChange[] {
  const before = new Map(prev.map((t) => [t.id, t]));
  const after = new Map(next.map((t) => [t.id, t]));
  const changes: KanbanChange[] = [];
  for (const task of next) {
    const old = before.get(task.id);
    if (!old) changes.push({ id: task.id, change: 'added', status: task.status });
    else if (old.status !== task.status) changes.push({ id: task.id, change: 'status', status: task.status, previous: old.status });
  }
  for (const task of prev) {
    if (!after.has(task.id)) changes.push({ id: task.id, change: 'removed', previous: task.status });
  }
  return changes;
}
