import { join } from 'node:path';

/** Launch and supervise the Agentic OS `hermes serve` backend (M5b). */

/** `terminal.backend` from a profile `config.yaml` (default `local`). */
export function terminalBackend(configText: string): string {
  const section = /^terminal:\r?\n((?:[ \t]+.*\r?\n?)*)/m.exec(configText)?.[1] ?? '';
  return /^[ \t]+backend:[ \t]*([\w-]+)/m.exec(section)?.[1] ?? 'local';
}

/**
 * Working directory for an office chat session. Serve runs with cwd = chat root, which docker
 * profiles (`docker_mount_cwd_to_workspace`) see as `/workspace`; a host path would be taken
 * as a relative path inside the container. A persistent (shared) container ignores sub-folders,
 * so docker chats share the chat root (verified live, M5b).
 */
export function sessionCwdFor(backend: string, chatRoot: string, profile: string): string {
  return backend === 'docker' ? '/workspace' : join(chatRoot, profile);
}

export interface ServeSettings {
  hermesExe: string;
  hermesHome: string;
  port: number;
  token: string;
  lockDir: string;
  cwd: string;
  parentPid: number;
}

export interface ServeLaunch {
  exe: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}

export interface ServeChild {
  pid?: number;
  kill(): boolean;
  on(event: 'exit', cb: (code: number | null) => void): unknown;
}

export interface SuperviseDeps {
  spawn(launch: ServeLaunch): ServeChild;
  log(message: string): void;
  now(): number;
}

export interface Supervisor {
  stop(): void;
  running(): boolean;
}

// Desktop ownership (cron ticker, gateway reaping) and kanban worker context must never leak into serve.
const DROPPED = ['HERMES_DESKTOP', 'HERMES_KANBAN_TASK', 'HERMES_KANBAN_RUN_ID', 'HERMES_KANBAN_WORKSPACE', 'HERMES_TUI_SIDECAR_URL'];
const BACKOFF_MS = [2_000, 5_000, 15_000, 60_000];
const HEALTHY_RUN_MS = 120_000;

export function serveLaunch(s: ServeSettings, baseEnv: NodeJS.ProcessEnv): ServeLaunch {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (key.startsWith('AOS_') || DROPPED.includes(key)) continue;
    env[key] = value;
  }
  env.HERMES_HOME = s.hermesHome;
  env.HERMES_DASHBOARD_SESSION_TOKEN = s.token;
  env.HERMES_GATEWAY_LOCK_DIR = s.lockDir;
  env.HERMES_PARENT_PID = String(s.parentPid);
  return {
    exe: s.hermesExe,
    args: ['serve', '--isolated', '--skip-build', '--host', '127.0.0.1', '--port', String(s.port)],
    env,
    cwd: s.cwd,
  };
}

export function superviseServe(launch: ServeLaunch, deps: SuperviseDeps): Supervisor {
  let child: ServeChild | null = null;
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const start = () => {
    timer = null;
    if (stopped) return;
    const startedAt = deps.now();
    let current: ServeChild;
    try {
      current = deps.spawn(launch);
    } catch (err) {
      deps.log(`hermes serve failed to start: ${(err as Error).message}`);
      schedule();
      return;
    }
    child = current;
    deps.log(`hermes serve started (pid ${current.pid ?? '?'})`);
    current.on('exit', (code) => {
      if (child === current) child = null;
      deps.log(`hermes serve exited (code ${code ?? 'null'})`);
      if (deps.now() - startedAt >= HEALTHY_RUN_MS) failures = 0;
      schedule();
    });
  };

  const schedule = () => {
    if (stopped || timer) return;
    const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
    failures += 1;
    timer = setTimeout(start, delay);
  };

  start();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      child?.kill();
    },
    running: () => child !== null,
  };
}
