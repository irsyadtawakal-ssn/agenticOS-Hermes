import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openCoreDb } from '../src/db.js';
import { createHub } from '../src/hub.js';
import { buildServer } from '../src/server.js';

const event = {
  id: 'f'.repeat(32), ts: 1790000000000, type: 'tool.started', profile: 'dev', session_id: 's', task_id: null,
  mode: 'cli', payload: { tool: 'terminal', category: 'run' },
};

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function make() {
  const hub = createHub();
  app = await buildServer({
    db: openCoreDb(':memory:'),
    bridgeToken: 'bt',
    uiToken: 'ut',
    hub,
    kanban: () => ({ tasks: [{ id: 't_1', title: 'x', assignee: 'researcher', status: 'ready', created_at: 1, started_at: null, completed_at: null, workspace_kind: null, workspace_path: null }], runs: [] }),
    now: () => 1790000000000,
  });
  return { app, hub };
}

describe('buildServer', () => {
  it('serves health without auth', async () => {
    const { app } = await make();
    expect((await app.inject({ method: 'GET', url: '/v1/health' })).json()).toEqual({ ok: true });
  });

  it('accepts bridge events only with the bridge token and publishes them', async () => {
    const { app, hub } = await make();
    const seen: string[] = [];
    hub.subscribe((m) => seen.push(m));
    const bad = await app.inject({ method: 'POST', url: '/v1/events', payload: [event], headers: { 'x-aos-bridge-token': 'nope' } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/v1/events', payload: [event], headers: { 'x-aos-bridge-token': 'bt' } });
    expect(ok.json()).toEqual({ inserted: 1, duplicates: 0, rejected: 0 });
    expect(seen.map((m) => JSON.parse(m).topic)).toEqual(['events', 'agents']);
    const notArray = await app.inject({ method: 'POST', url: '/v1/events', payload: { x: 1 }, headers: { 'x-aos-bridge-token': 'bt' } });
    expect(notArray.statusCode).toBe(400);
  });

  it('protects UI routes with bearer or query token', async () => {
    const { app } = await make();
    expect((await app.inject({ method: 'GET', url: '/v1/agents' })).statusCode).toBe(401);
    const agents = await app.inject({ method: 'GET', url: '/v1/agents', headers: { authorization: 'Bearer ut' } });
    expect(agents.statusCode).toBe(200);
    expect(agents.json().map((a: { profile: string }) => a.profile)).toContain('dev');
    expect((await app.inject({ method: 'GET', url: '/v1/kanban?token=ut' })).json().tasks[0].id).toBe('t_1');
    const costs = await app.inject({ method: 'GET', url: '/v1/costs?token=ut' });
    expect(costs.json()).toMatchObject({ since: 1790000000000 - 86_400_000, until: 1790000000000, total: { calls: 0 } });
  });

  it('streams hub messages to authorised websocket clients', async () => {
    const { app, hub } = await make();
    await app.ready();
    const ws = await app.injectWS('/v1/stream?token=ut');
    const message = new Promise<string>((resolve) => ws.on('message', (data) => resolve(String(data))));
    hub.publish('kanban', [{ id: 't_1', change: 'added' }]);
    expect(JSON.parse(await message)).toEqual({ topic: 'kanban', data: [{ id: 't_1', change: 'added' }] });
    ws.terminate();
  });

  it('rejects an unauthorised websocket upgrade', async () => {
    const { app, hub } = await make();
    await app.ready();
    await expect(app.injectWS('/v1/stream?token=wrong')).rejects.toThrow();
    expect(hub.size()).toBe(0);
  });
});
