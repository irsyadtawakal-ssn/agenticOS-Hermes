import { timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, rmdirSync } from 'node:fs';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import {
  APPROVAL_STATUSES,
  type Approval,
  type ApprovalStatus,
  consumeGrant,
  createParkApproval,
  CreateApprovalSchema,
  decideApproval,
  DecisionSchema,
  getApproval,
  GrantMatchSchema,
  listApprovals,
} from './approvals.js';
import type { BackupResult } from './backup.js';
import { buildBriefing } from './briefing.js';
import { ChatRelay, type RelayContext } from './chatRelay.js';
import { costSummary, dailyCosts } from './costs.js';
import type { Db } from './db.js';
import { type AosEvent, ingestEvents, recentEvents } from './events.js';
import type { HealthComponent } from './health.js';
import type { RunHermes } from './hermesCli.js';
import type { Hub } from './hub.js';
import type { KanbanSnapshot } from './kanban.js';
import { localStamp, planCreate, planMove } from './kanbanActions.js';
import {
  contentType,
  cookieToken,
  getOfficeState,
  OFFICE_KEYS,
  type OfficeKey,
  putOfficeState,
  resolveOfficeFile,
  validateOfficeValue,
} from './office.js';
import { listAgentStates } from './state.js';

export interface UpstreamSocket {
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

const MAX_QUEUED_FRAMES = 100;

export interface ServerDeps {
  db: Db;
  bridgeToken: string;
  uiToken: string;
  approverToken: string;
  hub: Hub;
  kanban: () => KanbanSnapshot;
  now?: () => number;
  onEvents?: (events: AosEvent[]) => void;
  onApprovalCreated?: (approval: Approval) => void;
  onApprovalDecided?: (approval: Approval) => void;
  officeDir?: string;
  probeHealth?: () => Promise<HealthComponent[]>;
  timeZone?: string;
  runHermes?: RunHermes;
  workspacesRoot?: string;
  chat?: { connect(): UpstreamSocket; context: RelayContext };
  runBackup?: () => Promise<BackupResult>;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function bearerOrQueryToken(req: FastifyRequest): string {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const query = req.query as Record<string, unknown> | undefined;
  if (typeof query?.token === 'string') return query.token;
  return cookieToken(req.headers.cookie);
}

function safely<T>(fn: ((arg: T) => void) | undefined, arg: T): void {
  try {
    fn?.(arg);
  } catch (err) {
    console.error(`[aos-core] reaction failed: ${(err as Error).message}`);
  }
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const now = deps.now ?? Date.now;
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  await app.register(websocket);

  const isBridge = (req: FastifyRequest) => {
    const token = req.headers['x-aos-bridge-token'];
    return typeof token === 'string' && safeEqual(token, deps.bridgeToken);
  };
  const isUi = (req: FastifyRequest) => safeEqual(bearerOrQueryToken(req), deps.uiToken);
  const isOwner = (req: FastifyRequest) => {
    const token = bearerOrQueryToken(req);
    return safeEqual(token, deps.uiToken) || safeEqual(token, deps.approverToken);
  };
  const guard = (allowed: (req: FastifyRequest) => boolean) => async (req: FastifyRequest, reply: FastifyReply) => {
    if (!allowed(req)) return reply.code(401).send({ error: 'unauthorized' });
  };
  const requireUi = guard(isUi);
  const requireBridge = guard(isBridge);
  const requireOwner = guard(isOwner);
  const requireBridgeOrOwner = guard((req) => isBridge(req) || isOwner(req));

  app.get('/v1/health', async () => ({ ok: true }));

  app.post('/v1/events', { preHandler: requireBridge }, async (req, reply) => {
    try {
      const result = ingestEvents(deps.db, req.body);
      if (result.accepted.length > 0) {
        deps.hub.publish('events', result.accepted);
        deps.hub.publish('agents', listAgentStates(deps.db));
        safely(deps.onEvents, result.accepted);
      }
      return { inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.post('/v1/approvals', { preHandler: requireBridge }, async (req, reply) => {
    const parsed = CreateApprovalSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid approval request' });
    const { approval, created } = createParkApproval(deps.db, parsed.data, now());
    if (created) {
      deps.hub.publish('approvals', [approval]);
      safely(deps.onApprovalCreated, approval);
    }
    return { id: approval.id, status: approval.status, created };
  });

  app.post('/v1/approvals/consume', { preHandler: requireBridge }, async (req, reply) => {
    const parsed = GrantMatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid grant match' });
    const result = consumeGrant(deps.db, parsed.data, now());
    if (result.status === 'consumed') deps.hub.publish('approvals', [getApproval(deps.db, result.id)]);
    return result;
  });

  app.get('/v1/approvals', { preHandler: requireOwner }, async (req, reply) => {
    const status = (req.query as Record<string, string | undefined>).status;
    if (status && !(APPROVAL_STATUSES as readonly string[]).includes(status)) return reply.code(400).send({ error: 'invalid status' });
    return listApprovals(deps.db, status as ApprovalStatus | undefined);
  });

  app.get('/v1/approvals/:id', { preHandler: requireBridgeOrOwner }, async (req, reply) => {
    const approval = getApproval(deps.db, (req.params as { id: string }).id);
    return approval ?? reply.code(404).send({ error: 'not found' });
  });

  app.post('/v1/approvals/:id/decision', { preHandler: requireOwner }, async (req, reply) => {
    const parsed = DecisionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid decision' });
    const id = (req.params as { id: string }).id;
    const result = decideApproval(deps.db, id, parsed.data.decision, { note: parsed.data.note, by: parsed.data.by }, now());
    if (!result.ok) return reply.code(result.code).send({ error: result.code === 404 ? 'not found' : 'not pending' });
    deps.hub.publish('approvals', [result.approval]);
    safely(deps.onApprovalDecided, result.approval);
    return result.approval;
  });

  app.get('/v1/agents', { preHandler: requireUi }, async () => listAgentStates(deps.db));
  app.get('/v1/kanban', { preHandler: requireUi }, async () => ({ tasks: deps.kanban().tasks }));
  app.get('/v1/costs', { preHandler: requireUi }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const until = q.until ? Number(q.until) : now();
    const since = q.since ? Number(q.since) : until - 86_400_000;
    return costSummary(deps.db, since, until);
  });

  app.get('/v1/stream', { websocket: true, preHandler: requireUi }, (socket) => {
    const off = deps.hub.subscribe((message) => socket.send(message));
    socket.on('close', off);
  });

  app.get('/v1/chat', { websocket: true, preHandler: requireUi }, (socket) => {
    if (!deps.chat) {
      socket.close(4503, 'hermes serve nonaktif');
      return;
    }
    const relay = new ChatRelay(deps.chat.context);
    const upstream = deps.chat.connect();
    const queue: string[] = [];
    let open = false;
    let done = false;
    const toClient = (frame?: string) => {
      if (frame && !done) socket.send(frame);
    };
    const toServer = (frame?: string) => {
      if (!frame) return;
      if (open) upstream.send(frame);
      else if (queue.length < MAX_QUEUED_FRAMES) queue.push(frame);
    };
    upstream.onopen = () => {
      open = true;
      for (const frame of queue.splice(0)) upstream.send(frame);
    };
    upstream.onmessage = (e) => {
      const out = relay.fromServer(String(e.data));
      toServer(out.toServer);
      toClient(out.toClient);
    };
    upstream.onerror = () => {};
    upstream.onclose = () => {
      if (done) return;
      done = true;
      socket.close(4502, 'hermes serve terputus');
    };
    socket.on('message', (data: Buffer) => {
      const out = relay.fromClient(String(data));
      toServer(out.toServer);
      toClient(out.toClient);
    });
    socket.on('close', () => {
      done = true;
      upstream.close();
    });
  });

  app.get('/v1/health/components', { preHandler: requireUi }, async () =>
    deps.probeHealth ? deps.probeHealth() : [{ id: 'core', label: 'OS Core', status: 'ok', detail: 'berjalan' }],
  );

  app.get('/v1/costs/daily', { preHandler: requireUi }, async (req, reply) => {
    const days = Number((req.query as Record<string, string | undefined>).days ?? 7);
    if (!Number.isInteger(days) || days < 1 || days > 31) return reply.code(400).send({ error: 'days must be 1-31' });
    return dailyCosts(deps.db, days, now(), deps.timeZone ?? 'Asia/Jakarta');
  });

  app.post('/v1/backup', { preHandler: requireOwner }, async (_req, reply) => {
    if (!deps.runBackup) return reply.code(503).send({ error: 'backup tidak tersedia' });
    try {
      return await deps.runBackup();
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });

  app.get('/v1/briefing', { preHandler: requireBridgeOrOwner }, async () => {
    const tz = deps.timeZone ?? 'Asia/Jakarta';
    const [yesterday] = dailyCosts(deps.db, 2, now(), tz);
    return buildBriefing(deps.kanban().tasks, listApprovals(deps.db, 'pending'), yesterday, now(), tz);
  });

  app.get('/v1/events', { preHandler: requireUi }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (!q.profile) return reply.code(400).send({ error: 'profile is required' });
    return recentEvents(deps.db, q.profile, Number(q.limit ?? 50) || 50);
  });

  app.post('/v1/kanban/:id/move', { preHandler: requireUi }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as { to?: unknown; note?: unknown };
    const task = deps.kanban().tasks.find((t) => t.id === id);
    if (!task) return reply.code(404).send({ error: 'kartu tidak ditemukan' });
    const plan = planMove(task, String(body.to ?? ''), typeof body.note === 'string' ? body.note.slice(0, 500) : '');
    if ('error' in plan) return reply.code(409).send({ error: plan.error });
    if (!deps.runHermes) return reply.code(503).send({ error: 'hermes runner unavailable' });
    const r = await deps.runHermes(plan.args);
    if (r.code !== 0) return reply.code(502).send({ error: (r.stderr || r.stdout).trim().slice(0, 300) });
    return { ok: true, output: r.stdout.trim().slice(0, 500) };
  });

  app.post('/v1/kanban', { preHandler: requireUi }, async (req, reply) => {
    if (!deps.runHermes || !deps.workspacesRoot) return reply.code(503).send({ error: 'hermes runner unavailable' });
    const stamp = localStamp(now(), deps.timeZone ?? 'Asia/Jakarta');
    const plan = planCreate((req.body ?? {}) as Record<string, unknown>, deps.workspacesRoot, stamp);
    if ('error' in plan) return reply.code(400).send({ error: plan.error });
    mkdirSync(plan.workspace, { recursive: true });
    const r = await deps.runHermes(plan.args);
    if (r.code !== 0) {
      try {
        rmdirSync(plan.workspace);
      } catch {
        // folder not empty or already gone: leave it
      }
      return reply.code(502).send({ error: (r.stderr || r.stdout).trim().slice(0, 300) });
    }
    return { ok: true, output: r.stdout.trim().slice(0, 500), workspace: plan.workspace };
  });

  app.get('/v1/office/state', { preHandler: requireUi }, async () => getOfficeState(deps.db));

  app.put('/v1/office/state/:key', { preHandler: requireUi }, async (req, reply) => {
    const key = (req.params as { key: string }).key;
    if (!(OFFICE_KEYS as readonly string[]).includes(key)) return reply.code(404).send({ error: 'unknown office key' });
    const problem = validateOfficeValue(key, req.body);
    if (problem) return reply.code(400).send({ error: problem });
    putOfficeState(deps.db, key as OfficeKey, req.body, now());
    return { ok: true };
  });

  app.get('/office/login', async (req, reply) => {
    const token = (req.query as Record<string, unknown>).token;
    if (typeof token !== 'string' || !safeEqual(token, deps.uiToken)) return reply.code(401).send({ error: 'unauthorized' });
    reply.header('set-cookie', `aos_ui=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
    return reply.redirect('/office/', 302);
  });

  app.get('/office', async (_req, reply) => reply.redirect('/office/', 302));

  app.get('/office/*', async (req, reply) => {
    const file = deps.officeDir ? resolveOfficeFile(deps.officeDir, req.url) : null;
    if (!file) {
      return reply.code(404).type('text/plain; charset=utf-8').send('Office belum di-build: jalankan `pnpm office:build`.');
    }
    return reply.type(contentType(file)).send(readFileSync(file));
  });

  return app;
}
