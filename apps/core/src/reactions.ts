import { type Approval, expireApprovals, getApproval, markResumed, pendingResumes } from './approvals.js';
import type { Db } from './db.js';
import type { AosEvent } from './events.js';
import type { RunHermes } from './hermesCli.js';
import type { Hub } from './hub.js';
import type { KanbanTask } from './kanban.js';
import { formatApprovalExpired, formatApprovalRequest, formatBreaker, formatTriage, type Notifier } from './notify.js';

export interface ReactionDeps {
  db: Db;
  hub: Hub;
  runHermes: RunHermes;
  notifier: Notifier;
  now: () => number;
  log: (message: string) => void;
}

export function resumeReason(a: Approval): string {
  return a.status === 'approved'
    ? `approved:${a.id} — owner menyetujui ${a.tool} ${a.args_preview}. Ulangi panggilan yang sama persis; izin berlaku sekali dan 24 jam.`
    : `DENIED_BY_OWNER:${a.id} — ${a.instruction ?? 'tanpa alasan'}. Jangan ulangi aksi ini; selesaikan kartu tanpa aksi tersebut.`;
}

export function createReactions(deps: ReactionDeps) {
  const inFlight = new Set<string>();
  const publish = (id: string) => {
    const row = getApproval(deps.db, id);
    if (row) deps.hub.publish('approvals', [row]);
  };

  return {
    onApprovalCreated(approval: Approval): void {
      void deps.notifier.send(formatApprovalRequest(approval));
    },

    async onEvents(events: AosEvent[]): Promise<void> {
      for (const ev of events) {
        if (ev.type !== 'breaker.tripped') continue;
        await deps.notifier.send(formatBreaker(ev));
        if (!ev.task_id) continue;
        const reason = String((ev.payload as Record<string, unknown>).reason ?? 'tripped');
        const r = await deps.runHermes(['kanban', 'block', ev.task_id, `circuit_open: ${reason}`]);
        if (r.code !== 0) deps.log(`kanban block ${ev.task_id} failed: ${(r.stderr || r.stdout).trim().slice(0, 200)}`);
      }
    },

    async resumeTick(tasks: KanbanTask[]): Promise<void> {
      const byId = new Map(tasks.map((t) => [t.id, t]));
      for (const approval of pendingResumes(deps.db)) {
        const task = byId.get(approval.task_id as string);
        if (!task || inFlight.has(approval.id)) continue;
        if (task.status === 'blocked') {
          inFlight.add(approval.id);
          try {
            const r = await deps.runHermes(['kanban', 'unblock', '--reason', resumeReason(approval), task.id]);
            if (r.code === 0) {
              markResumed(deps.db, approval.id, deps.now());
              publish(approval.id);
            } else {
              deps.log(`kanban unblock ${task.id} failed: ${(r.stderr || r.stdout).trim().slice(0, 200)}`);
            }
          } finally {
            inFlight.delete(approval.id);
          }
        } else if (task.status === 'triage') {
          markResumed(deps.db, approval.id, deps.now());
          publish(approval.id);
          await deps.notifier.send(formatTriage(approval));
        } else if (task.status === 'done' || task.status === 'archived') {
          markResumed(deps.db, approval.id, deps.now());
          publish(approval.id);
        }
      }
    },

    async expireTick(): Promise<void> {
      for (const approval of expireApprovals(deps.db, deps.now())) {
        deps.hub.publish('approvals', [approval]);
        if (approval.mode === 'park') await deps.notifier.send(formatApprovalExpired(approval));
      }
    },
  };
}
