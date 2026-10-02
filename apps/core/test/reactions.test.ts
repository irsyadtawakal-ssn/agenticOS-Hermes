import { describe, expect, it } from 'vitest';
import { APPROVAL_TTL_MS, createParkApproval, decideApproval, getApproval } from '../src/approvals.js';
import { openCoreDb } from '../src/db.js';
import { createHub } from '../src/hub.js';
import type { KanbanTask } from '../src/kanban.js';
import { createReactions, resumeReason } from '../src/reactions.js';

const T0 = 1_790_000_000_000;
const input = { profile: 'dev', task_id: 't_1', session_id: 's', rule_id: 'git-push', tool: 'terminal', args_hash: 'a'.repeat(64), args_preview: '{"command": "git push"}', reason: 'git push' };

function task(id: string, status: string): KanbanTask {
  return { id, title: id, assignee: 'dev', status, created_at: 1, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null };
}

function setup(code = 0) {
  const db = openCoreDb(':memory:');
  const calls: string[][] = [];
  const sent: string[] = [];
  const logs: string[] = [];
  const reactions = createReactions({
    db,
    hub: createHub(),
    now: () => T0 + 100,
    log: (m) => logs.push(m),
    notifier: { send: async (text) => (sent.push(text), true) },
    runHermes: async (args) => (calls.push(args), { code, stdout: '', stderr: code ? 'cannot unblock' : '' }),
  });
  return { db, calls, sent, logs, reactions };
}

describe('resumeReason', () => {
  it('tells the worker what the owner decided', () => {
    const db = openCoreDb(':memory:');
    const a = createParkApproval(db, input, T0).approval;
    const approved = decideApproval(db, a.id, 'approve', {}, T0);
    expect(approved.ok && resumeReason(approved.approval)).toContain(`approved:${a.id}`);
    const b = createParkApproval(db, { ...input, task_id: 't_2' }, T0).approval;
    const denied = decideApproval(db, b.id, 'deny', { note: 'jangan' }, T0);
    expect(denied.ok && resumeReason(denied.approval)).toContain(`DENIED_BY_OWNER:${b.id}`);
    expect(denied.ok && resumeReason(denied.approval)).toContain('jangan');
  });
});

describe('createReactions', () => {
  it('notifies the owner when a park request is created', async () => {
    const { db, sent, reactions } = setup();
    reactions.onApprovalCreated(createParkApproval(db, input, T0).approval);
    await Promise.resolve();
    expect(sent).toHaveLength(1);
  });

  it('unblocks a blocked card after a decision and marks it resumed once', async () => {
    const { db, calls, reactions } = setup();
    const a = createParkApproval(db, input, T0).approval;
    decideApproval(db, a.id, 'approve', {}, T0);
    await reactions.resumeTick([task('t_1', 'running')]);
    expect(calls).toEqual([]);
    await reactions.resumeTick([task('t_1', 'blocked')]);
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 3)).toEqual(['kanban', 'unblock', '--reason']);
    expect(calls[0][3]).toContain(`approved:${a.id}`);
    expect(calls[0][4]).toBe('t_1');
    expect(getApproval(db, a.id)?.resumed_at).toBe(T0 + 100);
    await reactions.resumeTick([task('t_1', 'blocked')]);
    expect(calls).toHaveLength(1);
  });

  it('keeps retrying when unblock fails and logs the CLI error', async () => {
    const { db, calls, logs, reactions } = setup(1);
    const a = createParkApproval(db, input, T0).approval;
    decideApproval(db, a.id, 'deny', {}, T0);
    await reactions.resumeTick([task('t_1', 'blocked')]);
    await reactions.resumeTick([task('t_1', 'blocked')]);
    expect(calls).toHaveLength(2);
    expect(getApproval(db, a.id)?.resumed_at).toBeNull();
    expect(logs[0]).toContain('cannot unblock');
  });

  it('closes out cards that finished or fell into triage', async () => {
    const { db, sent, calls, reactions } = setup();
    const a = createParkApproval(db, input, T0).approval;
    const b = createParkApproval(db, { ...input, task_id: 't_2' }, T0).approval;
    decideApproval(db, a.id, 'approve', {}, T0);
    decideApproval(db, b.id, 'approve', {}, T0);
    await reactions.resumeTick([task('t_1', 'done'), task('t_2', 'triage')]);
    expect(calls).toEqual([]);
    expect(getApproval(db, a.id)?.resumed_at).toBe(T0 + 100);
    expect(getApproval(db, b.id)?.resumed_at).toBe(T0 + 100);
    expect(sent.join('\n')).toContain('t_2');
  });

  it('expires stale requests and tells the owner', async () => {
    const db = openCoreDb(':memory:');
    const sent: string[] = [];
    const reactions = createReactions({
      db, hub: createHub(), now: () => T0 + APPROVAL_TTL_MS + 1, log: () => {},
      notifier: { send: async (t) => (sent.push(t), true) }, runHermes: async () => ({ code: 0, stdout: '', stderr: '' }),
    });
    const a = createParkApproval(db, input, T0).approval;
    await reactions.expireTick();
    expect(getApproval(db, a.id)?.status).toBe('expired');
    expect(sent.join('\n')).toContain(a.id);
  });

  it('blocks the card and alerts the owner when a breaker trips', async () => {
    const { calls, sent, reactions } = setup();
    await reactions.onEvents([
      { id: 'e1', ts: T0, type: 'breaker.tripped', profile: 'researcher', session_id: 's', task_id: 't_7', mode: 'kanban', payload: { tool: 'web_search', reason: 'repeat' } },
      { id: 'e2', ts: T0, type: 'breaker.tripped', profile: 'chief', session_id: 's', task_id: null, mode: 'telegram', payload: { tool: 'terminal', reason: 'calls' } },
      { id: 'e3', ts: T0, type: 'tool.started', profile: 'dev', session_id: 's', task_id: 't_7', mode: 'kanban', payload: { tool: 'terminal' } },
    ]);
    expect(calls).toEqual([['kanban', 'block', 't_7', 'circuit_open: repeat']]);
    expect(sent).toHaveLength(2);
  });
});
