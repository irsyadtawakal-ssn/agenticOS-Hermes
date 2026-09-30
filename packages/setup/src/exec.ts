import spawn from 'cross-spawn';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type Exec = (
  cmd: string,
  args: string[],
  opts?: { timeoutMs?: number; env?: NodeJS.ProcessEnv },
) => Promise<ExecResult>;

export const realExec: Exec = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...opts.env }, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()));
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill();
          reject(new Error(`${cmd} timed out after ${opts.timeoutMs}ms`));
        }, opts.timeoutMs)
      : undefined;
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
