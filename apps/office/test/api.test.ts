import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCard, decide, getDailyCosts, moveCard } from '../src/shell/api.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stub(status: number, body: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  });
  return calls;
}

describe('api', () => {
  it('posts decisions as the office', async () => {
    const calls = stub(200, { id: 'abc234', status: 'denied' });
    await decide('abc234', 'deny', 'jangan');
    expect(calls[0].url).toBe('/v1/approvals/abc234/decision');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ decision: 'deny', note: 'jangan', by: 'office' });
  });

  it('moves and creates cards, surfacing Core errors', async () => {
    stub(409, { error: 'Kartu berstatus done tidak bisa dipindah ke ready dari office.' });
    await expect(moveCard('t_1', 'ready', '')).rejects.toThrow('tidak bisa dipindah');
    const calls = stub(200, { ok: true, output: 'Created t_9', workspace: 'D:\\ws\\x' });
    await expect(createCard({ title: 'x', assignee: 'dev', body: '' })).resolves.toMatchObject({ ok: true });
    expect(calls[0].url).toBe('/v1/kanban');
    stub(200, [{ day: '2026-10-02', cost_usd: 1, calls: 2 }]);
    await expect(getDailyCosts(7)).resolves.toHaveLength(1);
  });
});
