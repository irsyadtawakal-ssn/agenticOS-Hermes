import { describe, expect, it } from 'vitest';
import type { Exec } from '../src/exec.js';
import { smokeKanban } from '../src/smoke.js';

function scriptedExec(finalStatus: string): Exec & { calls: string[][] } {
  const statuses = ['ready', 'running', finalStatus];
  const calls: string[][] = [];
  const exec = (async (_cmd: string, args: string[]) => {
    calls.push(args);
    if (args[1] === 'show' && args[2] === '--help') return { code: 0, stdout: '--json', stderr: '' };
    if (args[1] === 'create') return { code: 0, stdout: 'created t_smoke1', stderr: '' };
    return { code: 0, stdout: JSON.stringify({ id: 't_smoke1', status: statuses.shift(), assignee: 'researcher' }), stderr: '' };
  }) as Exec & { calls: string[][] };
  exec.calls = calls;
  return exec;
}

describe('smokeKanban', () => {
  it('creates a researcher task and succeeds when it reaches done', async () => {
    const exec = scriptedExec('done');
    const result = await smokeKanban(exec, () => {}, 'S1', 0);
    expect(result).toEqual({ ok: true, taskId: 't_smoke1', status: 'done' });
    const create = exec.calls.find((a) => a[1] === 'create');
    expect(create?.slice(0, 5)).toEqual(['kanban', 'create', 'SMOKE-KANBAN S1', '--assignee', 'researcher']);
    expect(exec.calls.filter((a) => a[1] === 'show' && a.includes('--json'))).toHaveLength(3);
  });

  it('fails when the task ends blocked', async () => {
    const result = await smokeKanban(scriptedExec('blocked'), () => {}, 'S2', 0);
    expect(result).toEqual({ ok: false, taskId: 't_smoke1', status: 'blocked' });
  });
});
