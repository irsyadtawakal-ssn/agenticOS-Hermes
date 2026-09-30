import type { Exec } from './exec.js';
import { createTask, parseTaskId, showTask, supportsJson, waitForStatus } from './kanban.js';

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

export function chiefPrompt(stamp: string): string {
  return [
    `Delegasikan ke researcher: buat SATU kartu kanban berjudul "SMOKE-CHIEF ${stamp}".`,
    'Goal: tulis 3 fakta singkat tentang WebSocket ke file notes.md di workspace, tanpa web.',
    'Risk: low. Jangan kerjakan sendiri.',
    'Setelah kartu dibuat, balas HANYA dengan id kartunya (format t_xxx).',
  ].join('\n');
}

export async function smokeChief(
  exec: Exec,
  log: (s: string) => void = console.log,
  stamp: string = new Date().toISOString(),
  pollMs = 15_000,
): Promise<SmokeResult> {
  const json = await supportsJson(exec);
  const r = await exec('hermes', ['-p', 'chief', 'chat', '-q', chiefPrompt(stamp)], { timeoutMs: 5 * 60_000 });
  if (r.code !== 0) throw new Error(`chief chat failed: ${(r.stderr || r.stdout).trim()}`);
  const taskId = parseTaskId(r.stdout);
  log(`chief created ${taskId}`);
  const created = await showTask(exec, taskId, json);
  if (created.assignee && created.assignee !== 'researcher') {
    return { ok: false, taskId, status: `wrong assignee ${created.assignee}` };
  }
  const task = await waitForStatus(exec, taskId, TERMINAL_STATUSES, {
    timeoutMs: 10 * 60_000,
    intervalMs: pollMs,
    json,
    onPoll: (t) => log(`  ${taskId}: ${t.status}`),
  });
  return { ok: task.status === 'done', taskId, status: task.status };
}
