import { describe, expect, it } from 'vitest';
import { HermesAdapter, type CoreApproval, type CoreEvent } from '../src/hermes/adapter.ts';
import { activityLabel, agentIdFor, READING_TOOLS } from '../src/hermes/labels.ts';

let n = 0;
function ev(type: string, profile: string, payload: Record<string, unknown> = {}): CoreEvent {
  n += 1;
  return { id: `e${n}`, ts: n, type, profile, session_id: 's', task_id: null, mode: 'kanban', payload };
}
const approval = (id: string, profile: string, status: string): CoreApproval => ({ id, profile, status, mode: 'park', tool: 'terminal', task_id: 't_1' });

describe('labels', () => {
  it('maps profiles to fixed ids and ignores others', () => {
    expect(['chief', 'researcher', 'secretary', 'content', 'dev'].map(agentIdFor)).toEqual([1, 2, 3, 4, 5]);
    expect(agentIdFor('shared')).toBeNull();
  });

  it('builds Indonesian activity labels from args previews, including truncated JSON', () => {
    expect(activityLabel('read_file', '{"path": "notes.md"}')).toBe('Membaca notes.md');
    expect(activityLabel('terminal', '{"command": "git push origin main"}')).toBe('Menjalankan git push origin main');
    expect(activityLabel('write_file', '{"path": "out/report.md", "content": "very long…')).toBe('Menulis out/report.md');
    expect(activityLabel('web_search', '{"query": "postiz"}')).toBe('Mencari web postiz');
    expect(activityLabel('delegate_task', '{"goal": "riset A"}')).toBe('Subtask: riset A');
    expect(activityLabel('browser_click', '{}')).toBe('Memakai browser');
    expect(activityLabel('kanban_complete', '{}')).toBe('Kanban: kanban_complete');
    expect(activityLabel('mystery_tool', 'not json')).toBe('mystery_tool');
    expect(READING_TOOLS).toContain('web_search');
    expect(READING_TOOLS).not.toContain('terminal');
  });
});

