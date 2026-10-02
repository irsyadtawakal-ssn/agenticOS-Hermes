import { describe, expect, it } from 'vitest';
import { createHermesRunner } from '../src/hermesCli.js';

describe('createHermesRunner', () => {
  it('runs the executable with the Agentic HERMES_HOME and without worker scoping env', async () => {
    process.env.HERMES_KANBAN_TASK = 't_leak';
    try {
      const run = createHermesRunner('D:\\agentic-os\\hermes-home', process.execPath);
      const r = await run(['-e', 'console.log(process.env.HERMES_HOME + "|" + (process.env.HERMES_KANBAN_TASK ?? "none"))']);
      expect(r).toEqual({ code: 0, stdout: 'D:\\agentic-os\\hermes-home|none\n', stderr: '' });
    } finally {
      delete process.env.HERMES_KANBAN_TASK;
    }
  });

  it('reports a non-zero exit without throwing', async () => {
    const run = createHermesRunner('X', process.execPath);
    const r = await run(['-e', 'process.stderr.write("bad"); process.exit(3)']);
    expect(r.code).toBe(3);
    expect(r.stderr).toBe('bad');
  });

  it('reports a missing executable as a failed result', async () => {
    const r = await createHermesRunner('X', 'definitely-not-a-real-exe-aos')(['--version']);
    expect(r.code).not.toBe(0);
  });
});
