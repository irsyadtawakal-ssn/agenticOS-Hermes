import type { Exec } from './exec.js';

export interface KanbanTask {
  id: string;
  status: string;
  assignee?: string;
  title?: string;
}

const ID_RE = /\bt_[A-Za-z0-9]+\b/;

export function parseTaskId(text: string): string {
  const match = ID_RE.exec(text);
  if (!match) throw new Error(`No kanban task id (t_...) found in: ${text.slice(0, 200)}`);
  return match[0];
}

export function parseLastTaskId(text: string): string {
  const matches = text.match(new RegExp(ID_RE.source, 'g'));
  if (!matches) throw new Error(`No kanban task id (t_...) found in: ${text.slice(0, 200)}`);
  return matches[matches.length - 1];
}

export function parseTaskShow(stdout: string): KanbanTask {
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{')) {
    const json = JSON.parse(trimmed) as Record<string, unknown>;
    const t = (json.task ?? json) as Record<string, unknown>;
    return {
      id: String(t.id),
      status: String(t.status).toLowerCase(),
      assignee: t.assignee == null ? undefined : String(t.assignee),
      title: t.title == null ? undefined : String(t.title),
    };
  }
  const status = /^\s*status\s*[:=]\s*([A-Za-z_]+)/im.exec(trimmed)?.[1];
  if (!status) throw new Error(`Cannot find status in kanban show output: ${trimmed.slice(0, 200)}`);
  return {
    id: parseTaskId(trimmed),
    status: status.toLowerCase(),
    assignee: /^\s*assignee\s*[:=]\s*([\w-]+)/im.exec(trimmed)?.[1],
    title: /^\s*title\s*[:=]\s*(.+)$/im.exec(trimmed)?.[1]?.trim(),
  };
}

export async function supportsJson(exec: Exec): Promise<boolean> {
  const r = await exec('hermes', ['kanban', 'show', '--help'], { timeoutMs: 60_000 });
  return /--json\b/.test(r.stdout + r.stderr);
}

export async function showTask(exec: Exec, id: string, json: boolean): Promise<KanbanTask> {
  const r = await exec('hermes', ['kanban', 'show', id, ...(json ? ['--json'] : [])], { timeoutMs: 60_000 });
  if (r.code !== 0) throw new Error(`hermes kanban show ${id} failed: ${(r.stderr || r.stdout).trim()}`);
  return parseTaskShow(r.stdout);
}

export async function createTask(
  exec: Exec,
  input: { title: string; assignee: string; body: string; idempotencyKey: string },
): Promise<string> {
  const r = await exec(
    'hermes',
    ['kanban', 'create', input.title, '--assignee', input.assignee, '--body', input.body, '--idempotency-key', input.idempotencyKey],
    { timeoutMs: 60_000 },
  );
  if (r.code !== 0) throw new Error(`hermes kanban create failed: ${(r.stderr || r.stdout).trim()}`);
  return parseTaskId(r.stdout);
}

export interface WaitOptions {
  timeoutMs: number;
  intervalMs: number;
  json: boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onPoll?: (task: KanbanTask) => void;
}

export async function waitForStatus(exec: Exec, id: string, targets: string[], o: WaitOptions): Promise<KanbanTask> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const deadline = now() + o.timeoutMs;
  for (;;) {
    const task = await showTask(exec, id, o.json);
    o.onPoll?.(task);
    if (targets.includes(task.status)) return task;
    if (now() >= deadline) throw new Error(`Task ${id} still '${task.status}' after ${o.timeoutMs}ms`);
    await sleep(o.intervalMs);
  }
}
