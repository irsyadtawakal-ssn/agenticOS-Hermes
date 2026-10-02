import { execFile } from 'node:child_process';

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type RunHermes = (args: string[]) => Promise<CliResult>;

export function createHermesRunner(hermesHome: string, exe = 'hermes', timeoutMs = 60_000): RunHermes {
  return (args) =>
    new Promise((resolve) => {
      const env: NodeJS.ProcessEnv = { ...process.env, HERMES_HOME: hermesHome };
      delete env.HERMES_KANBAN_TASK;
      delete env.HERMES_KANBAN_RUN_ID;
      execFile(exe, args, { env, timeout: timeoutMs, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
        if (!err) return resolve({ code: 0, stdout, stderr });
        const code = typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : 1;
        resolve({ code: code === 0 ? 1 : code, stdout: stdout ?? '', stderr: stderr || err.message });
      });
    });
}
