import type { Exec } from './exec.js';
import { createTask, supportsJson, waitForStatus } from './kanban.js';

export const TERMINAL_STATUSES = ['done', 'blocked', 'review', 'archived'];

export interface SmokeResult {
  ok: boolean;
  taskId: string;
  status: string;
}

const KANBAN_BODY = [
  'Goal: Tulis 3 fakta singkat tentang protokol HTTP/3 ke file notes.md di workspace.',
  'Acceptance criteria:',
  '- notes.md ada di workspace dan berisi tepat 3 poin.',
  'Inputs: pengetahuanmu sendiri, tanpa web.',
  'Risk: low',
  'Selesaikan dengan kanban_complete.',
].join('\n');

export async function smokeKanban(
  exec: Exec,
  log: (s: string) => void = console.log,
  stamp: string = new Date().toISOString(),
  pollMs = 15_000,
): Promise<SmokeResult> {
  const json = await supportsJson(exec);
  const taskId = await createTask(exec, {
    title: `SMOKE-KANBAN ${stamp}`,
    assignee: 'researcher',
    body: KANBAN_BODY,
    idempotencyKey: `smoke-kanban-${stamp}`,
  });
  log(`created ${taskId}; waiting for the dispatcher (tick 60s)...`);
  const task = await waitForStatus(exec, taskId, TERMINAL_STATUSES, {
    timeoutMs: 10 * 60_000,
    intervalMs: pollMs,
    json,
    onPoll: (t) => log(`  ${taskId}: ${t.status}`),
  });
  return { ok: task.status === 'done', taskId, status: task.status };
}
