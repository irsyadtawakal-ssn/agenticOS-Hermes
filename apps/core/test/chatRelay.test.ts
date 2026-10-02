import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChatRelay, type RelayContext } from '../src/chatRelay.js';
import { knownChatSessions, rememberChatSession } from '../src/chatSessions.js';
import { openCoreDb } from '../src/db.js';

const ROOT = join('D:', 'ws', 'chat');

function ctx(seed: Record<string, string[]> = {}) {
  const known: Record<string, string[]> = { ...seed };
  const remembered: Array<[string, string]> = [];
  const context: RelayContext = {
    profiles: ['chief', 'researcher', 'secretary', 'content', 'dev'],
    chatRoot: ROOT,
    known: (p) => new Set(known[p] ?? []),
    remember: (p, id) => {
      remembered.push([p, id]);
      (known[p] ??= []).push(id);
    },
  };
  return { context, remembered };
}

const req = (id: number | string, method: string, params: Record<string, unknown> = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
const res = (id: number | string, result: unknown) => JSON.stringify({ jsonrpc: '2.0', id, result });
const parse = (s?: string) => (s === undefined ? undefined : JSON.parse(s));

function withSession(profile = 'chief') {
  const c = ctx();
  const r = new ChatRelay(c.context);
  r.fromClient(req(1, 'session.create', { profile }));
  r.fromServer(res(1, { session_id: 'rt1', stored_session_id: 'st1', message_count: 0, messages: [] }));
  return { r, ...c };
}

describe('chat sessions store', () => {
  it('remembers office sessions per profile', () => {
    const db = openCoreDb(':memory:');
    rememberChatSession(db, 'chief', 'st1', 1);
    rememberChatSession(db, 'chief', 'st1', 2);
    rememberChatSession(db, 'dev', 'st2', 3);
    expect([...knownChatSessions(db, 'chief')]).toEqual(['st1']);
    expect([...knownChatSessions(db, 'researcher')]).toEqual([]);
  });
});

describe('ChatRelay client frames', () => {
  it('refuses methods outside the allowlist', () => {
    const r = new ChatRelay(ctx().context);
    for (const method of ['shell.exec', 'cli.exec', 'config.set', 'plugins.manage', 'session.control']) {
      const out = r.fromClient(req(9, method, { command: 'dir' }));
      expect(out.toServer).toBeUndefined();
      expect(parse(out.toClient)).toMatchObject({ id: 9, error: { code: -32601 } });
    }
  });

  it('forces the chat cwd and drops overrides on session.create', () => {
    const r = new ChatRelay(ctx().context);
    const out = r.fromClient(req(2, 'session.create', { profile: 'researcher', cwd: 'D:\\MIT', model: 'x', provider: 'openai' }));
    expect(parse(out.toServer)).toEqual({
      jsonrpc: '2.0',
      id: 2,
      method: 'session.create',
      params: { profile: 'researcher', cwd: join(ROOT, 'researcher'), cwd_explicit: true },
    });
  });

  it('rejects unknown profiles', () => {
    const r = new ChatRelay(ctx().context);
    expect(parse(r.fromClient(req(3, 'session.create', { profile: 'root' })).toClient)).toMatchObject({ id: 3, error: { code: -32602 } });
  });

  it('remembers created sessions and only lets prompts reach live ones', () => {
    const c = ctx();
    const r = new ChatRelay(c.context);
    expect(parse(r.fromClient(req(4, 'prompt.submit', { session_id: 'rt1', text: 'halo' })).toClient)).toMatchObject({ error: { code: -32602 } });
    r.fromClient(req(5, 'session.create', { profile: 'chief' }));
    const back = r.fromServer(res(5, { session_id: 'rt1', stored_session_id: 'st1', message_count: 0, messages: [] }));
    expect(parse(back.toClient)).toMatchObject({ id: 5, result: { session_id: 'rt1' } });
    expect(c.remembered).toEqual([['chief', 'st1']]);
    expect(parse(r.fromClient(req(6, 'prompt.submit', { session_id: 'rt1', text: 'halo', queued: true })).toServer)).toEqual({
      jsonrpc: '2.0',
      id: 6,
      method: 'prompt.submit',
      params: { session_id: 'rt1', profile: 'chief', text: 'halo' },
    });
  });

  it('refuses slash commands and empty prompts', () => {
    const { r } = withSession();
    const slash = parse(r.fromClient(req(7, 'prompt.submit', { session_id: 'rt1', text: '  /yolo' })).toClient);
    expect(slash).toMatchObject({ id: 7, error: { code: -32602 } });
    expect(slash.error.message).toContain('slash');
    expect(parse(r.fromClient(req(8, 'prompt.submit', { session_id: 'rt1', text: '   ' })).toClient)).toMatchObject({ error: { code: -32602 } });
  });

  it('filters session.list to sessions created from the office', () => {
    const r = new ChatRelay(ctx({ chief: ['st1'] }).context);
    r.fromClient(req(10, 'session.list', { profile: 'chief', limit: 500 }));
    const out = parse(
      r.fromServer(
        res(10, {
          sessions: [
            { id: 'st1', title: 'office', preview: '', started_at: 1, message_count: 2, source: 'tui' },
            { id: 'tg1', title: 'telegram', preview: '', started_at: 1, message_count: 9, source: 'telegram' },
          ],
        }),
      ).toClient,
    );
    expect(out.result.sessions.map((s: { id: string }) => s.id)).toEqual(['st1']);
  });

  it('caps session.list and only resumes office sessions', () => {
    const r = new ChatRelay(ctx({ chief: ['st1'] }).context);
    expect(parse(r.fromClient(req(11, 'session.list', { profile: 'chief', limit: 500 })).toServer).params).toEqual({ profile: 'chief', limit: 50 });
    expect(parse(r.fromClient(req(12, 'session.resume', { profile: 'chief', session_id: 'tg1' })).toClient)).toMatchObject({ error: { code: -32602 } });
    expect(parse(r.fromClient(req(13, 'session.resume', { profile: 'chief', session_id: 'st1', eager_build: true })).toServer).params).toEqual({ session_id: 'st1', profile: 'chief' });
    r.fromServer(res(13, { session_id: 'rt9', message_count: 0, messages: [] }));
    expect(parse(r.fromClient(req(14, 'session.interrupt', { session_id: 'rt9' })).toServer).params).toEqual({ session_id: 'rt9', profile: 'chief' });
  });

  it('validates approval.respond', () => {
    const { r } = withSession('dev');
    expect(parse(r.fromClient(req(15, 'approval.respond', { session_id: 'rt1', choice: 'yolo' })).toClient)).toMatchObject({ error: { code: -32602 } });
    expect(parse(r.fromClient(req(16, 'approval.respond', { session_id: 'rt1', choice: 'deny', all: true, request_id: 'a1' })).toServer).params).toEqual({
      session_id: 'rt1',
      profile: 'dev',
      choice: 'deny',
      request_id: 'a1',
    });
  });

  it('answers malformed frames without forwarding', () => {
    const r = new ChatRelay(ctx().context);
    expect(parse(r.fromClient('not json').toClient)).toMatchObject({ error: { code: -32700 } });
    expect(r.fromClient(JSON.stringify({ jsonrpc: '2.0', method: 'prompt.submit', params: {} }))).toEqual({});
  });
});

describe('ChatRelay server frames', () => {
  it('forwards events untouched', () => {
    const r = new ChatRelay(ctx().context);
    const frame = JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'rt1', payload: { text: 'po' } } });
    expect(r.fromServer(frame)).toEqual({ toClient: frame });
  });

  it('forwards approval requests and exactly one valid owner answer', () => {
    const { r } = withSession('dev');
    const ask = JSON.stringify({ jsonrpc: '2.0', id: 'srv-1', method: 'approval', params: { session_id: 'rt1', request_id: 'a1', command: 'git push', choices: ['once', 'session', 'always', 'deny'] } });
    expect(r.fromServer(ask)).toEqual({ toClient: ask });
    expect(r.fromClient(res('srv-1', { choice: 'yolo' }))).toEqual({});
    expect(parse(r.fromClient(res('srv-1', { choice: 'deny', all: true })).toServer)).toEqual({ jsonrpc: '2.0', id: 'srv-1', result: { choice: 'deny' } });
    expect(r.fromClient(res('srv-1', { choice: 'once' }))).toEqual({});
  });

  it('forwards clarify answers', () => {
    const { r } = withSession();
    r.fromServer(JSON.stringify({ jsonrpc: '2.0', id: 'srv-2', method: 'clarify', params: { session_id: 'rt1', question: 'Warna?' } }));
    expect(parse(r.fromClient(res('srv-2', { answer: 'biru', extra: 1 })).toServer)).toEqual({ jsonrpc: '2.0', id: 'srv-2', result: { answer: 'biru' } });
  });

  it('declines server requests the office cannot answer and answers pings', () => {
    const r = new ChatRelay(ctx().context);
    const secret = r.fromServer(JSON.stringify({ jsonrpc: '2.0', id: 'srv-3', method: 'secret', params: { name: 'OPENAI_API_KEY' } }));
    expect(secret.toClient).toBeUndefined();
    expect(parse(secret.toServer)).toMatchObject({ id: 'srv-3', error: { code: -32601 } });
    expect(parse(r.fromServer(req('srv-4', 'ping')).toServer)).toEqual({ jsonrpc: '2.0', id: 'srv-4', result: { pong: true } });
  });

  it('accepts answers to requests re-delivered through open_requests', () => {
    const r = new ChatRelay(ctx({ dev: ['st1'] }).context);
    r.fromClient(req(20, 'session.resume', { profile: 'dev', session_id: 'st1' }));
    r.fromServer(res(20, { session_id: 'rt2', message_count: 1, messages: [], open_requests: [{ id: 'srv-9', method: 'approval', params: { session_id: 'rt2' } }] }));
    expect(parse(r.fromClient(res('srv-9', { choice: 'once' })).toServer)).toEqual({ jsonrpc: '2.0', id: 'srv-9', result: { choice: 'once' } });
  });
});
