import { describe, expect, it } from 'vitest';
import { formatResults } from '../src/check.js';
import { checkRouter } from '../src/router.js';

const BASE = 'http://127.0.0.1:20128/v1';

function fakeFetch(opts: { models: string[]; anonStatus: number }): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get('authorization');
    if (!auth) return new Response('unauthorized', { status: opts.anonStatus });
    if (auth !== 'Bearer good-key') return new Response('bad key', { status: 401 });
    return new Response(JSON.stringify({ data: opts.models.map((id) => ({ id })) }), { status: 200 });
  }) as typeof fetch;
}

describe('checkRouter', () => {
  it('passes when all combos are listed and anonymous access is rejected', async () => {
    const results = await checkRouter(BASE, 'good-key', fakeFetch({ models: ['os-brain', 'os-worker', 'os-private', 'x/y'], anonStatus: 401 }));
    expect(results.map((r) => [r.name, r.ok])).toEqual([
      ['router-reachable', true],
      ['combo:os-brain', true],
      ['combo:os-worker', true],
      ['combo:os-private', true],
      ['router-auth-required', true],
    ]);
  });

  it('flags a missing combo and open anonymous access', async () => {
    const results = await checkRouter(BASE, 'good-key', fakeFetch({ models: ['os-brain'], anonStatus: 200 }));
    expect(results.find((r) => r.name === 'combo:os-private')?.ok).toBe(false);
    expect(results.find((r) => r.name === 'router-auth-required')?.ok).toBe(false);
  });

  it('reports an unreachable router without throwing', async () => {
    const failing = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const results = await checkRouter(BASE, 'good-key', failing);
    expect(results).toEqual([{ name: 'router-reachable', ok: false, detail: `${BASE}/models: ECONNREFUSED` }]);
  });
});

describe('formatResults', () => {
  it('renders one line per check with an ASCII status', () => {
    expect(formatResults([{ name: 'a', ok: true, detail: 'fine' }, { name: 'b', ok: false, detail: 'broken' }])).toBe(
      '[OK]   a - fine\n[FAIL] b - broken',
    );
  });
});
