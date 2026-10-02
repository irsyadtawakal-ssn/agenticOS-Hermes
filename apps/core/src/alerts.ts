import type { HealthComponent, HealthId } from './health.js';
import type { KanbanTask } from './kanban.js';

const WATCHED: HealthId[] = ['gateway', 'router', 'docker', 'serve'];

export interface HealthAlertState {
  streak: Map<string, number>;
  alerted: Set<string>;
}

export function newHealthAlertState(): HealthAlertState {
  return { streak: new Map(), alerted: new Set() };
}

/** Telegram lines for components down for `threshold` consecutive probes, and their recovery. */
export function healthAlerts(state: HealthAlertState, components: HealthComponent[], threshold = 3): string[] {
  const out: string[] = [];
  for (const c of components) {
    if (!WATCHED.includes(c.id) || c.status === 'absent') continue;
    if (c.status === 'down') {
      const n = (state.streak.get(c.id) ?? 0) + 1;
      state.streak.set(c.id, n);
      if (n >= threshold && !state.alerted.has(c.id)) {
        state.alerted.add(c.id);
        out.push(`⚠️ ${c.label} bermasalah: ${c.detail}`);
      }
    } else {
      state.streak.set(c.id, 0);
      if (state.alerted.delete(c.id)) out.push(`✅ ${c.label} pulih (${c.detail})`);
    }
  }
  return out;
}

export const STUCK_AFTER_MS = 2 * 60 * 60 * 1000;

/** Cards `running` longer than STUCK_AFTER_MS, each reported once per stall (kanban times are seconds). */
export function stuckCardAlerts(tasks: KanbanTask[], now: number, notified: Set<string>): string[] {
  const out: string[] = [];
  const running = new Set<string>();
  for (const t of tasks) {
    if (t.status !== 'running' || t.started_at === null) continue;
    running.add(t.id);
    if (now - t.started_at * 1000 < STUCK_AFTER_MS || notified.has(t.id)) continue;
    notified.add(t.id);
    out.push(`⏳ Kartu ${t.id} (${t.assignee ?? '-'}) berjalan lebih dari 2 jam: ${t.title}\nBila macet, pindahkan ke Blocked dari laci kanban kantor.`);
  }
  for (const id of [...notified]) if (!running.has(id)) notified.delete(id);
  return out;
}
