import { describe, expect, it } from 'vitest';
import {
  APPROVAL_TTL_MS,
  consumeGrant,
  createParkApproval,
  decideApproval,
  expireApprovals,
  getApproval,
  listApprovals,
  markResumed,
  newApprovalId,
  pendingResumes,
  recordNativeApproval,
} from '../src/approvals.js';
import { openCoreDb } from '../src/db.js';
import type { AosEvent } from '../src/events.js';

const H = 'a'.repeat(64);
const T0 = 1_790_000_000_000;
const input = {
  profile: 'dev', task_id: 't_1', session_id: 's1', rule_id: 'git-push', tool: 'terminal',
  args_hash: H, args_preview: '{"command": "git push"}', reason: 'git push',
};

describe('approvals store', () => {
  it('generates short unambiguous ids', () => {
    for (let i = 0; i < 50; i += 1) expect(newApprovalId()).toMatch(/^[abcdefghijkmnpqrstuvwxyz2-9]{6}$/);
  });

  it('creates a pending park approval and dedupes identical pending requests', () => {
    const db = openCoreDb(':memory:');
    const first = createParkApproval(db, input, T0);
    expect(first.created).toBe(true);
    expect(first.approval).toMatchObject({ mode: 'park', status: 'pending', task_id: 't_1', tool: 'terminal', created_at: T0 });
    const again = createParkApproval(db, input, T0 + 5);
    expect(again).toEqual({ approval: first.approval, created: false });
    expect(createParkApproval(db, { ...input, args_hash: 'b'.repeat(64) }, T0).created).toBe(true);
    expect(listApprovals(db, 'pending')).toHaveLength(2);
  });

  it('approve issues a 24h single-use grant bound to task, tool and args hash', () => {
    const db = openCoreDb(':memory:');
    const { approval } = createParkApproval(db, input, T0);
    const decided = decideApproval(db, approval.id, 'approve', { note: 'ok', by: 'chief' }, T0 + 10);
    expect(decided).toMatchObject({ ok: true, approval: { status: 'approved', decided_by: 'chief', instruction: 'ok', token_expires_at: T0 + 10 + APPROVAL_TTL_MS } });
    expect(consumeGrant(db, { task_id: 't_2', tool: 'terminal', args_hash: H }, T0 + 20)).toEqual({ status: 'none' });
    expect(consumeGrant(db, { task_id: 't_1', tool: 'terminal', args_hash: 'c'.repeat(64) }, T0 + 20)).toEqual({ status: 'none' });
    expect(consumeGrant(db, { task_id: 't_1', tool: 'terminal', args_hash: H }, T0 + 20)).toEqual({ status: 'consumed', id: approval.id });
    expect(consumeGrant(db, { task_id: 't_1', tool: 'terminal', args_hash: H }, T0 + 30)).toEqual({ status: 'none' });
    expect(getApproval(db, approval.id)?.status).toBe('consumed');
  });

  it('does not consume an expired grant', () => {
    const db = openCoreDb(':memory:');
    const { approval } = createParkApproval(db, input, T0);
    decideApproval(db, approval.id, 'approve', {}, T0);
    expect(consumeGrant(db, { task_id: 't_1', tool: 'terminal', args_hash: H }, T0 + APPROVAL_TTL_MS + 1)).toEqual({ status: 'none' });
  });

  it('reports a recent denial with the owner note', () => {
    const db = openCoreDb(':memory:');
    const { approval } = createParkApproval(db, input, T0);
    decideApproval(db, approval.id, 'deny', { note: 'jangan push' }, T0 + 1);
    expect(consumeGrant(db, { task_id: 't_1', tool: 'terminal', args_hash: H }, T0 + 2)).toEqual({ status: 'denied', id: approval.id, instruction: 'jangan push' });
    expect(consumeGrant(db, { task_id: 't_1', tool: 'terminal', args_hash: H }, T0 + APPROVAL_TTL_MS + 2)).toEqual({ status: 'none' });
  });

  it('rejects unknown, already decided and native approvals', () => {
    const db = openCoreDb(':memory:');
    const { approval } = createParkApproval(db, input, T0);
    expect(decideApproval(db, 'zzzzzz', 'approve', {}, T0)).toEqual({ ok: false, code: 404 });
    decideApproval(db, approval.id, 'deny', {}, T0);
    expect(decideApproval(db, approval.id, 'approve', {}, T0)).toEqual({ ok: false, code: 409 });
    recordNativeApproval(db, nativeStarted('e1'));
    expect(decideApproval(db, 'n_e1', 'approve', {}, T0)).toEqual({ ok: false, code: 409 });
  });

  it('expires stale pending requests and unused grants', () => {
    const db = openCoreDb(':memory:');
    const stale = createParkApproval(db, input, T0).approval;
    const fresh = createParkApproval(db, { ...input, task_id: 't_9' }, T0 + APPROVAL_TTL_MS).approval;
    const granted = createParkApproval(db, { ...input, task_id: 't_8' }, T0).approval;
    decideApproval(db, granted.id, 'approve', {}, T0);
    const expired = expireApprovals(db, T0 + APPROVAL_TTL_MS + 1);
    expect(expired.map((a) => a.id).sort()).toEqual([stale.id, granted.id].sort());
    expect(expired.every((a) => a.status === 'expired')).toBe(true);
    expect(getApproval(db, stale.id)?.decided_by).toBe('timeout');
    expect(getApproval(db, fresh.id)?.status).toBe('pending');
    expect(expireApprovals(db, T0 + APPROVAL_TTL_MS + 2)).toEqual([]);
  });

  it('lists decided park approvals until they are marked resumed', () => {
    const db = openCoreDb(':memory:');
    const a = createParkApproval(db, input, T0).approval;
    const b = createParkApproval(db, { ...input, task_id: 't_2' }, T0).approval;
    createParkApproval(db, { ...input, task_id: 't_3' }, T0);
    decideApproval(db, a.id, 'approve', {}, T0 + 1);
    decideApproval(db, b.id, 'deny', {}, T0 + 2);
    expect(pendingResumes(db).map((x) => x.id)).toEqual([a.id, b.id]);
    markResumed(db, a.id, T0 + 3);
    expect(pendingResumes(db).map((x) => x.id)).toEqual([b.id]);
  });
});

