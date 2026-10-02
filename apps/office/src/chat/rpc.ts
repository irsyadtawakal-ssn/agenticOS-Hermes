/** Minimal JSON-RPC 2.0 client for the Core `/v1/chat` relay (which fronts `hermes serve`). */
export interface ChatEvent {
  type: string;
  session_id?: string;
  payload?: Record<string, unknown>;
  seq?: number;
}

export interface ServerRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface ChatSocket {
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export type ChatState = 'idle' | 'connecting' | 'open' | 'closed';

export interface ChatRpcOptions {
  onEvent(event: ChatEvent): void;
  onRequest(request: ServerRequest): void;
  onState(state: ChatState, code?: number): void;
  socketFactory?: (url: string) => ChatSocket;
  timeoutMs?: number;
}

export class RpcError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

interface Pending {
  resolve(value: unknown): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

type Frame = { id?: unknown; method?: unknown; params?: unknown; result?: unknown; error?: { code?: number; message?: string } };

export class ChatRpc {
  state: ChatState = 'idle';
  private socket: ChatSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly url: string;
  private readonly opts: ChatRpcOptions;

  constructor(url: string, opts: ChatRpcOptions) {
    this.url = url;
    this.opts = opts;
  }

  connect(): void {
    if (this.state === 'connecting' || this.state === 'open') return;
    const factory = this.opts.socketFactory ?? ((u: string) => new WebSocket(u) as unknown as ChatSocket);
    const socket = factory(this.url);
    this.socket = socket;
    this.setState('connecting');
    socket.onopen = () => this.setState('open');
    socket.onmessage = (e) => this.receive(String(e.data));
    socket.onerror = () => {};
    socket.onclose = (e) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.failAll(new Error('Koneksi chat terputus'));
      this.setState('closed', e.code);
    };
  }

  request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const socket = this.socket;
    if (!socket || this.state !== 'open') return Promise.reject(new Error('Chat belum terhubung'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: tidak ada jawaban dari Hermes`));
      }, this.opts.timeoutMs ?? 120_000);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  respond(id: string, result: Record<string, unknown>): void {
    this.socket?.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.failAll(new Error('Chat ditutup'));
    this.setState('closed', 1000);
  }

  private receive(text: string): void {
    let frame: Frame;
    try {
      frame = JSON.parse(text) as Frame;
    } catch {
      return;
    }
    if (frame.method === 'event' && frame.params && typeof frame.params === 'object') {
      const event = frame.params as ChatEvent;
      if (event.type === 'gateway.ready') void this.request('client.capabilities', { server_requests: true }).catch(() => {});
      this.opts.onEvent(event);
      return;
    }
    if (typeof frame.method === 'string' && typeof frame.id === 'string') {
      this.opts.onRequest({ id: frame.id, method: frame.method, params: (frame.params ?? {}) as Record<string, unknown> });
      return;
    }
    if (typeof frame.id !== 'number') return;
    const call = this.pending.get(frame.id);
    if (!call) return;
    this.pending.delete(frame.id);
    clearTimeout(call.timer);
    if (frame.error) call.reject(new RpcError(frame.error.code ?? -32603, frame.error.message ?? 'Hermes RPC gagal'));
    else call.resolve(frame.result);
  }

  private failAll(err: Error): void {
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(err);
    }
    this.pending.clear();
  }

  private setState(state: ChatState, code?: number): void {
    this.state = state;
    this.opts.onState(state, code);
  }
}
