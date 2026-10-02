import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openCoreDb } from '../src/db.js';
import { createHub } from '../src/hub.js';
import { buildServer, type UpstreamSocket } from '../src/server.js';

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
    approverToken: 'at',
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

async function makeWith(extra: Partial<Parameters<typeof buildServer>[0]> = {}) {
  const hub = createHub();
  const db = openCoreDb(':memory:');
  app = await buildServer({
    db, bridgeToken: 'bt', uiToken: 'ut', approverToken: 'at', hub,
    kanban: () => ({ tasks: [], runs: [] }), now: () => 1790000000000, ...extra,
  });
  return { app, hub, db };
}

const request = {
  profile: 'dev', task_id: 't_1', session_id: 's1', rule_id: 'git-push', tool: 'terminal',
  args_hash: 'a'.repeat(64), args_preview: '{"command": "git push"}', reason: 'git push',
};

describe('approval routes', () => {
  it('lets the bridge create and dedupe park requests and notifies once', async () => {
    const created: string[] = [];
    const { app, hub } = await makeWith({ onApprovalCreated: (a) => created.push(a.id) });
    const topics: string[] = [];
    hub.subscribe((m) => topics.push(JSON.parse(m).topic));
    expect((await app.inject({ method: 'POST', url: '/v1/approvals', payload: request })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/v1/approvals', payload: request, headers: { authorization: 'Bearer at' } })).statusCode).toBe(401);
    const first = await app.inject({ method: 'POST', url: '/v1/approvals', payload: request, headers: { 'x-aos-bridge-token': 'bt' } });
    expect(first.json()).toMatchObject({ status: 'pending', created: true });
    const second = await app.inject({ method: 'POST', url: '/v1/approvals', payload: request, headers: { 'x-aos-bridge-token': 'bt' } });
    expect(second.json()).toEqual({ id: first.json().id, status: 'pending', created: false });
    expect(created).toEqual([first.json().id]);
    expect(topics).toEqual(['approvals']);
    const bad = await app.inject({ method: 'POST', url: '/v1/approvals', payload: { ...request, args_hash: 'x' }, headers: { 'x-aos-bridge-token': 'bt' } });
    expect(bad.statusCode).toBe(400);
  });

  it('lets the owner list and decide, and the bridge consume the grant once', async () => {
    const decided: string[] = [];
    const { app } = await makeWith({ onApprovalDecided: (a) => decided.push(`${a.id}:${a.status}`) });
    const { id } = (await app.inject({ method: 'POST', url: '/v1/approvals', payload: request, headers: { 'x-aos-bridge-token': 'bt' } })).json();
    expect((await app.inject({ method: 'GET', url: '/v1/approvals?status=pending', headers: { 'x-aos-bridge-token': 'bt' } })).statusCode).toBe(401);
    const list = await app.inject({ method: 'GET', url: '/v1/approvals?status=pending', headers: { authorization: 'Bearer at' } });
    expect(list.json().map((a: { id: string }) => a.id)).toEqual([id]);
    expect((await app.inject({ method: 'GET', url: '/v1/approvals?status=bogus&token=ut' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: `/v1/approvals/${id}`, headers: { 'x-aos-bridge-token': 'bt' } })).json().id).toBe(id);
    expect((await app.inject({ method: 'GET', url: '/v1/approvals/zzzzzz?token=ut' })).statusCode).toBe(404);
    const byBridge = await app.inject({ method: 'POST', url: `/v1/approvals/${id}/decision`, payload: { decision: 'approve' }, headers: { 'x-aos-bridge-token': 'bt' } });
    expect(byBridge.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: `/v1/approvals/${id}/decision`, payload: { decision: 'approve', note: 'boleh', by: 'chief' }, headers: { authorization: 'Bearer at' } });
    expect(ok.json()).toMatchObject({ id, status: 'approved', instruction: 'boleh', decided_by: 'chief' });
    expect(decided).toEqual([`${id}:approved`]);
    const again = await app.inject({ method: 'POST', url: `/v1/approvals/${id}/decision`, payload: { decision: 'deny' }, headers: { authorization: 'Bearer ut' } });
    expect(again.statusCode).toBe(409);
    const match = { task_id: 't_1', tool: 'terminal', args_hash: 'a'.repeat(64) };
    expect((await app.inject({ method: 'POST', url: '/v1/approvals/consume', payload: match, headers: { 'x-aos-bridge-token': 'bt' } })).json()).toEqual({ status: 'consumed', id });
    expect((await app.inject({ method: 'POST', url: '/v1/approvals/consume', payload: match, headers: { 'x-aos-bridge-token': 'bt' } })).json()).toEqual({ status: 'none' });
    expect((await app.inject({ method: 'POST', url: '/v1/approvals/consume', payload: match, headers: { authorization: 'Bearer at' } })).statusCode).toBe(401);
  });

  it('accepts breaker events, records native approvals and hands accepted events to onEvents', async () => {
    const seen: string[] = [];
    const { app, db } = await makeWith({ onEvents: (evs) => seen.push(...evs.map((e) => e.type)) });
    const base = { ts: 1790000000000, profile: 'chief', session_id: 's', task_id: null, mode: 'telegram' };
    const events = [
      { ...base, id: 'b'.repeat(32), type: 'breaker.tripped', payload: { tool: 'web_search', reason: 'repeat' } },
      { ...base, id: 'c'.repeat(32), type: 'tool.started', payload: { tool: 'terminal', tool_call_id: 'c1', args_preview: '{}', policy: { decision: 'native', rule_id: 'delete', args_hash: 'a'.repeat(64) } } },
    ];
    const res = await app.inject({ method: 'POST', url: '/v1/events', payload: events, headers: { 'x-aos-bridge-token': 'bt' } });
    expect(res.json()).toEqual({ inserted: 2, duplicates: 0, rejected: 0 });
    expect(seen).toEqual(['breaker.tripped', 'tool.started']);
    expect(db.prepare('SELECT status FROM approvals WHERE id = ?').get(`n_${'c'.repeat(32)}`)).toEqual({ status: 'pending' });
  });

  it('keeps ingesting when a reaction callback throws', async () => {
    const { app } = await makeWith({ onEvents: () => { throw new Error('boom'); } });
    const res = await app.inject({ method: 'POST', url: '/v1/events', payload: [event], headers: { 'x-aos-bridge-token': 'bt' } });
    expect(res.json()).toEqual({ inserted: 1, duplicates: 0, rejected: 0 });
  });
});

describe('office routes', () => {
  it('stores office state behind the UI token and accepts the aos_ui cookie', async () => {
    const { app } = await makeWith();
    expect((await app.inject({ method: 'GET', url: '/v1/office/state' })).statusCode).toBe(401);
    const empty = await app.inject({ method: 'GET', url: '/v1/office/state', headers: { cookie: 'aos_ui=ut' } });
    expect(empty.json()).toEqual({ layout: null, seats: {}, settings: {} });
    const bad = await app.inject({ method: 'PUT', url: '/v1/office/state/layout', payload: { version: 9 }, headers: { authorization: 'Bearer ut' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'PUT', url: '/v1/office/state/settings', payload: { alwaysShowLabels: true }, headers: { authorization: 'Bearer ut' } });
    expect(ok.json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: '/v1/office/state?token=ut' })).json().settings).toEqual({ alwaysShowLabels: true });
    expect((await app.inject({ method: 'PUT', url: '/v1/office/state/nope', payload: {}, headers: { authorization: 'Bearer ut' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/agents', headers: { cookie: 'aos_ui=ut' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/agents', headers: { cookie: 'aos_ui=at' } })).statusCode).toBe(401);
  });

  it('logs in with a valid UI token via an httpOnly cookie', async () => {
    const { app } = await makeWith();
    expect((await app.inject({ method: 'GET', url: '/office/login?token=wrong' })).statusCode).toBe(401);
    const res = await app.inject({ method: 'GET', url: '/office/login?token=ut' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/office/');
    expect(String(res.headers['set-cookie'])).toBe('aos_ui=ut; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000');
  });

  it('serves the built office with SPA fallback, or a build hint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-office-'));
    writeFileSync(join(dir, 'index.html'), '<html>office</html>');
    const { app: first } = await makeWith({ officeDir: dir });
    const page = await first.inject({ method: 'GET', url: '/office/' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.body).toBe('<html>office</html>');
    expect((await first.inject({ method: 'GET', url: '/office/some/route' })).body).toBe('<html>office</html>');
    expect((await first.inject({ method: 'GET', url: '/office' })).statusCode).toBe(302);
    await first.close();
    const { app: noBuild } = await makeWith({ officeDir: join(dir, 'missing') });
    const hint = await noBuild.inject({ method: 'GET', url: '/office/' });
    expect(hint.statusCode).toBe(404);
    expect(hint.body).toMatch(/pnpm office:build/);
  });
});

