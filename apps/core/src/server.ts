import { timingSafeEqual } from 'node:crypto';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { costSummary } from './costs.js';
import type { Db } from './db.js';
import { ingestEvents } from './events.js';
import type { Hub } from './hub.js';
import type { KanbanSnapshot } from './kanban.js';
import { listAgentStates } from './state.js';

export interface ServerDeps {
  db: Db;
  bridgeToken: string;
  uiToken: string;
  hub: Hub;
  kanban: () => KanbanSnapshot;
  now?: () => number;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function uiToken(req: FastifyRequest): string {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const query = req.query as Record<string, unknown> | undefined;
  return typeof query?.token === 'string' ? query.token : '';
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const now = deps.now ?? Date.now;
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  await app.register(websocket);

  const requireUi = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!safeEqual(uiToken(req), deps.uiToken)) return reply.code(401).send({ error: 'unauthorized' });
  };

  app.get('/v1/health', async () => ({ ok: true }));

  app.post('/v1/events', async (req, reply) => {
    const token = req.headers['x-aos-bridge-token'];
    if (typeof token !== 'string' || !safeEqual(token, deps.bridgeToken)) return reply.code(401).send({ error: 'unauthorized' });
    try {
      const result = ingestEvents(deps.db, req.body);
      if (result.accepted.length > 0) {
        deps.hub.publish('events', result.accepted);
        deps.hub.publish('agents', listAgentStates(deps.db));
      }
      return { inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
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
