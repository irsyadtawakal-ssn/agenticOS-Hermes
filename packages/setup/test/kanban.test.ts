import { describe, expect, it } from 'vitest';
import type { Exec } from '../src/exec.js';
import { createTask, parseTaskId, parseTaskShow, supportsJson, waitForStatus } from '../src/kanban.js';

describe('parseTaskId', () => {
  it('extracts the first t_ id', () => {
    expect(parseTaskId('Created task t_8f3k2 (assignee: researcher)')).toBe('t_8f3k2');
  });
  it('throws when there is no id', () => {
    expect(() => parseTaskId('nothing here')).toThrow(/No kanban task id/);
  });
});

describe('parseTaskShow', () => {
  it('parses JSON output, flat or nested under task', () => {
    expect(parseTaskShow('{"id":"t_1","status":"running","assignee":"researcher","title":"X"}')).toEqual({
      id: 't_1',
      status: 'running',
      assignee: 'researcher',
      title: 'X',
    });
    expect(parseTaskShow('{"task":{"id":"t_2","status":"done"}}')).toEqual({ id: 't_2', status: 'done', assignee: undefined, title: undefined });
  });
  it('parses human-readable output', () => {
    const text = 'Task t_9ab\nTitle: Riset kompetitor\nStatus: Ready\nAssignee: researcher\n';
    expect(parseTaskShow(text)).toEqual({ id: 't_9ab', status: 'ready', assignee: 'researcher', title: 'Riset kompetitor' });
  });
  it('throws when status is missing', () => {
    expect(() => parseTaskShow('Task t_1\n')).toThrow(/Cannot find status/);
  });
});

describe('supportsJson', () => {
  it('detects a --json flag in help output', async () => {
    const withJson: Exec = async () => ({ code: 0, stdout: 'Options:\n  --json  Output JSON', stderr: '' });
    const without: Exec = async () => ({ code: 0, stdout: 'Options:\n  --verbose', stderr: '' });
    expect(await supportsJson(withJson)).toBe(true);
    expect(await supportsJson(without)).toBe(false);
  });
});

describe('createTask', () => {
  it('calls hermes kanban create with assignee, body and idempotency key', async () => {
    const calls: string[][] = [];
    const exec: Exec = async (cmd, args) => {
      calls.push([cmd, ...args]);
      return { code: 0, stdout: 'created t_abc', stderr: '' };
    };
    const id = await createTask(exec, { title: 'T', assignee: 'researcher', body: 'B', idempotencyKey: 'K' });
    expect(id).toBe('t_abc');
    expect(calls).toEqual([['hermes', 'kanban', 'create', 'T', '--assignee', 'researcher', '--body', 'B', '--idempotency-key', 'K']]);
  });
  it('throws on a non-zero exit', async () => {
    const exec: Exec = async () => ({ code: 2, stdout: '', stderr: 'no board' });
    await expect(createTask(exec, { title: 'T', assignee: 'r', body: 'B', idempotencyKey: 'K' })).rejects.toThrow(/no board/);
  });
});

describe('waitForStatus', () => {
  it('polls until a target status appears', async () => {
    const statuses = ['ready', 'running', 'done'];
    const exec: Exec = async () => ({ code: 0, stdout: `Task t_1\nStatus: ${statuses.shift()}\n`, stderr: '' });
    const seen: string[] = [];
    const task = await waitForStatus(exec, 't_1', ['done'], {
      timeoutMs: 1000,
      intervalMs: 10,
      json: false,
      sleep: async () => {},
      onPoll: (t) => seen.push(t.status),
    });
    expect(task.status).toBe('done');
    expect(seen).toEqual(['ready', 'running', 'done']);
  });

  it('times out with the last status', async () => {
    let clock = 0;
    const exec: Exec = async () => ({ code: 0, stdout: 'Task t_1\nStatus: running\n', stderr: '' });
    await expect(
      waitForStatus(exec, 't_1', ['done'], {
        timeoutMs: 100,
        intervalMs: 60,
        json: false,
        now: () => clock,
        sleep: async (ms) => {
          clock += ms;
        },
      }),
    ).rejects.toThrow(/t_1 still 'running'/);
  });
});
