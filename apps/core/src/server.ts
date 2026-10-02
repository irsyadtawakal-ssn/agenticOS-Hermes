import { timingSafeEqual } from 'node:crypto';
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
import { costSummary } from './costs.js';
import type { Db } from './db.js';
import { type AosEvent, ingestEvents } from './events.js';
import type { Hub } from './hub.js';
import type { KanbanSnapshot } from './kanban.js';
import { listAgentStates } from './state.js';

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
  return typeof query?.token === 'string' ? query.token : '';
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

  return app;
}
