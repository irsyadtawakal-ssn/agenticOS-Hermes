import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './db.js';
import type { AosEvent } from './events.js';

export const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;
export const APPROVAL_STATUSES = ['pending', 'approved', 'denied', 'expired', 'consumed'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface Approval {
  id: string;
  created_at: number;
  profile: string;
  task_id: string | null;
  session_id: string | null;
  tool_call_id: string | null;
  mode: 'park' | 'native';
  rule_id: string;
  tool: string;
  args_preview: string;
  args_hash: string;
  reason: string | null;
  status: ApprovalStatus;
  decided_by: string | null;
  decided_at: number | null;
  instruction: string | null;
  token_expires_at: number | null;
  resumed_at: number | null;
}

const HASH = z.string().regex(/^[a-f0-9]{64}$/);

export const CreateApprovalSchema = z.object({
  profile: z.string().min(1).max(64),
  task_id: z.string().min(1).max(64),
  session_id: z.string().max(128).nullable().optional(),
  rule_id: z.string().min(1).max(64),
  tool: z.string().min(1).max(128),
  args_hash: HASH,
  args_preview: z.string().max(1000),
  reason: z.string().max(500).nullable().optional(),
});
export type CreateApprovalInput = z.infer<typeof CreateApprovalSchema>;

export const GrantMatchSchema = z.object({ task_id: z.string().min(1).max(64), tool: z.string().min(1).max(128), args_hash: HASH });
export type GrantMatch = z.infer<typeof GrantMatchSchema>;

export const DecisionSchema = z.object({
  decision: z.enum(['approve', 'deny']),
  note: z.string().max(500).optional(),
  by: z.string().min(1).max(32).optional(),
});

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function newApprovalId(): string {
  let id = '';
  for (const byte of randomBytes(6)) id += ALPHABET[byte % ALPHABET.length];
  return id;
}

export function getApproval(db: Db, id: string): Approval | null {
  return (db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as Approval | undefined) ?? null;
}

export function listApprovals(db: Db, status?: ApprovalStatus, limit = 50): Approval[] {
  const rows = status
    ? db.prepare('SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(status, limit)
    : db.prepare('SELECT * FROM approvals ORDER BY created_at DESC LIMIT ?').all(limit);
  return rows as Approval[];
}

export function createParkApproval(db: Db, input: CreateApprovalInput, now: number): { approval: Approval; created: boolean } {
  return db.transaction(() => {
    const existing = db
      .prepare(
        `SELECT * FROM approvals WHERE mode = 'park' AND status = 'pending' AND task_id = ? AND tool = ? AND args_hash = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(input.task_id, input.tool, input.args_hash) as Approval | undefined;
    if (existing) return { approval: existing, created: false };
    let id = newApprovalId();
    while (getApproval(db, id)) id = newApprovalId();
    db.prepare(
      `INSERT INTO approvals (id, created_at, profile, task_id, session_id, tool_call_id, mode, rule_id, tool, args_preview, args_hash, reason, status)
       VALUES (?, ?, ?, ?, ?, NULL, 'park', ?, ?, ?, ?, ?, 'pending')`,
    ).run(id, now, input.profile, input.task_id, input.session_id ?? null, input.rule_id, input.tool, input.args_preview, input.args_hash, input.reason ?? null);
    return { approval: getApproval(db, id) as Approval, created: true };
  })();
}

export type GrantResult =
  | { status: 'consumed'; id: string }
  | { status: 'denied'; id: string; instruction: string | null }
  | { status: 'none' };

export function consumeGrant(db: Db, match: GrantMatch, now: number): GrantResult {
  return db.transaction((): GrantResult => {
    const grant = db
      .prepare(
        `SELECT id FROM approvals WHERE mode = 'park' AND status = 'approved' AND task_id = ? AND tool = ? AND args_hash = ?
         AND token_expires_at > ? ORDER BY decided_at DESC LIMIT 1`,
      )
      .get(match.task_id, match.tool, match.args_hash, now) as { id: string } | undefined;
    if (grant) {
      db.prepare(`UPDATE approvals SET status = 'consumed' WHERE id = ? AND status = 'approved'`).run(grant.id);
      return { status: 'consumed', id: grant.id };
    }
    const denied = db
      .prepare(
        `SELECT id, instruction FROM approvals WHERE mode = 'park' AND status = 'denied' AND task_id = ? AND tool = ? AND args_hash = ?
         AND decided_at > ? ORDER BY decided_at DESC LIMIT 1`,
      )
      .get(match.task_id, match.tool, match.args_hash, now - APPROVAL_TTL_MS) as { id: string; instruction: string | null } | undefined;
    if (denied) return { status: 'denied', id: denied.id, instruction: denied.instruction };
    return { status: 'none' };
  })();
}

export type DecideResult = { ok: true; approval: Approval } | { ok: false; code: 404 | 409 };

export function decideApproval(
  db: Db,
  id: string,
  decision: 'approve' | 'deny',
  opts: { note?: string; by?: string },
  now: number,
): DecideResult {
  const current = getApproval(db, id);
  if (!current) return { ok: false, code: 404 };
  if (current.mode !== 'park' || current.status !== 'pending') return { ok: false, code: 409 };
  const by = opts.by ?? 'owner';
  const note = opts.note ?? null;
  const info =
    decision === 'approve'
      ? db
          .prepare(
            `UPDATE approvals SET status = 'approved', decided_by = ?, decided_at = ?, instruction = ?, token_expires_at = ?
             WHERE id = ? AND status = 'pending'`,
          )
          .run(by, now, note, now + APPROVAL_TTL_MS, id)
      : db
          .prepare(`UPDATE approvals SET status = 'denied', decided_by = ?, decided_at = ?, instruction = ? WHERE id = ? AND status = 'pending'`)
          .run(by, now, note, id);
  if (info.changes !== 1) return { ok: false, code: 409 };
  return { ok: true, approval: getApproval(db, id) as Approval };
}

export function expireApprovals(db: Db, now: number): Approval[] {
  return db.transaction(() => {
    const rows = db
      .prepare(
        `SELECT * FROM approvals WHERE (mode = 'park' AND status = 'pending' AND created_at <= ?)
         OR (status = 'approved' AND token_expires_at <= ?)`,
      )
      .all(now - APPROVAL_TTL_MS, now) as Approval[];
    const update = db.prepare(
      `UPDATE approvals SET status = 'expired', decided_by = COALESCE(decided_by, 'timeout'), decided_at = COALESCE(decided_at, ?) WHERE id = ?`,
    );
    for (const row of rows) update.run(now, row.id);
    return rows.map((row) => ({ ...row, status: 'expired' as const, decided_by: row.decided_by ?? 'timeout', decided_at: row.decided_at ?? now }));
  })();
}

export function pendingResumes(db: Db): Approval[] {
  return db
    .prepare(
      `SELECT * FROM approvals WHERE mode = 'park' AND status IN ('approved', 'denied') AND resumed_at IS NULL AND task_id IS NOT NULL
       ORDER BY decided_at`,
    )
    .all() as Approval[];
}

export function markResumed(db: Db, id: string, now: number): void {
  db.prepare('UPDATE approvals SET resumed_at = ? WHERE id = ?').run(now, id);
}

export function recordNativeApproval(db: Db, ev: AosEvent): void {
  const p = ev.payload as Record<string, unknown>;
  const callId = typeof p.tool_call_id === 'string' ? p.tool_call_id : null;
  if (ev.type === 'tool.started') {
    const policy = p.policy as Record<string, unknown> | undefined;
    if (!policy || policy.decision !== 'native') return;
    db.prepare(
      `INSERT OR IGNORE INTO approvals (id, created_at, profile, task_id, session_id, tool_call_id, mode, rule_id, tool, args_preview, args_hash, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, 'native', ?, ?, ?, ?, NULL, 'pending')`,
    ).run(
      `n_${ev.id}`, ev.ts, ev.profile, ev.task_id ?? null, ev.session_id ?? null, callId,
      String(policy.rule_id ?? 'unknown'), String(p.tool ?? '?'), String(p.args_preview ?? ''), String(policy.args_hash ?? ''),
    );
  } else if (ev.type === 'tool.finished' && callId) {
    db.prepare(
      `UPDATE approvals SET status = ?, decided_by = 'hermes', decided_at = ?
       WHERE mode = 'native' AND status = 'pending' AND session_id IS ? AND tool_call_id = ?`,
    ).run(p.status === 'blocked' ? 'denied' : 'approved', ev.ts, ev.session_id ?? null, callId);
  }
}
