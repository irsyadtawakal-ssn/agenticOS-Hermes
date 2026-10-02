import type { Approval } from './approvals.js';
import type { KanbanTask } from './kanban.js';

/** Morning briefing digest (US-01), read by the chief cron pre-run script. */
export interface Briefing {
  date: string;
  today: { total: number; byAgent: Record<string, number> };
  blocked: { total: number; items: Array<{ id: string; title: string; assignee: string | null }> };
  doneYesterday: number;
  approvals: { total: number; items: Array<{ id: string; profile: string; tool: string; task_id: string | null }> };
  costYesterday: { cost_usd: number; calls: number };
}

const ACTIVE = new Set(['todo', 'ready', 'running']);
const LIST_MAX = 5;

function localDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

export function buildBriefing(
  tasks: KanbanTask[],
  pending: Approval[],
  costYesterday: { cost_usd: number; calls: number },
  now: number,
  timeZone: string,
): Briefing {
  const yesterday = localDate(now - 86_400_000, timeZone);
  const byAgent: Record<string, number> = {};
  let total = 0;
  for (const t of tasks) {
    if (!ACTIVE.has(t.status)) continue;
    total += 1;
    const who = t.assignee ?? '-';
    byAgent[who] = (byAgent[who] ?? 0) + 1;
  }
  const blocked = tasks.filter((t) => t.status === 'blocked');
  const doneYesterday = tasks.filter(
    (t) => (t.status === 'done' || t.status === 'archived') && t.completed_at !== null && localDate(t.completed_at * 1000, timeZone) === yesterday,
  ).length;
  return {
    date: localDate(now, timeZone),
    today: { total, byAgent },
    blocked: { total: blocked.length, items: blocked.slice(0, LIST_MAX).map((t) => ({ id: t.id, title: t.title, assignee: t.assignee })) },
    doneYesterday,
    approvals: {
      total: pending.length,
      items: pending.slice(0, LIST_MAX).map((a) => ({ id: a.id, profile: a.profile, tool: a.tool, task_id: a.task_id })),
    },
    costYesterday: { cost_usd: costYesterday.cost_usd, calls: costYesterday.calls },
  };
}
