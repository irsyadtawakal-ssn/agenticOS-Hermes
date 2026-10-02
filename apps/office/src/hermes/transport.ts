import {
  TRANSPORT_STATE_CONNECTED,
  TRANSPORT_STATE_CONNECTING,
  TRANSPORT_STATE_DISCONNECTED,
  TRANSPORT_STATE_RECONNECTING,
} from '../../vendor/pixel-agents/core/src/constants.ts';
import type { AgentSeatMeta, ClientMessage, ServerMessage } from '../../vendor/pixel-agents/core/src/messages.ts';
import type { MessageTransport, TransportState } from '../../vendor/pixel-agents/core/src/transport.ts';
import { type CoreAgentState, type CoreApproval, type CoreEvent, HermesAdapter } from './adapter.ts';
import { type LoadedAssets, loadBrowserAssets } from './assets.ts';

export interface HermesTransportOptions {
  wsUrl: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
  loadAssets?: () => Promise<LoadedAssets>;
  adapter?: HermesAdapter;
  version?: string;
  reconnectDelays?: (attempt: number) => number;
}

interface OfficeSettings {
  soundEnabled?: boolean;
  alwaysShowLabels?: boolean;
}

interface OfficeState {
  layout: unknown;
  seats: Record<string, AgentSeatMeta>;
  settings: OfficeSettings;
}

/** Feeds the vendored Pixel Agents office from OS Core (WebSocket stream + REST). */
export class HermesTransport implements MessageTransport {
  private ws: WebSocket | null = null;
  private handlers: Array<(m: ServerMessage) => void> = [];
  private stateHandlers: Array<(s: TransportState) => void> = [];
  private topicHandlers: Array<(topic: string, data: unknown) => void> = [];
  private focusHandlers: Array<(agentId: number) => void> = [];
  private _state: TransportState = TRANSPORT_STATE_CONNECTING;
  private attempts = 0;
  private disposed = false;
  private booted = false;
  private settings: OfficeSettings = {};
  private resolveReady!: () => void;
  readonly ready: Promise<void>;
  private readonly fetchImpl: typeof fetch;
  private readonly Ws: typeof WebSocket;
  private readonly adapter: HermesAdapter;
  private readonly loadAssets: () => Promise<LoadedAssets>;
  private readonly version: string;
  private readonly delay: (attempt: number) => number;
  private readonly wsUrl: string;

  constructor(opts: HermesTransportOptions) {
    this.wsUrl = opts.wsUrl;
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.Ws = opts.WebSocketImpl ?? WebSocket;
    this.adapter = opts.adapter ?? new HermesAdapter();
    this.loadAssets = opts.loadAssets ?? loadBrowserAssets;
    this.version = opts.version ?? '1.4.1';
    this.delay = opts.reconnectDelays ?? ((n) => Math.min(1000 * 2 ** n, 30_000));
    this.ready = new Promise((resolve) => {
      this.resolveReady = resolve;
    });
  }

  get state(): TransportState {
    return this._state;
  }

  private setState(next: TransportState): void {
    if (this._state === next) return;
    this._state = next;
    for (const h of this.stateHandlers) h(next);
  }

  private deliver(messages: ServerMessage[]): void {
    for (const m of messages) for (const h of this.handlers) h(m);
  }

