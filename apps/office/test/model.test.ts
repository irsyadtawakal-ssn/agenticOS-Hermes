import { describe, expect, it } from 'vitest';
import { activityLine, applyKanbanChanges, canMove, formatUsd, keyAction, pushActivity, sparkline, TIERS, todayCost } from '../src/shell/model.ts';
import officeRoster from '../../../infra/profiles/office-roster.json';

describe('model', () => {
  it('mirrors the roster tiers', () => {
    expect(TIERS).toEqual(Object.fromEntries(officeRoster.map((p) => [p.name, p.tier])));
  });

  it('allows exactly the moves Core supports', () => {
    expect(canMove('blocked', 'ready')).toBe(true);
    expect(canMove('todo', 'ready')).toBe(true);
    expect(canMove('running', 'blocked')).toBe(true);
    expect(canMove('done', 'archived')).toBe(true);
    expect(canMove('done', 'ready')).toBe(false);
    expect(canMove('triage', 'ready')).toBe(false);
    expect(canMove('ready', 'running')).toBe(false);
    expect(canMove('blocked', 'blocked')).toBe(false);
  });

  it('asks for a refetch only when the board changed', () => {
    expect(applyKanbanChanges([])).toBe('same');
    expect(applyKanbanChanges([{ id: 't_1', change: 'status', status: 'done', previous: 'running' }])).toBe('refetch');
  });

  it('turns tool events into a capped activity log per profile', () => {
    const ev = (id: string, type: string, payload: Record<string, unknown>) => ({ id, ts: 1, type, profile: 'dev', mode: 'kanban', payload });
    expect(activityLine(ev('a', 'tool.started', { tool: 'terminal', args_preview: '{"command": "ls"}' }))).toEqual({ ts: 1, text: 'Menjalankan ls', status: 'mulai' });
    expect(activityLine(ev('b', 'tool.finished', { tool: 'terminal', status: 'blocked', duration_ms: 12 }))).toEqual({ ts: 1, text: 'terminal selesai (12 ms)', status: 'blocked' });
    expect(activityLine(ev('c', 'llm.started', {}))).toBeNull();
    const log = pushActivity({}, Array.from({ length: 5 }, (_, i) => ev(`e${i}`, 'tool.started', { tool: 'read_file' })), 3);
    expect(log.dev.map((x) => x.id)).toEqual(['e4', 'e3', 'e2']);
  });

  it('summarises costs', () => {
    expect(todayCost([{ day: 'a', cost_usd: 1, calls: 1 }, { day: 'b', cost_usd: 0.257, calls: 3 }])).toBe(0.257);
    expect(todayCost([])).toBe(0);
    expect(formatUsd(1.8449)).toBe('$1.84');
    expect(sparkline([0, 1, 2, 4])).toBe('▁▃▅█');
    expect(sparkline([0, 0])).toBe('▁▁');
  });

  it('maps shortcuts and ignores typing in fields', () => {
    const k = (key: string, extra: Partial<{ ctrlKey: boolean; target: unknown }> = {}) => ({
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      target: { tagName: 'DIV', isContentEditable: false },
      ...extra,
    });
    expect(keyAction(k('1'))).toEqual({ type: 'focus', profile: 'chief' });
    expect(keyAction(k('5'))).toEqual({ type: 'focus', profile: 'dev' });
    expect(keyAction(k('a'))).toEqual({ type: 'approvals' });
    expect(keyAction(k('B'))).toEqual({ type: 'kanban' });
    expect(keyAction(k('c'))).toEqual({ type: 'chat' });
    expect(keyAction(k('C'))).toEqual({ type: 'chat' });
    expect(keyAction(k('Escape'))).toEqual({ type: 'close' });
    expect(keyAction(k('k', { ctrlKey: true }))).toEqual({ type: 'chat' });
    expect(keyAction(k('a', { target: { tagName: 'INPUT', isContentEditable: false } }))).toBeNull();
    expect(keyAction(k('Escape', { target: { tagName: 'TEXTAREA', isContentEditable: false } }))).toEqual({ type: 'close' });
    expect(keyAction(k('x'))).toBeNull();
  });
});