describe('workspace routes (M5a)', () => {
  it('serves health components, daily costs and recent events behind the UI token', async () => {
    const { app } = await makeWith({
      probeHealth: async () => [{ id: 'core', label: 'OS Core', status: 'ok', detail: 'berjalan' }],
      timeZone: 'Asia/Jakarta',
    });
    expect((await app.inject({ method: 'GET', url: '/v1/health/components' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/v1/health/components?token=ut' })).json()).toEqual([
      { id: 'core', label: 'OS Core', status: 'ok', detail: 'berjalan' },
    ]);
    const daily = await app.inject({ method: 'GET', url: '/v1/costs/daily?days=2&token=ut' });
    expect(daily.json()).toHaveLength(2);
    expect((await app.inject({ method: 'GET', url: '/v1/costs/daily?days=99&token=ut' })).statusCode).toBe(400);
    await app.inject({ method: 'POST', url: '/v1/events', payload: [event], headers: { 'x-aos-bridge-token': 'bt' } });
    const recent = await app.inject({ method: 'GET', url: '/v1/events?profile=dev&limit=5&token=ut' });
    expect(recent.json().map((e: { id: string }) => e.id)).toEqual([event.id]);
    expect((await app.inject({ method: 'GET', url: '/v1/events?token=ut' })).statusCode).toBe(400);
  });
});

describe('kanban actions (M5a)', () => {
  const tasks = [
    { id: 't_1', title: 'a', assignee: 'dev', status: 'blocked', created_at: 1, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null },
    { id: 't_2', title: 'b', assignee: 'dev', status: 'done', created_at: 1, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null },
  ];

  it('moves cards through the CLI and reports refusals and CLI failures', async () => {
    const calls: string[][] = [];
    let code = 0;
    const { app } = await makeWith({
      kanban: () => ({ tasks, runs: [] }),
      runHermes: async (args) => (calls.push(args), { code, stdout: code ? '' : 'Unblocked t_1', stderr: code ? 'boom' : '' }),
    });
    const ok = await app.inject({ method: 'POST', url: '/v1/kanban/t_1/move', payload: { to: 'ready', note: 'lanjut' }, headers: { authorization: 'Bearer ut' } });
    expect(ok.json()).toEqual({ ok: true, output: 'Unblocked t_1' });
    expect(calls).toEqual([['kanban', 'unblock', '--reason', 'lanjut', 't_1']]);
    expect((await app.inject({ method: 'POST', url: '/v1/kanban/t_2/move', payload: { to: 'ready' }, headers: { authorization: 'Bearer ut' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/v1/kanban/t_9/move', payload: { to: 'ready' }, headers: { authorization: 'Bearer ut' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/v1/kanban/t_1/move', payload: { to: 'ready' } })).statusCode).toBe(401);
    code = 1;
    const failed = await app.inject({ method: 'POST', url: '/v1/kanban/t_1/move', payload: { to: 'ready' }, headers: { authorization: 'Bearer ut' } });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({ error: 'boom' });
  });

  it('creates cards with a workspace folder and removes it when the CLI fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aos-ws-'));
    let code = 0;
    const { app } = await makeWith({ workspacesRoot: root, runHermes: async () => ({ code, stdout: 'Created t_9', stderr: code ? 'no board' : '' }) });
    const res = await app.inject({ method: 'POST', url: '/v1/kanban', payload: { title: 'Uji kartu', assignee: 'researcher', body: 'Goal: x' }, headers: { authorization: 'Bearer ut' } });
    expect(res.json()).toMatchObject({ ok: true, output: 'Created t_9' });
    expect(existsSync(res.json().workspace)).toBe(true);
    code = 1;
    const bad = await app.inject({ method: 'POST', url: '/v1/kanban', payload: { title: 'Gagal', assignee: 'dev' }, headers: { authorization: 'Bearer ut' } });
    expect(bad.statusCode).toBe(502);
    expect(readdirSync(root)).toHaveLength(1);
    expect((await app.inject({ method: 'POST', url: '/v1/kanban', payload: { title: '', assignee: 'dev' }, headers: { authorization: 'Bearer ut' } })).statusCode).toBe(400);
  });
});

