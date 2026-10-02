import type { Db } from './db.js';

export interface AuditViolation {
  ts: number;
  profile: string;
  session_id: string | null;
  tool_call_id: string | null;
  tool: string;
  decision: string;
  status: string | null;
  approval_id: string | null;
}

interface Row extends AuditViolation {
  consumed: number;
}

export function auditRiskyActions(db: Db, since = 0): { checked: number; violations: AuditViolation[] } {
  const rows = db
    .prepare(
      `SELECT s.ts AS ts, s.profile AS profile, s.session_id AS session_id,
              json_extract(s.payload, '$.tool_call_id') AS tool_call_id,
              json_extract(s.payload, '$.tool') AS tool,
              json_extract(s.payload, '$.policy.decision') AS decision,
              json_extract(f.payload, '$.status') AS status,
              json_extract(s.payload, '$.policy.approval_id') AS approval_id,
              EXISTS (SELECT 1 FROM approvals a WHERE a.id = json_extract(s.payload, '$.policy.approval_id') AND a.status = 'consumed') AS consumed
       FROM events s
       LEFT JOIN events f ON f.type = 'tool.finished' AND f.session_id IS s.session_id
            AND json_extract(f.payload, '$.tool_call_id') = json_extract(s.payload, '$.tool_call_id')
       WHERE s.type = 'tool.started' AND s.ts >= ?
         AND json_extract(s.payload, '$.policy.decision') IN ('park', 'deny', 'breaker', 'granted')
       ORDER BY s.ts`,
    )
    .all(since) as Row[];
  const violations = rows
    .filter((r) => (r.decision === 'granted' ? r.consumed !== 1 : r.status !== null && r.status !== 'blocked'))
    .map((r): AuditViolation => ({
      ts: r.ts, profile: r.profile, session_id: r.session_id, tool_call_id: r.tool_call_id,
      tool: r.tool, decision: r.decision, status: r.status, approval_id: r.approval_id,
    }));
  return { checked: rows.length, violations };
}
