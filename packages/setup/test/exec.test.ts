import { describe, expect, it } from 'vitest';
import { realExec } from '../src/exec.js';

describe('realExec', () => {
  it('captures stdout, stderr and exit code', async () => {
    const r = await realExec(process.execPath, [
      '-e',
      "process.stdout.write('hi'); process.stderr.write('warn'); process.exit(3)",
    ]);
    expect(r).toEqual({ code: 3, stdout: 'hi', stderr: 'warn' });
  });

  it('rejects when the process exceeds timeoutMs', async () => {
    await expect(
      realExec(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { timeoutMs: 200 }),
    ).rejects.toThrow(/timed out/);
  });

  it('passes extra env vars to the child', async () => {
    const r = await realExec(process.execPath, ['-e', 'process.stdout.write(process.env.AOS_T ?? "")'], {
      env: { AOS_T: 'ok' },
    });
    expect(r.stdout).toBe('ok');
  });
});