describe('HermesAdapter', () => {
  it('announces Hermes tool taxonomy', () => {
    const caps = new HermesAdapter().capabilities();
    expect(caps).toMatchObject({ type: 'providerCapabilities', subagentToolNames: ['delegate_task'] });
  });

  it('restores the roster with seats, live state and pending approvals', () => {
    const a = new HermesAdapter();
    const msgs = a.snapshot(
      [
        { profile: 'chief', state: 'idle', task_id: null, detail: null, updated_at: 1 },
        { profile: 'researcher', state: 'reading', task_id: 't_1', detail: 'web_search', updated_at: 2 },
        { profile: 'dev', state: 'thinking', task_id: null, detail: 'COMBO-SS', updated_at: 3 },
      ],
      [approval('abc234', 'dev', 'pending')],
      { '2': { palette: 4, hueShift: 30, seatId: 'seat-x' } },
    );
    expect(msgs[0]).toEqual({
      type: 'existingAgents',
      agents: [1, 2, 3, 4, 5],
      folderNames: { '1': 'chief', '2': 'researcher', '3': 'secretary', '4': 'content', '5': 'dev' },
      agentMeta: {
        '1': { palette: 0, hueShift: 0 },
        '2': { palette: 4, hueShift: 30, seatId: 'seat-x' },
        '3': { palette: 2, hueShift: 0 },
        '4': { palette: 3, hueShift: 0 },
        '5': { palette: 4, hueShift: 0 },
      },
      externalAgents: {},
    });
    expect(msgs).toContainEqual({ type: 'agentStatus', id: 2, status: 'active' });
    expect(msgs).toContainEqual({ type: 'agentToolStart', id: 2, toolId: 'restore-2', status: 'Mencari web', toolName: 'web_search' });
    expect(msgs).toContainEqual({ type: 'agentStatus', id: 5, status: 'active' });
    expect(msgs).toContainEqual({ type: 'agentToolPermission', id: 5 });
    expect(msgs.some((m) => 'id' in m && m.id === 1)).toBe(false);
  });

  it('animates thinking, tools and the end of a run', () => {
    const a = new HermesAdapter();
    expect(a.onEvents([ev('llm.started', 'researcher')])).toEqual([{ type: 'agentStatus', id: 2, status: 'active' }]);
    expect(a.onEvents([ev('tool.started', 'researcher', { tool: 'read_file', tool_call_id: 'c1', args_preview: '{"path": "a.md"}', policy: { decision: 'allow' } })])).toEqual([
      { type: 'agentToolStart', id: 2, toolId: 'c1', status: 'Membaca a.md', toolName: 'read_file', permissionActive: false },
    ]);
    expect(a.onEvents([ev('tool.finished', 'researcher', { tool: 'read_file', tool_call_id: 'c1', status: 'ok' })])).toEqual([
      { type: 'agentToolDone', id: 2, toolId: 'c1' },
    ]);
    expect(a.onEvents([ev('session.ended', 'researcher')])).toEqual([
      { type: 'agentToolsClear', id: 2 },
      { type: 'agentStatus', id: 2, status: 'waiting' },
    ]);
    expect(a.onEvents([ev('llm.finished', 'researcher'), ev('session.started', 'researcher'), ev('tool.started', 'shared', { tool: 'x' })])).toEqual([]);
  });

  it('keeps the permission bubble while a park approval is pending, even after the run ends', () => {
    const a = new HermesAdapter();
    expect(a.onApprovals([approval('abc234', 'dev', 'pending')])).toEqual([{ type: 'agentToolPermission', id: 5 }]);
    const started = a.onEvents([ev('tool.started', 'dev', { tool: 'terminal', tool_call_id: 'c9', args_preview: '{"command": "git push"}', policy: { decision: 'park', approval_id: 'abc234' } })]);
    expect(started).toEqual([
      { type: 'agentToolStart', id: 5, toolId: 'c9', status: 'Menjalankan git push', toolName: 'terminal', permissionActive: true },
      { type: 'agentToolPermission', id: 5 },
    ]);
    expect(a.onEvents([ev('tool.finished', 'dev', { tool: 'terminal', tool_call_id: 'c9', status: 'blocked' })])).toEqual([{ type: 'agentToolDone', id: 5, toolId: 'c9' }]);
    expect(a.onEvents([ev('session.ended', 'dev')])).toEqual([
      { type: 'agentToolsClear', id: 5 },
      { type: 'agentStatus', id: 5, status: 'waiting' },
      { type: 'agentToolPermission', id: 5 },
    ]);
    expect(a.onApprovals([approval('abc234', 'dev', 'approved')])).toEqual([{ type: 'agentToolPermissionClear', id: 5 }]);
    expect(a.onApprovals([approval('abc234', 'dev', 'consumed')])).toEqual([]);
  });

  it('shows the native Hermes gate until the tool finishes', () => {
    const a = new HermesAdapter();
    expect(a.onEvents([ev('tool.started', 'chief', { tool: 'terminal', tool_call_id: 'n1', args_preview: '{"command": "rm -rf x"}', policy: { decision: 'native' } })])).toEqual([
      { type: 'agentToolStart', id: 1, toolId: 'n1', status: 'Menjalankan rm -rf x', toolName: 'terminal', permissionActive: true },
      { type: 'agentToolPermission', id: 1 },
    ]);
    expect(a.onEvents([ev('tool.finished', 'chief', { tool: 'terminal', tool_call_id: 'n1', status: 'blocked' })])).toEqual([
      { type: 'agentToolDone', id: 1, toolId: 'n1' },
      { type: 'agentToolPermissionClear', id: 1 },
    ]);
  });

  it('flags a tripped breaker with the permission bubble and ignores native approvals in the approvals topic', () => {
    const a = new HermesAdapter();
    expect(a.onEvents([ev('breaker.tripped', 'researcher', { tool: 'web_search', reason: 'repeat' })])).toEqual([{ type: 'agentToolPermission', id: 2 }]);
    expect(a.onApprovals([{ ...approval('n_x', 'chief', 'pending'), mode: 'native' }])).toEqual([]);
  });

  it('falls back to the event id when a tool call id is missing', () => {
    const a = new HermesAdapter();
    const [start] = a.onEvents([{ ...ev('tool.started', 'content', { tool: 'write_file' }), id: 'evt-7' }]);
    expect(start).toMatchObject({ type: 'agentToolStart', id: 4, toolId: 'evt-7', status: 'Menulis' });
  });
});
