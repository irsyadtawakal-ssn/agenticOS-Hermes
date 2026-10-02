import { describe, expect, it } from 'vitest';
import { type HealthDeps, probeHealth } from '../src/health.js';

const record = JSON.stringify({ role: 'gateway', home: 'D:\\agentic-os\\hermes-home', pid: 20840 });

function deps(over: Partial<HealthDeps> = {}): HealthDeps {
  return {
    readFile: (p) => (p.endsWith('host-gateway.json') ? record : null),
    pidAlive: () => true,
    fetchFn: (async (url: string) => {
      if (url.includes('20128')) return new Response('{}', { status: 200 });
      if (url.includes('11434')) throw new Error('refused');
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch,
    runDocker: async () => ({ code: 0, stdout: '29.3.1\n' }),
    hermesHome: 'd:\\AGENTIC-OS\\hermes-home',
    lockDir: 'C:\\locks',
    routerBaseUrl: 'http://127.0.0.1:20128/v1',
    servePort: null,
    ...over,
  };
}

describe('probeHealth', () => {
  it('reports every component in a fixed order', async () => {
    const result = await probeHealth(deps());
    expect(result.map((c) => [c.id, c.status])).toEqual([
      ['core', 'ok'], ['gateway', 'ok'], ['router', 'ok'], ['docker', 'ok'], ['serve', 'absent'], ['ollama', 'absent'],
    ]);
    expect(result.find((c) => c.id === 'docker')?.detail).toBe('Docker 29.3.1');
  });

  it('marks the gateway down for a dead pid, a foreign home or a missing record', async () => {
    expect((await probeHealth(deps({ pidAlive: () => false })))[1].status).toBe('down');
    const foreign = JSON.stringify({ role: 'gateway', home: 'C:\\other', pid: 1 });
    expect((await probeHealth(deps({ readFile: () => foreign })))[1].status).toBe('down');
    expect((await probeHealth(deps({ readFile: () => null })))[1].status).toBe('down');
    expect((await probeHealth(deps({ readFile: () => '{broken' })))[1].status).toBe('down');
  });

  it('marks router and docker down when they fail, and probes serve once configured', async () => {
    const failing = (async () => {
      throw new Error('down');
    }) as unknown as typeof fetch;
    const r = await probeHealth(deps({ fetchFn: failing, runDocker: async () => ({ code: 1, stdout: '' }), servePort: 9129 }));
    expect(r.map((c) => [c.id, c.status])).toEqual([
      ['core', 'ok'], ['gateway', 'ok'], ['router', 'down'], ['docker', 'down'], ['serve', 'down'], ['ollama', 'absent'],
    ]);
    const up = await probeHealth(deps({ servePort: 9129 }));
    expect(up.find((c) => c.id === 'serve')?.status).toBe('ok');
  });
});
