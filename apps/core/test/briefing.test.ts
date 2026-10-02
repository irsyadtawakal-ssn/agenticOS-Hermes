import { describe, expect, it } from 'vitest';
import type { Approval } from '../src/approvals.js';
import { buildBriefing } from '../src/briefing.js';
import type { KanbanTask } from '../src/kanban.js';

// 2026-10-02 07:00 WIB = 2026-10-02T00:00:00Z
const NOW = Date.parse('2026-10-02T00:00:00Z');
const sec = (iso: string) => Date.parse(iso) / 1000;

function task(id: string, status: string, assignee: string | null, completed?: string): KanbanTask {
  return {
    id,
    title: `Kartu ${id}`,
    assignee,
    status,
    created_at: sec('2026-09-30T00:00:00Z'),
    started_at: null,
    completed_at: completed ? sec(completed) : null,
    workspace_kind: null,
    workspace_path: null,
  };
}

describe('buildBriefing', () => {
  it('summarises the board, approvals and yesterday cost in local time', () => {
    const tasks = [
      task('t_1', 'ready', 'researcher'),
      task('t_2', 'running', 'researcher'),
      task('t_3', 'todo', 'dev'),
      task('t_4', 'blocked', 'dev'),
      task('t_5', 'done', 'content', '2026-10-01T10:00:00Z'), // 17:00 WIB kemarin
      task('t_6', 'archived', 'content', '2026-09-30T18:00:00Z'), // 01:00 WIB 1 Okt = kemarin
      task('t_7', 'done', 'content', '2026-10-01T18:00:00Z'), // 01:00 WIB hari ini
      task('t_8', 'triage', null),
    ];
    const pending = [{ id: 'abc123', profile: 'dev', tool: 'terminal', task_id: 't_4' } as Approval];
    const b = buildBriefing(tasks, pending, { cost_usd: 1.2345, calls: 40 }, NOW, 'Asia/Jakarta');
    expect(b.date).toBe('2026-10-02');
    expect(b.today).toEqual({ total: 3, byAgent: { researcher: 2, dev: 1 } });
    expect(b.blocked).toEqual({ total: 1, items: [{ id: 't_4', title: 'Kartu t_4', assignee: 'dev' }] });
    expect(b.doneYesterday).toBe(2);
    expect(b.approvals).toEqual({ total: 1, items: [{ id: 'abc123', profile: 'dev', tool: 'terminal', task_id: 't_4' }] });
    expect(b.costYesterday).toEqual({ cost_usd: 1.2345, calls: 40 });
  });

  it('caps the blocked and approval lists at five', () => {
    const tasks = Array.from({ length: 7 }, (_, i) => task(`t_${i}`, 'blocked', 'dev'));
    const pending = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, profile: 'dev', tool: 'terminal', task_id: null }) as Approval);
    const b = buildBriefing(tasks, pending, { cost_usd: 0, calls: 0 }, NOW, 'Asia/Jakarta');
    expect([b.blocked.total, b.blocked.items.length, b.approvals.total, b.approvals.items.length]).toEqual([7, 5, 7, 5]);
  });
});