class FakeUpstream implements UpstreamSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closed = false;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
}

async function makeChat() {
  const upstreams: FakeUpstream[] = [];
  app = await buildServer({
    db: openCoreDb(':memory:'),
    bridgeToken: 'bt',
    uiToken: 'ut',
    approverToken: 'at',
    hub: createHub(),
    kanban: () => ({ tasks: [], runs: [] }),
    chat: {
      connect: () => {
        const u = new FakeUpstream();
        upstreams.push(u);
        return u;
      },
      context: { profiles: ['chief'], sessionCwd: (p) => `/workspace/${p}`, known: () => new Set(), remember: () => {} },
    },
  });
  await app.ready();
  return upstreams;
}

const nextMessage = (ws: { once(event: 'message', cb: (data: Buffer) => void): unknown }) =>
  new Promise<unknown>((resolve) => ws.once('message', (data) => resolve(JSON.parse(String(data)))));

describe('/v1/chat relay', () => {
  it('queues client frames until serve opens and filters them', async () => {
    const upstreams = await makeChat();
    const ws = await app!.injectWS('/v1/chat?token=ut');
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'session.create', params: { profile: 'chief', cwd: 'D:/MIT' } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(upstreams[0].sent).toEqual([]);
    upstreams[0].onopen?.();
    expect(JSON.parse(upstreams[0].sent[0])).toMatchObject({ method: 'session.create', params: { cwd: '/workspace/chief' } });
    const refused = nextMessage(ws);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'shell.exec', params: { command: 'dir' } }));
    expect(await refused).toMatchObject({ id: 2, error: { code: -32601 } });
    expect(upstreams[0].sent).toHaveLength(1);
    const event = nextMessage(ws);
    upstreams[0].onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'gateway.ready' } }) });
    expect(await event).toMatchObject({ method: 'event', params: { type: 'gateway.ready' } });
    ws.terminate();
    await new Promise((r) => setTimeout(r, 20));
    expect(upstreams[0].closed).toBe(true);
  });

  it('closes with 4502 when serve drops', async () => {
    const upstreams = await makeChat();
    const ws = await app!.injectWS('/v1/chat?token=ut');
    const closed = new Promise<number>((resolve) => ws.once('close', (code: number) => resolve(code)));
    upstreams[0].onclose?.();
    expect(await closed).toBe(4502);
  });

  it('closes with 4503 when serve is disabled and rejects bad tokens', async () => {
    await make();
    await app!.ready();
    const ws = await app!.injectWS('/v1/chat?token=ut');
    const code = await new Promise<number>((resolve) => ws.once('close', (c: number) => resolve(c)));
    expect(code).toBe(4503);
    await expect(app!.injectWS('/v1/chat?token=wrong')).rejects.toThrow();
  });
});
