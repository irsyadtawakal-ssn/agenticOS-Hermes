import { describe, expect, it } from 'vitest';
import { healthAlerts, newHealthAlertState, STUCK_AFTER_MS, stuckCardAlerts } from '../src/alerts.js';
import type { HealthComponent } from '../src/health.js';
import type { KanbanTask } from '../src/kanban.js';

const comp = (id: HealthComponent['id'], status: HealthComponent['status'], detail = 'x'): HealthComponent => ({ id, label: id.toUpperCase(), status, detail });

describe('healthAlerts', () => {
  it('alerts after consecutive down probes and announces recovery once', () => {
    const s = newHealthAlertState();
    expect(healthAlerts(s, [comp('router', 'down', 'tidak terjangkau')], 3)).toEqual([]);
    expect(healthAlerts(s, [comp('router', 'down', 'tidak terjangkau')], 3)).toEqual([]);
    expect(healthAlerts(s, [comp('router', 'down', 'tidak terjangkau')], 3)).toEqual(['⚠️ ROUTER bermasalah: tidak terjangkau']);
    expect(healthAlerts(s, [comp('router', 'down', 'tidak terjangkau')], 3)).toEqual([]);
    expect(healthAlerts(s, [comp('router', 'ok', 'terjangkau')], 3)).toEqual(['✅ ROUTER pulih (terjangkau)']);
    expect(healthAlerts(s, [comp('router', 'ok', 'terjangkau')], 3)).toEqual([]);
  });

  it('ignores core, ollama and absent components and resets a short outage', () => {
    const s = newHealthAlertState();
    healthAlerts(s, [comp('gateway', 'down')], 3);
    healthAlerts(s, [comp('gateway', 'ok')], 3);
    healthAlerts(s, [comp('gateway', 'down')], 3);
    expect(healthAlerts(s, [comp('gateway', 'down'), comp('ollama', 'down'), comp('serve', 'absent')], 3)).toEqual([]);
  });
});

describe('stuckCardAlerts', () => {
  const now = Date.parse('2026-10-02T10:00:00Z');
  const t = (id: string, status: string, startedMsAgo: number | null): KanbanTask => ({
    id,
    title: `Kartu ${id}`,
    assignee: 'dev',
    status,
    created_at: 0,
    started_at: startedMsAgo === null ? null : (now - startedMsAgo) / 1000,
    completed_at: null,
    workspace_kind: null,
    workspace_path: null,
  });

  it('reports cards running longer than two hours once', () => {
    const notified = new Set<string>();
    const tasks = [t('t_1', 'running', STUCK_AFTER_MS + 1), t('t_2', 'running', 60_000), t('t_3', 'blocked', STUCK_AFTER_MS * 2)];
    const first = stuckCardAlerts(tasks, now, notified);
    expect(first).toHaveLength(1);
    expect(first[0]).toContain('t_1');
    expect(stuckCardAlerts(tasks, now, notified)).toEqual([]);
  });

  it('forgets cards that stopped running so a later stall alerts again', () => {
    const notified = new Set<string>(['t_1']);
    stuckCardAlerts([t('t_1', 'done', null)], now, notified);
    expect(notified.has('t_1')).toBe(false);
  });
});
