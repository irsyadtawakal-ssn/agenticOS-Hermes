import { describe, expect, it } from 'vitest';
import { localStamp, planCreate, planMove, slugify } from '../src/kanbanActions.js';

describe('planMove', () => {
  it('maps allowed transitions to the official CLI', () => {
    expect(planMove({ id: 't_1', status: 'blocked' }, 'ready', 'lanjutkan, pakai data Q3')).toEqual({ args: ['kanban', 'unblock', '--reason', 'lanjutkan, pakai data Q3', 't_1'] });
    expect(planMove({ id: 't_1', status: 'blocked' }, 'ready', '')).toEqual({ args: ['kanban', 'unblock', '--reason', 'dilanjutkan owner dari office', 't_1'] });
    expect(planMove({ id: 't_2', status: 'todo' }, 'ready', '')).toEqual({ args: ['kanban', 'promote', 't_2', 'dipromosikan owner dari office'] });
    expect(planMove({ id: 't_3', status: 'running' }, 'blocked', 'tunggu saya')).toEqual({ args: ['kanban', 'block', 't_3', 'tunggu saya'] });
    expect(planMove({ id: 't_4', status: 'done' }, 'archived', '')).toEqual({ args: ['kanban', 'archive', 't_4'] });
  });

  it('refuses unsupported transitions with an Indonesian message', () => {
    expect(planMove({ id: 't_1', status: 'done' }, 'ready', '')).toEqual({ error: 'Kartu berstatus done tidak bisa dipindah ke ready dari office.' });
    expect(planMove({ id: 't_1', status: 'triage' }, 'ready', '')).toMatchObject({ error: expect.stringContaining('triage') });
    expect(planMove({ id: 't_1', status: 'blocked' }, 'blocked', '')).toMatchObject({ error: expect.any(String) });
    expect(planMove({ id: 't_1', status: 'archived' }, 'archived', '')).toMatchObject({ error: expect.any(String) });
    expect(planMove({ id: 't_1', status: 'ready' }, 'running', '')).toMatchObject({ error: expect.any(String) });
  });

  it('keeps notes as data, never flags', () => {
    const plan = planMove({ id: 't_1', status: 'blocked' }, 'ready', '--help') as { args: string[] };
    expect(plan.args).toEqual(['kanban', 'unblock', '--reason', '--help', 't_1']);
  });
});

describe('planCreate', () => {
  it('builds the create command with a permanent workspace', () => {
    const plan = planCreate({ title: 'Riset Kompetitor Postiz!', assignee: 'researcher', body: 'Goal: x' }, 'D:\\ws', '20261002-101500');
    expect(plan).toEqual({
      workspace: 'D:\\ws\\20261002-101500-riset-kompetitor-postiz',
      args: ['kanban', 'create', '--assignee', 'researcher', '--body=Goal: x', '--workspace', 'dir:D:\\ws\\20261002-101500-riset-kompetitor-postiz', '--', 'Riset Kompetitor Postiz!'],
    });
    expect(slugify('  ??? ')).toBe('task');
  });

  it('validates title and assignee', () => {
    expect(planCreate({ title: ' ', assignee: 'dev' }, 'D:\\ws', 's')).toEqual({ error: 'Judul wajib diisi.' });
    expect(planCreate({ title: 'x', assignee: 'hacker' }, 'D:\\ws', 's')).toMatchObject({ error: expect.stringContaining('assignee') });
    const long = planCreate({ title: 'x'.repeat(120), assignee: 'dev' }, 'D:\\ws', 's') as { args: string[] };
    expect(long.args.at(-1)).toHaveLength(80);
  });
});

describe('localStamp', () => {
  it('formats the workspace stamp in the owner time zone', () => {
    const ms = Date.parse('2026-10-02T10:08:47Z');
    expect(localStamp(ms, 'Asia/Jakarta')).toBe('20261002-170847');
    expect(localStamp(ms, 'UTC')).toBe('20261002-100847');
  });
});
