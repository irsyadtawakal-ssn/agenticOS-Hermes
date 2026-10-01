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

  it('checks each unique required model once', async () => {
    const results = await checkRouter(BASE, 'good-key', fakeFetch({ models: ['COMBO-SS'], anonStatus: 401 }), ['COMBO-SS', 'COMBO-SS']);
    expect(results.filter((r) => r.name.startsWith('combo:')).map((r) => [r.name, r.ok])).toEqual([['combo:COMBO-SS', true]]);
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

  it('reports a non-JSON 200 body as a failed row without throwing', async () => {
    const html = (async (_u: string | URL | Request, init?: RequestInit) =>
      new Headers(init?.headers).get('authorization')
        ? new Response('<html>dashboard</html>', { status: 200 })
        : new Response('', { status: 401 })) as unknown as typeof fetch;
    const results = await checkRouter(BASE, 'good-key', html);
    expect(results.map((r) => [r.name, r.ok])).toEqual([
      ['router-reachable', true],
      ['router-models-json', false],
      ['router-auth-required', true],
    ]);
    expect(results[1].detail).toMatch(/non-JSON response from .*\/models - does AOS_ROUTER_URL end in \/v1\?/);
  });

  it('reports a failing anonymous request as a failed row without throwing', async () => {
    const flaky = (async (_u: string | URL | Request, init?: RequestInit) => {
      if (!new Headers(init?.headers).get('authorization')) throw new Error('socket hang up');
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const results = await checkRouter(BASE, 'good-key', flaky);
    expect(results.find((r) => r.name === 'router-auth-required')).toEqual({
      name: 'router-auth-required',
      ok: false,
      detail: 'anonymous GET failed: socket hang up',
    });
  });
});

describe('formatResults', () => {
  it('renders one line per check with an ASCII status', () => {
    expect(formatResults([{ name: 'a', ok: true, detail: 'fine' }, { name: 'b', ok: false, detail: 'broken' }])).toBe(
      '[OK]   a - fine\n[FAIL] b - broken',
    );
  });
});