  connect(): void {
    if (this.disposed) return;
    const ws = new this.Ws(this.wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      const reconnect = this.attempts > 0;
      this.attempts = 0;
      this.setState(TRANSPORT_STATE_CONNECTED);
      this.resolveReady();
      if (reconnect && this.booted) void this.sendRoster().catch(() => undefined);
    };
    ws.onmessage = (e: MessageEvent) => {
      try {
        const { topic, data } = JSON.parse(String(e.data)) as { topic: string; data: unknown };
        if (topic === 'events' && Array.isArray(data)) this.deliver(this.adapter.onEvents(data as CoreEvent[]));
        if (topic === 'approvals' && Array.isArray(data)) this.deliver(this.adapter.onApprovals(data as CoreApproval[]));
        for (const h of this.topicHandlers) h(topic, data);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (this.disposed) return;
      this.setState(TRANSPORT_STATE_RECONNECTING);
      const wait = this.delay(this.attempts);
      this.attempts += 1;
      setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => {};
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.fetchImpl(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  private put(key: string, value: unknown): void {
    void this.fetchImpl(`/v1/office/state/${key}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    }).catch(() => undefined);
  }

  private async sendRoster(seats?: Record<string, AgentSeatMeta>): Promise<void> {
    const [agents, approvals, saved] = await Promise.all([
      this.getJson<CoreAgentState[]>('/v1/agents'),
      this.getJson<CoreApproval[]>('/v1/approvals?status=pending'),
      seats ? Promise.resolve(seats) : this.getJson<OfficeState>('/v1/office/state').then((s) => s.seats ?? {}),
    ]);
    this.deliver(this.adapter.snapshot(agents, approvals, saved));
  }

  private async bootstrap(): Promise<void> {
    this.deliver([this.adapter.capabilities()]);
    const assets = await this.loadAssets();
    this.deliver(assets.messages);
    const state = await this.getJson<OfficeState>('/v1/office/state');
    this.settings = state.settings ?? {};
    this.deliver([
      {
        type: 'settingsLoaded',
        soundEnabled: this.settings.soundEnabled ?? false,
        alwaysShowLabels: this.settings.alwaysShowLabels ?? true,
        lastSeenVersion: this.version.split('.').slice(0, 2).join('.'),
        extensionVersion: this.version,
        watchAllSessions: false,
        ghostHeadlessAgents: false,
        hooksEnabled: false,
        hooksInfoShown: true,
        externalAssetDirectories: [],
        showAreas: false,
      },
      { type: 'layoutLoaded', layout: (state.layout ?? assets.defaultLayout) as Record<string, unknown> | null },
    ]);
    await this.sendRoster(state.seats ?? {});
    this.booted = true;
  }

  send(message: ClientMessage): void {
    switch (message.type) {
      case 'webviewReady':
        void this.bootstrap().catch((err: unknown) => console.error('[office] bootstrap failed', err));
        break;
      case 'saveLayout':
        this.put('layout', message.layout);
        break;
      case 'saveAgentSeats':
        this.put('seats', message.seats);
        break;
      case 'setAlwaysShowLabels':
        this.settings = { ...this.settings, alwaysShowLabels: message.enabled };
        this.put('settings', this.settings);
        break;
      case 'setSoundEnabled':
        this.settings = { ...this.settings, soundEnabled: message.enabled };
        this.put('settings', this.settings);
        break;
      case 'focusAgent':
        for (const h of this.focusHandlers) h(message.id);
        break;
      default:
        break; // editor/VS Code-only messages have no Agentic OS meaning yet (chat dock = M5)
    }
  }

  onMessage(handler: (m: ServerMessage) => void): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  onStateChange(handler: (s: TransportState) => void): () => void {
    this.stateHandlers.push(handler);
    return () => {
      this.stateHandlers = this.stateHandlers.filter((h) => h !== handler);
    };
  }

  /** Raw Core stream frames, after the adapter has animated the office. */
  onCoreTopic(handler: (topic: string, data: unknown) => void): () => void {
    this.topicHandlers.push(handler);
    return () => {
      this.topicHandlers = this.topicHandlers.filter((h) => h !== handler);
    };
  }

  /** Character clicks (the vendored office sends `focusAgent`). */
  onFocus(handler: (agentId: number) => void): () => void {
    this.focusHandlers.push(handler);
    return () => {
      this.focusHandlers = this.focusHandlers.filter((h) => h !== handler);
    };
  }

  /** Highlight a character in the office (keyboard shortcuts). */
  select(agentId: number): void {
    this.deliver([{ type: 'agentSelected', id: agentId }]);
  }

  dispose(): void {
    this.disposed = true;
    this.ws?.close();
    this.ws = null;
    this.handlers = [];
    this.setState(TRANSPORT_STATE_DISCONNECTED);
    this.stateHandlers = [];
  }
}

/** The live office transport, set once the vendored office creates it (used by the dock/HUD shell). */
export let officeTransport: HermesTransport | null = null;

export function createHermesTransport(): HermesTransport {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const transport = new HermesTransport({ wsUrl: `${protocol}//${window.location.host}/v1/stream` });
  transport.connect();
  officeTransport = transport;
  return transport;
}
