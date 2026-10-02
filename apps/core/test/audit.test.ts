import { describe, expect, it } from 'vitest';
import { consumeGrant, createParkApproval, decideApproval } from '../src/approvals.js';
import { auditRiskyActions } from '../src/audit.js';
import { openCoreDb } from '../src/db.js';
import { ingestEvents } from '../src/events.js';

const T0 = 1_790_000_000_000;
let n = 0;
function pair(decision: string, finishStatus: string, extra: Record<string, unknown> = {}) {
  n += 1;
  const call = `c${n}`;
  return [
    { id: `s${n}`.padEnd(16, '0'), ts: T0 + n, type: 'tool.started', profile: 'dev', session_id: 'sess', task_id: 't_1', mode: 'kanban', payload: { tool: 'terminal', tool_call_id: call, policy: { decision, rule_id: 'git-push', args_hash: 'a'.repeat(64), ...extra } } },
    { id: `f${n}`.padEnd(16, '0'), ts: T0 + n, type: 'tool.finished', profile: 'dev', session_id: 'sess', task_id: 't_1', mode: 'kanban', payload: { tool: 'terminal', tool_call_id: call, status: finishStatus } },
  ];
}

describe('auditRiskyActions', () => {
  it('passes when every gated call was blocked or ran on a consumed grant', () => {
    const db = openCoreDb(':memory:');
    const a = createParkApproval(db, { profile: 'dev', task_id: 't_1', rule_id: 'git-push', tool: 'terminal', args_hash: 'a'.repeat(64), args_preview: '{}' }, T0).approval;
    decideApproval(db, a.id, 'approve', {}, T0);
    consumeGrant(db, { task_id: 't_1', tool: 'terminal', args_hash: 'a'.repeat(64) }, T0);
    ingestEvents(db, [...pair('park', 'blocked'), ...pair('deny', 'blocked'), ...pair('breaker', 'blocked'), ...pair('granted', 'ok', { approval_id: a.id }), ...pair('allow', 'ok'), ...pair('native', 'ok')]);
    expect(auditRiskyActions(db)).toEqual({ checked: 4, violations: [] });
  });

  it('flags gated calls that still ran and grants that were never consumed', () => {
    const db = openCoreDb(':memory:');
    ingestEvents(db, [...pair('park', 'ok'), ...pair('granted', 'ok', { approval_id: 'nope00' })]);
    const result = auditRiskyActions(db);
    expect(result.checked).toBe(2);
    expect(result.violations.map((v) => v.decision)).toEqual(['park', 'granted']);
  });

  it('only checks events since the given time', () => {
    const db = openCoreDb(':memory:');
    ingestEvents(db, pair('park', 'ok'));
    expect(auditRiskyActions(db, T0 + 10_000)).toEqual({ checked: 0, violations: [] });
  });
});
