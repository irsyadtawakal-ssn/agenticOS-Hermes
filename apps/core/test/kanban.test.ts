import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { diffTasks, readKanban, type KanbanTask } from '../src/kanban.js';

function fakeKanban(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'aos-kb-')), 'kanban.db');
  const db = new Database(path);
  db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, body TEXT, assignee TEXT, status TEXT, priority INTEGER,
             created_by TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER, workspace_kind TEXT, workspace_path TEXT);
           CREATE TABLE task_runs (id INTEGER PRIMARY KEY, task_id TEXT, profile TEXT, step_key TEXT, status TEXT,
             started_at INTEGER, ended_at INTEGER, outcome TEXT);`);
  db.prepare("INSERT INTO tasks VALUES ('t_1','Riset','b','researcher','done',0,'user',100,110,150,'dir','D:\\w\\1')").run();
  db.prepare("INSERT INTO tasks VALUES ('t_2','Draft','b','content','ready',0,'user',200,NULL,NULL,'scratch',NULL)").run();
  db.prepare("INSERT INTO task_runs VALUES (1,'t_1','researcher',NULL,'done',110,150,'completed')").run();
  db.close();
  return path;
}

describe('readKanban', () => {
  it('reads tasks newest first and runs', () => {
    const snap = readKanban(fakeKanban());
    expect(snap.tasks.map((t) => t.id)).toEqual(['t_2', 't_1']);
    expect(snap.tasks[1]).toEqual({
      id: 't_1', title: 'Riset', assignee: 'researcher', status: 'done', created_at: 100, started_at: 110,
      completed_at: 150, workspace_kind: 'dir', workspace_path: 'D:\\w\\1',
    });
    expect(snap.runs).toEqual([{ id: 1, task_id: 't_1', profile: 'researcher', status: 'done', started_at: 110, ended_at: 150, outcome: 'completed' }]);
  });
  it('returns an empty snapshot when the board does not exist', () => {
    expect(readKanban(join(tmpdir(), 'no-such-aos-kanban.db'))).toEqual({ tasks: [], runs: [] });
  });
});

describe('diffTasks', () => {
  const t = (id: string, status: string): KanbanTask => ({
    id, title: id, assignee: null, status, created_at: 1, started_at: null, completed_at: null, workspace_kind: null, workspace_path: null,
  });
  it('reports added, removed and status changes', () => {
    expect(diffTasks([t('a', 'ready'), t('b', 'ready')], [t('a', 'running'), t('c', 'todo')])).toEqual([
      { id: 'a', change: 'status', status: 'running', previous: 'ready' },
      { id: 'c', change: 'added', status: 'todo' },
      { id: 'b', change: 'removed', previous: 'ready' },
    ]);
  });
});