function nativeStarted(id: string, callId = 'c1'): AosEvent {
  return {
    id, ts: T0, type: 'tool.started', profile: 'chief', session_id: 's1', task_id: null, mode: 'telegram',
    payload: { tool: 'terminal', tool_call_id: callId, args_preview: '{"command": "rm x"}', policy: { decision: 'native', rule_id: 'delete', args_hash: H } },
  };
}

function finished(id: string, status: string, callId = 'c1'): AosEvent {
  return { id, ts: T0 + 9, type: 'tool.finished', profile: 'chief', session_id: 's1', task_id: null, mode: 'telegram', payload: { tool: 'terminal', tool_call_id: callId, status } };
}

describe('recordNativeApproval', () => {
  it('records the Hermes-gated call and its outcome', () => {
    const db = openCoreDb(':memory:');
    recordNativeApproval(db, nativeStarted('e1'));
    recordNativeApproval(db, nativeStarted('e1'));
    expect(getApproval(db, 'n_e1')).toMatchObject({ mode: 'native', status: 'pending', rule_id: 'delete', tool_call_id: 'c1', args_hash: H });
    recordNativeApproval(db, finished('e2', 'blocked'));
    expect(getApproval(db, 'n_e1')).toMatchObject({ status: 'denied', decided_by: 'hermes', decided_at: T0 + 9 });
    recordNativeApproval(db, nativeStarted('e3', 'c2'));
    recordNativeApproval(db, finished('e4', 'ok', 'c2'));
    expect(getApproval(db, 'n_e3')?.status).toBe('approved');
  });

  it('ignores events without a native policy decision', () => {
    const db = openCoreDb(':memory:');
    const allow = nativeStarted('e1');
    (allow.payload.policy as Record<string, unknown>).decision = 'allow';
    recordNativeApproval(db, allow);
    recordNativeApproval(db, finished('e2', 'ok'));
    expect(listApprovals(db)).toEqual([]);
  });
});
