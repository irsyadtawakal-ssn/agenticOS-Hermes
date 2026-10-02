import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '../vendor/pixel-agents/core/src/messages.ts';
import { HermesTransport } from '../src/hermes/transport.ts';

class FakeSocket {
  static last: FakeSocket | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  push(topic: string, data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ topic, data }) });
  }
}

type Call = { url: string; method: string; body?: unknown };

function fakeFetch(routes: Record<string, unknown>, calls: Call[]) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = `${init?.method ?? 'GET'} ${url}`;
    return new Response(JSON.stringify(routes[key] ?? { ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(state: unknown = { layout: null, seats: {}, settings: {} }) {
  const calls: Call[] = [];
  const fetchImpl = fakeFetch(
    {
      'GET /v1/office/state': state,
      'GET /v1/agents': [{ profile: 'dev', state: 'thinking', task_id: null, detail: null, updated_at: 1 }],
      'GET /v1/approvals?status=pending': [],
    },
    calls,
  );
  const t = new HermesTransport({
    wsUrl: 'ws://office.test/v1/stream',
    fetchImpl,
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    loadAssets: async () => ({ messages: [{ type: 'characterSpritesLoaded', characters: [] }], defaultLayout: { version: 1, default: true } }),
    version: '1.4.1',
    reconnectDelays: () => 1,
  });
  const got: ServerMessage[] = [];
  t.onMessage((m) => got.push(m));
  return { t, got, calls };
}

describe('HermesTransport', () => {
  it('connects to the Core stream and reports state', async () => {
    const { t } = setup();
    const states: string[] = [];
    t.onStateChange((s) => states.push(s));
    t.connect();
    expect(FakeSocket.last?.url).toBe('ws://office.test/v1/stream');
    FakeSocket.last!.open();
    await t.ready;
    expect(t.state).toBe('connected');
    expect(states).toEqual(['connected']);
  });

  it('bootstraps capabilities, assets, settings, the default layout and the roster on webviewReady', async () => {
    const { t, got } = setup();
    t.connect();
    FakeSocket.last!.open();
    t.send({ type: 'webviewReady' });
    await flush();
    await flush();
    const types = got.map((m) => m.type);
    expect(types.slice(0, 5)).toEqual(['providerCapabilities', 'characterSpritesLoaded', 'settingsLoaded', 'layoutLoaded', 'existingAgents']);
    expect(got.find((m) => m.type === 'layoutLoaded')).toEqual({ type: 'layoutLoaded', layout: { version: 1, default: true } });
    expect(got.find((m) => m.type === 'settingsLoaded')).toMatchObject({
      soundEnabled: false,
      alwaysShowLabels: true,
      hooksEnabled: false,
      hooksInfoShown: true,
      extensionVersion: '1.4.1',
      lastSeenVersion: '1.4',
    });
    expect(got).toContainEqual({ type: 'agentStatus', id: 5, status: 'active' });
  });

  it('prefers the layout and settings saved in Core', async () => {
    const { t, got } = setup({ layout: { version: 1, saved: true }, seats: {}, settings: { alwaysShowLabels: false, soundEnabled: true } });
    t.connect();
    FakeSocket.last!.open();
    t.send({ type: 'webviewReady' });
    await flush();
    await flush();
    expect(got.find((m) => m.type === 'layoutLoaded')).toEqual({ type: 'layoutLoaded', layout: { version: 1, saved: true } });
    expect(got.find((m) => m.type === 'settingsLoaded')).toMatchObject({ alwaysShowLabels: false, soundEnabled: true });
  });

  it('translates stream topics through the adapter', () => {
    const { t, got } = setup();
    t.connect();
    FakeSocket.last!.open();
    FakeSocket.last!.push('events', [{ id: 'e1', ts: 1, type: 'llm.started', profile: 'researcher', mode: 'kanban', payload: {} }]);
    FakeSocket.last!.push('approvals', [{ id: 'abc234', profile: 'dev', status: 'pending', mode: 'park', tool: 'terminal', task_id: 't' }]);
    FakeSocket.last!.push('agents', []);
    expect(got).toEqual([
      { type: 'agentStatus', id: 2, status: 'active' },
      { type: 'agentToolPermission', id: 5 },
    ]);
  });

  it('persists layout, seats and settings to Core and ignores editor-only messages', async () => {
    const { t, calls } = setup();
    t.connect();
    FakeSocket.last!.open();
    t.send({ type: 'saveLayout', layout: { version: 1, cols: 1, rows: 1, tiles: [0], furniture: [] } });
    t.send({ type: 'saveAgentSeats', seats: { '1': { palette: 0, hueShift: 0, seatId: 'a' } } });
    t.send({ type: 'setAlwaysShowLabels', enabled: false });
    t.send({ type: 'setSoundEnabled', enabled: true });
    t.send({ type: 'launchAgent' });
    t.send({ type: 'focusAgent', id: 1 });
    await flush();
    expect(calls.filter((c) => c.method === 'PUT')).toEqual([
      { url: '/v1/office/state/layout', method: 'PUT', body: { version: 1, cols: 1, rows: 1, tiles: [0], furniture: [] } },
      { url: '/v1/office/state/seats', method: 'PUT', body: { '1': { palette: 0, hueShift: 0, seatId: 'a' } } },
      { url: '/v1/office/state/settings', method: 'PUT', body: { alwaysShowLabels: false } },
      { url: '/v1/office/state/settings', method: 'PUT', body: { alwaysShowLabels: false, soundEnabled: true } },
    ]);
  });

  it('exposes raw Core topics, focus clicks and programmatic selection', () => {
    const { t, got } = setup();
    const topics: string[] = [];
    const focus: number[] = [];
    t.onCoreTopic((topic) => topics.push(topic));
    t.onFocus((id) => focus.push(id));
    t.connect();
    FakeSocket.last!.open();
    FakeSocket.last!.push('health', [{ id: 'core' }]);
    FakeSocket.last!.push('events', []);
    t.send({ type: 'focusAgent', id: 3 });
    t.select(2);
    expect(topics).toEqual(['health', 'events']);
    expect(focus).toEqual([3]);
    expect(got).toContainEqual({ type: 'agentSelected', id: 2 });
  });

  it('reconnects after a drop and re-sends the roster snapshot', async () => {
    const { t, got } = setup();
    t.connect();
    const first = FakeSocket.last!;
    first.open();
    t.send({ type: 'webviewReady' });
    await flush();
    await flush();
    got.length = 0;
    first.onclose?.();
    expect(t.state).toBe('reconnecting');
    await new Promise((r) => setTimeout(r, 5));
    const second = FakeSocket.last!;
    expect(second).not.toBe(first);
    second.open();
    await flush();
    await flush();
    expect(got.map((m) => m.type)).toContain('existingAgents');
    t.dispose();
    expect(second.closed).toBe(true);
    expect(t.state).toBe('disconnected');
  });
});
