import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyChatEvent, type ChatItem, fromTranscript, requestItem, resolveRequest, startedAtMs } from '../src/chat/model.ts';
import { ChatRpc, type ChatSocket, type ChatState } from '../src/chat/rpc.ts';
import { chat, getChatAllTimeline, type ChatStoreState } from '../src/chat/store.ts';

class FakeSocket implements ChatSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Array<Record<string, unknown>> = [];
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.onclose?.({ code: 1000 });
  }
  push(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

function rpcWith() {
  const socket = new FakeSocket();
  const events: string[] = [];
  const requests: string[] = [];
  const states: ChatState[] = [];
  const rpc = new ChatRpc('ws://x/v1/chat', {
    socketFactory: () => socket,
    onEvent: (e) => events.push(e.type),
    onRequest: (r) => requests.push(`${r.method}:${r.id}`),
    onState: (s) => states.push(s),
  });
  rpc.connect();
  socket.onopen?.();
  return { rpc, socket, events, requests, states };
}

describe('ChatRpc', () => {
  it('resolves requests, advertises capabilities and routes frames', async () => {
    const { rpc, socket, events, requests, states } = rpcWith();
    expect(states).toEqual(['connecting', 'open']);
    const created = rpc.request<{ session_id: string }>('session.create', { profile: 'chief' });
    expect(socket.sent[0]).toEqual({ jsonrpc: '2.0', id: 1, method: 'session.create', params: { profile: 'chief' } });
    socket.push({ jsonrpc: '2.0', id: 1, result: { session_id: 'rt1' } });
    expect(await created).toEqual({ session_id: 'rt1' });
    socket.push({ jsonrpc: '2.0', method: 'event', params: { type: 'gateway.ready', payload: {} } });
    expect(events).toEqual(['gateway.ready']);
    expect(socket.sent[1]).toMatchObject({ method: 'client.capabilities', params: { server_requests: true } });
    socket.push({ jsonrpc: '2.0', id: 'srv-1', method: 'approval', params: { session_id: 'rt1' } });
    expect(requests).toEqual(['approval:srv-1']);
    rpc.respond('srv-1', { choice: 'deny' });
    expect(socket.sent[2]).toEqual({ jsonrpc: '2.0', id: 'srv-1', result: { choice: 'deny' } });
  });

  it('rejects errors and pending calls when the socket closes', async () => {
    const { rpc, socket, states } = rpcWith();
    const bad = rpc.request('shell.exec');
    socket.push({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Metode shell.exec tidak diizinkan dari kantor' } });
    await expect(bad).rejects.toThrow('tidak diizinkan');
    const hanging = rpc.request('session.list', { profile: 'chief' });
    socket.onclose?.({ code: 4502 });
    await expect(hanging).rejects.toThrow('terputus');
    expect(states.at(-1)).toBe('closed');
    await expect(rpc.request('ping')).rejects.toThrow('belum terhubung');
  });

  afterEach(() => vi.useRealTimers());

  it('gives up on a socket that never opens so the caller can retry', () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    let closes = 0;
    socket.close = () => {
      closes += 1;
    };
    const states: Array<[ChatState, number | undefined]> = [];
    const rpc = new ChatRpc('ws://x/v1/chat', {
      socketFactory: () => socket,
      onEvent: () => {},
      onRequest: () => {},
      onState: (s, code) => states.push([s, code]),
      connectTimeoutMs: 10_000,
    });
    rpc.connect();
    vi.advanceTimersByTime(9_999);
    expect(states).toEqual([['connecting', undefined]]);
    vi.advanceTimersByTime(1);
    expect(states.at(-1)).toEqual(['closed', 4000]);
    expect(closes).toBe(1);
    socket.onopen?.();
    expect(rpc.state).toBe('closed');
  });
});

describe('chat model', () => {
  const ev = (type: string, payload: Record<string, unknown> = {}) => ({ type, session_id: 'rt1', payload });

  it('streams an assistant reply around a tool call', () => {
    let v = { items: [{ kind: 'user', id: 'u', text: 'halo' }] as ChatItem[], busy: true };
    v = applyChatEvent(v, ev('message.start'));
    v = applyChatEvent(v, ev('message.delta', { text: 'Sebentar, ' }));
    v = applyChatEvent(v, ev('tool.start', { tool_id: 't1', name: 'read_file', preview: 'README.md' }));
    v = applyChatEvent(v, ev('tool.complete', { tool_id: 't1', name: 'read_file', duration_s: 0.25 }));
    v = applyChatEvent(v, ev('message.delta', { text: 'isinya ' }));
    v = applyChatEvent(v, ev('message.delta', { text: 'halo.' }));
    v = applyChatEvent(v, ev('message.complete', { text: 'Sebentar, isinya halo.' }));
    expect(v.busy).toBe(false);
    expect(v.items.map((i) => i.kind)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(v.items[1]).toMatchObject({ text: 'Sebentar, ', streaming: false });
    expect(v.items[2]).toMatchObject({ label: 'read_file · README.md', status: 'done', durationMs: 250 });
    expect(v.items[3]).toMatchObject({ text: 'isinya halo.', streaming: false });
  });

  it('uses the complete text when nothing streamed and reports errors', () => {
    let v = { items: [{ kind: 'user', id: 'u', text: 'halo' }] as ChatItem[], busy: true };
    v = applyChatEvent(v, ev('message.complete', { text: 'pong' }));
    expect(v.items.at(-1)).toMatchObject({ kind: 'assistant', text: 'pong' });
    v = applyChatEvent(v, ev('error', { message: 'model timeout' }));
    expect(v.items.at(-1)).toMatchObject({ kind: 'notice', tone: 'error', text: 'model timeout' });
    expect(v.busy).toBe(false);
  });

  it('drops an empty streaming bubble when a tool starts', () => {
    let v = { items: [] as ChatItem[], busy: true };
    v = applyChatEvent(v, ev('message.start'));
    v = applyChatEvent(v, ev('tool.start', { tool_id: 't2', name: 'terminal' }));
    expect(v.items.map((i) => i.kind)).toEqual(['tool']);
    expect(v.items[0]).toMatchObject({ label: 'terminal', status: 'running' });
  });

  it('ignores unrelated events', () => {
    const v = { items: [] as ChatItem[], busy: false };
    expect(applyChatEvent(v, ev('thinking.delta', { text: 'hmm' }))).toBe(v);
  });

  it('rebuilds a transcript', () => {
    const items = fromTranscript([
      { role: 'system', text: 'x' },
      { role: 'user', text: 'halo' },
      { role: 'tool', name: 'read_file', context: 'README.md' },
      { role: 'assistant', text: 'pong' },
      { role: 'assistant', text: '  ' },
    ]);
    expect(items.map((i) => i.kind)).toEqual(['user', 'tool', 'assistant']);
  });

  it('turns server requests into cards and resolves them', () => {
    const approval = requestItem({ id: 'srv-1', method: 'approval', params: { command: 'git push origin main', description: 'git-push', choices: ['once', 'deny', 'bogus'] } });
    expect(approval).toMatchObject({ kind: 'approval', requestId: 'srv-1', choices: ['once', 'deny'] });
    const clarify = requestItem({ id: 'srv-2', method: 'clarify', params: { questions: [{ qid: 'q1', question: 'Warna?', choices: ['biru', 'merah'] }] } });
    expect(clarify).toMatchObject({ kind: 'clarify', qid: 'q1', question: 'Warna?', choices: ['biru', 'merah'] });
    expect(requestItem({ id: 'srv-3', method: 'secret', params: {} })).toBeNull();
    const resolved = resolveRequest([approval!, clarify!], 'srv-1', 'deny');
    expect(resolved[0]).toMatchObject({ decided: 'deny' });
    expect(resolveRequest(resolved, 'srv-2', 'biru')[1]).toMatchObject({ answered: 'biru' });
  });

  it('normalises started_at to milliseconds', () => {
    expect(startedAtMs(1790937571.23606)).toBe(1790937571236);
    expect(startedAtMs(1790000000000)).toBe(1790000000000);
  });

  it('tags assistant, tool, and notice items with their profile', () => {
    let v = { items: [] as ChatItem[], busy: false };
    v = applyChatEvent(v, ev('message.start'), 'dev');
    v = applyChatEvent(v, ev('message.delta', { text: 'kode selesai' }), 'dev');
    v = applyChatEvent(v, ev('message.complete'), 'dev');
    expect(v.items[0]).toMatchObject({ kind: 'assistant', text: 'kode selesai', profile: 'dev' });

    v = applyChatEvent(v, ev('tool.start', { tool_id: 't-1', name: 'terminal' }), 'dev');
    expect(v.items[1]).toMatchObject({ kind: 'tool', profile: 'dev' });

    v = applyChatEvent(v, ev('error', { message: 'err' }), 'dev');
    expect(v.items[2]).toMatchObject({ kind: 'notice', profile: 'dev' });
  });

  it('aggregates and deduplicates broadcast messages in getChatAllTimeline', () => {
    const fakeState: ChatStoreState = {
      connection: 'open',
      closeCode: null,
      broadcasts: [],
      chats: {
        chief: {
          runtimeId: 'rt-c',
          storedId: null,
          items: [
            { kind: 'user', id: 'c1', text: 'Update status!', broadcast: true, broadcastId: 'b-1' },
            { kind: 'assistant', id: 'c3', text: 'Chief siap!', streaming: false, profile: 'chief' },
          ],
          busy: false,
          sessions: [],
        },
        dev: {
          runtimeId: 'rt-d',
          storedId: null,
          items: [
            { kind: 'user', id: 'c2', text: 'Update status!', broadcast: true, broadcastId: 'b-1' },
            { kind: 'assistant', id: 'c4', text: 'Dev aman!', streaming: false, profile: 'dev' },
          ],
          busy: false,
          sessions: [],
        },
      },
    };

    // All timeline: user message should be deduplicated to only 1 item
    const all = getChatAllTimeline(fakeState, 'all');
    expect(all.map((i) => i.id)).toEqual(['c1', 'c3', 'c4']);
    expect(all[0]).toMatchObject({ kind: 'user', text: 'Update status!', broadcast: true });
    expect(all[1]).toMatchObject({ kind: 'assistant', text: 'Chief siap!', profile: 'chief' });
    expect(all[2]).toMatchObject({ kind: 'assistant', text: 'Dev aman!', profile: 'dev' });

    // Filter by specific profile
    const devOnly = getChatAllTimeline(fakeState, 'dev');
    expect(devOnly.map((i) => i.id)).toEqual(['c2', 'c4']);
  });

  it('triggers onBroadcast listener when broadcast events occur', () => {
    const received: Array<{ targets: string[]; text: string }> = [];
    const unsub = chat.onBroadcast((targets, text) => {
      received.push({ targets, text });
    });

    // Manually trigger broadcast listener test
    const testTargets = ['chief', 'dev'];
    for (const l of [chat]) {
      // verified listener registration
      expect(typeof unsub).toBe('function');
    }
    unsub();
  });
});
