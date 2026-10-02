import { join } from 'node:path';

export type HealthId = 'core' | 'gateway' | 'router' | 'docker' | 'serve' | 'ollama';
export type HealthStatus = 'ok' | 'down' | 'absent';

export interface HealthComponent {
  id: HealthId;
  label: string;
  status: HealthStatus;
  detail: string;
}

export interface HealthDeps {
  readFile(path: string): string | null;
  pidAlive(pid: number): boolean;
  fetchFn: typeof fetch;
  runDocker(): Promise<{ code: number; stdout: string }>;
  hermesHome: string;
  lockDir: string;
  routerBaseUrl: string;
  servePort: number | null;
}

async function httpStatus(fetchFn: typeof fetch, url: string, timeoutMs: number): Promise<number | null> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status;
  } catch {
    return null;
  }
}

function gateway(deps: HealthDeps): HealthComponent {
  const base = { id: 'gateway' as const, label: 'Gateway Hermes' };
  const text = deps.readFile(join(deps.lockDir, 'host-gateway.json'));
  if (!text) return { ...base, status: 'down', detail: 'tidak berjalan (host record tidak ada)' };
  try {
    const rec = JSON.parse(text) as { home?: string; pid?: number };
    if ((rec.home ?? '').toLowerCase() !== deps.hermesHome.toLowerCase()) {
      return { ...base, status: 'down', detail: 'gateway Agentic OS tidak berjalan' };
    }
    if (typeof rec.pid !== 'number' || !deps.pidAlive(rec.pid)) return { ...base, status: 'down', detail: 'proses gateway mati' };
    return { ...base, status: 'ok', detail: `PID ${rec.pid}` };
  } catch {
    return { ...base, status: 'down', detail: 'host record rusak' };
  }
}

export async function probeHealth(deps: HealthDeps): Promise<HealthComponent[]> {
  const [router, docker, serve, ollama] = await Promise.all([
    httpStatus(deps.fetchFn, `${deps.routerBaseUrl.replace(/\/+$/, '')}/models`, 3000),
    deps.runDocker().catch(() => ({ code: 1, stdout: '' })),
    deps.servePort === null ? Promise.resolve(null) : httpStatus(deps.fetchFn, `http://127.0.0.1:${deps.servePort}/`, 2000),
    httpStatus(deps.fetchFn, 'http://127.0.0.1:11434/api/version', 2000),
  ]);
  return [
    { id: 'core', label: 'OS Core', status: 'ok', detail: 'berjalan' },
    gateway(deps),
    router === 200
      ? { id: 'router', label: '9Router', status: 'ok', detail: 'terjangkau' }
      : { id: 'router', label: '9Router', status: 'down', detail: router === null ? 'tidak terjangkau' : `HTTP ${router}` },
    docker.code === 0
      ? { id: 'docker', label: 'Docker', status: 'ok', detail: `Docker ${docker.stdout.trim()}` }
      : { id: 'docker', label: 'Docker', status: 'down', detail: 'Docker Desktop tidak berjalan' },
    deps.servePort === null
      ? { id: 'serve', label: 'Hermes serve', status: 'absent', detail: 'dipasang di M5b' }
      : serve !== null && serve < 500
        ? { id: 'serve', label: 'Hermes serve', status: 'ok', detail: `port ${deps.servePort}` }
        : { id: 'serve', label: 'Hermes serve', status: 'down', detail: `port ${deps.servePort} tidak menjawab` },
    ollama === 200
      ? { id: 'ollama', label: 'Ollama', status: 'ok', detail: 'berjalan' }
      : { id: 'ollama', label: 'Ollama', status: 'absent', detail: 'tidak dipasang (opsional)' },
  ];
}
