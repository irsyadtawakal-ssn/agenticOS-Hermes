import { describe, expect, it } from 'vitest';
import type { Exec } from '../src/exec.js';
import { chiefPrompt, smokeChief, smokeKanban } from '../src/smoke.js';

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

describe('smokeChief', () => {
  it('asks chief to delegate, then waits for the researcher task to finish', async () => {
    const statuses = ['ready', 'running', 'done'];
    const calls: string[][] = [];
    const exec: Exec = async (_cmd, args) => {
      calls.push(args);
      if (args[0] === '-p') return { code: 0, stdout: 'Kartu dibuat: t_chief7 untuk researcher', stderr: '' };
      if (args[1] === 'show' && args[2] === '--help') return { code: 0, stdout: '', stderr: '' };
      return { code: 0, stdout: `Task t_chief7\nStatus: ${statuses.shift() ?? 'done'}\nAssignee: researcher\n`, stderr: '' };
    };
    const result = await smokeChief(exec, () => {}, 'S3', 0);
    expect(result).toEqual({ ok: true, taskId: 't_chief7', status: 'done' });
    expect(calls[1]).toEqual(['-p', 'chief', 'chat', '-q', chiefPrompt('S3')]);
  });

  it('fails when chief assigns the task to the wrong agent', async () => {
    const exec: Exec = async (_cmd, args) => {
      if (args[0] === '-p') return { code: 0, stdout: 't_wrong1', stderr: '' };
      if (args[2] === '--help') return { code: 0, stdout: '', stderr: '' };
      return { code: 0, stdout: 'Task t_wrong1\nStatus: ready\nAssignee: dev\n', stderr: '' };
    };
    expect(await smokeChief(exec, () => {}, 'S4', 0)).toEqual({ ok: false, taskId: 't_wrong1', status: 'wrong assignee dev' });
  });

  it('ignores the echoed prompt line and reads the last id from chief reply', async () => {
    const exec: Exec = async (_cmd, args) => {
      if (args[0] === '-p') return { code: 0, stdout: 'Query: Delegasikan ... contoh t_echo1\nt_real9', stderr: '' };
      if (args[2] === '--help') return { code: 0, stdout: '', stderr: '' };
      return { code: 0, stdout: 'Task t_real9\nStatus: done\nAssignee: researcher\n', stderr: '' };
    };
    expect(await smokeChief(exec, () => {}, 'S5', 0)).toEqual({ ok: true, taskId: 't_real9', status: 'done' });
  });

  it('falls back to locating the card by its title when chief reply has no id', async () => {
    const statuses = ['ready', 'running', 'done'];
    const calls: string[][] = [];
    const exec: Exec = async (_cmd, args) => {
      calls.push(args);
      if (args[0] === '-p') return { code: 0, stdout: 'Sudah saya delegasikan.', stderr: '' };
      if (args[1] === 'list') {
        return {
          code: 0,
          stdout: 't_other1  ready  researcher  SMOKE-KANBAN x\nt_found7  ready  researcher  SMOKE-CHIEF S5\n',
          stderr: '',
        };
      }
      if (args[2] === '--help') return { code: 0, stdout: '', stderr: '' };
      return { code: 0, stdout: `Task t_found7\nStatus: ${statuses.shift() ?? 'done'}\nAssignee: researcher\n`, stderr: '' };
    };
    expect(await smokeChief(exec, () => {}, 'S5', 0)).toEqual({ ok: true, taskId: 't_found7', status: 'done' });
    expect(calls.some((a) => a[0] === 'kanban' && a[1] === 'list')).toBe(true);
  });

  it('rejects when chief reply has no id and no card carries the smoke title', async () => {
    const exec: Exec = async (_cmd, args) => {
      if (args[0] === '-p') return { code: 0, stdout: 'Maaf, tidak bisa.', stderr: '' };
      if (args[1] === 'list') return { code: 0, stdout: 't_other1  ready  researcher  SMOKE-KANBAN x\n', stderr: '' };
      return { code: 0, stdout: '', stderr: '' };
    };
    await expect(smokeChief(exec, () => {}, 'S6', 0)).rejects.toThrow(/created no card/);
  });

  it('keeps id-like tokens out of the chief prompt', () => {
    expect(chiefPrompt('S')).not.toMatch(/\bt_[A-Za-z0-9]+\b/);
  });
});
