/**
 * Policy between the office chat and `hermes serve` (JSON-RPC 2.0 over WebSocket).
 * The browser never talks to serve directly: only allowlisted methods pass, with rebuilt params.
 */
export interface RelayContext {
  profiles: readonly string[];
  sessionCwd(profile: string): string;
  known(profile: string): Set<string>;
  remember(profile: string, storedId: string): void;
}

export interface RelayOutput {
  toServer?: string;
  toClient?: string;
}

export const CHAT_METHODS = [
  'ping',
  'client.capabilities',
  'session.create',
  'session.list',
  'session.resume',
  'session.history',
  'session.interrupt',
  'session.close',
  'session.events.since',
  'approval.pending',
  'approval.respond',
  'prompt.submit',
] as const;

type Params = Record<string, unknown>;
type Frame = { id?: string | number | null; method?: unknown; params?: unknown; result?: unknown; error?: unknown };

const APPROVAL_CHOICES = new Set(['once', 'session', 'always', 'deny']);
const FORWARDED_REQUESTS = new Set(['approval', 'clarify']);
const MAX_PROMPT = 20_000;

class Refusal extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const hasId = (f: Frame): f is Frame & { id: string | number } => typeof f.id === 'string' || typeof f.id === 'number';
const encode = (frame: Params): string => JSON.stringify({ jsonrpc: '2.0', ...frame });

function parse(raw: string): Frame | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Frame) : null;
  } catch {
    return null;
  }
}

export class ChatRelay {
  private readonly pending = new Map<string, { method: string; profile: string }>();
  private readonly live = new Map<string, string>();
  private readonly serverRequests = new Map<string, string>();
  private readonly ctx: RelayContext;

  constructor(ctx: RelayContext) {
    this.ctx = ctx;
  }

  fromClient(raw: string): RelayOutput {
    const frame = parse(raw);
    if (!frame) return { toClient: encode({ id: null, error: { code: -32700, message: 'Frame bukan JSON yang valid' } }) };
    if (frame.method === undefined) {
      const answer = this.answer(frame);
      return answer ? { toServer: answer } : {};
    }
    if (!hasId(frame) || typeof frame.method !== 'string') return {};
    try {
      const params = frame.params && typeof frame.params === 'object' ? (frame.params as Params) : {};
      const clean = this.sanitize(frame.method, params);
      this.pending.set(String(frame.id), { method: frame.method, profile: clean.profile });
      return { toServer: encode({ id: frame.id, method: frame.method, params: clean.params }) };
    } catch (err) {
      const code = err instanceof Refusal ? err.code : -32602;
      return { toClient: encode({ id: frame.id, error: { code, message: (err as Error).message } }) };
    }
  }

  fromServer(raw: string): RelayOutput {
    const frame = parse(raw);
    if (!frame) return {};
    if (frame.method === 'event') return { toClient: raw };
    if (typeof frame.method === 'string' && hasId(frame)) {
      if (frame.method === 'ping') return { toServer: encode({ id: frame.id, result: { pong: true } }) };
      if (FORWARDED_REQUESTS.has(frame.method)) {
        this.serverRequests.set(String(frame.id), frame.method);
        return { toClient: raw };
      }
      return { toServer: encode({ id: frame.id, error: { code: -32601, message: `${frame.method} tidak didukung kantor Agentic OS` } }) };
    }
    if (hasId(frame)) {
      const call = this.pending.get(String(frame.id));
      this.pending.delete(String(frame.id));
      if (call && frame.result && typeof frame.result === 'object') {
        return { toClient: encode({ id: frame.id, result: this.track(call, frame.result as Params) }) };
      }
    }
    return { toClient: raw };
  }

  private answer(frame: Frame): string | undefined {
    if (!hasId(frame)) return undefined;
    const id = String(frame.id);
    const method = this.serverRequests.get(id);
    if (!method) return undefined;
    const result = frame.result && typeof frame.result === 'object' ? (frame.result as Params) : {};
    let clean: Params;
    if (method === 'approval') {
      if (!APPROVAL_CHOICES.has(str(result.choice))) return undefined;
      clean = { choice: result.choice };
    } else if (typeof result.answer === 'string') {
      clean = { answer: result.answer };
    } else if (result.answers && typeof result.answers === 'object') {
      clean = { answers: result.answers };
    } else {
      return undefined;
    }
    this.serverRequests.delete(id);
    return encode({ id: frame.id, result: clean });
  }

  private profileOf(params: Params): string {
    const profile = str(params.profile);
    if (!this.ctx.profiles.includes(profile)) throw new Refusal(-32602, `Profile tidak dikenal: ${profile || '-'}`);
    return profile;
  }

  private liveSession(params: Params): { session_id: string; profile: string } {
    const sid = str(params.session_id);
    const profile = this.live.get(sid);
    if (!profile) throw new Refusal(-32602, 'Sesi tidak dikenal; buat atau buka sesi dulu');
    return { session_id: sid, profile };
  }

  private sanitize(method: string, params: Params): { params: Params; profile: string } {
    switch (method) {
      case 'ping':
        return { params: {}, profile: '' };
      case 'client.capabilities':
        return { params: { server_requests: true }, profile: '' };
      case 'session.create': {
        const profile = this.profileOf(params);
        return { params: { profile, cwd: this.ctx.sessionCwd(profile), cwd_explicit: true }, profile };
      }
      case 'session.list': {
        const profile = this.profileOf(params);
        const limit = Math.min(Math.max(Math.trunc(Number(params.limit)) || 20, 1), 50);
        return { params: { profile, limit }, profile };
      }
      case 'session.resume': {
        const profile = this.profileOf(params);
        const sid = str(params.session_id);
        if (!this.ctx.known(profile).has(sid)) throw new Refusal(-32602, 'Hanya sesi yang dibuat dari kantor yang bisa dibuka');
        return { params: { session_id: sid, profile }, profile };
      }
      case 'session.history':
      case 'session.interrupt':
      case 'session.close':
      case 'approval.pending': {
        const s = this.liveSession(params);
        return { params: s, profile: s.profile };
      }
      case 'session.events.since': {
        const s = this.liveSession(params);
        return { params: { ...s, last_seen: typeof params.last_seen === 'number' ? params.last_seen : null }, profile: s.profile };
      }
      case 'prompt.submit': {
        const s = this.liveSession(params);
        const text = str(params.text);
        if (!text.trim()) throw new Refusal(-32602, 'Pesan kosong');
        if (text.length > MAX_PROMPT) throw new Refusal(-32602, `Pesan lebih dari ${MAX_PROMPT} karakter`);
        if (text.trimStart().startsWith('/')) throw new Refusal(-32602, 'Perintah slash tidak didukung dari kantor; pakai Telegram atau CLI');
        return { params: { ...s, text }, profile: s.profile };
      }
      case 'approval.respond': {
        const s = this.liveSession(params);
        const choice = str(params.choice);
        if (!APPROVAL_CHOICES.has(choice)) throw new Refusal(-32602, `Pilihan approval tidak valid: ${choice || '-'}`);
        const requestId = str(params.request_id);
        return { params: { ...s, choice, ...(requestId ? { request_id: requestId } : {}) }, profile: s.profile };
      }
      default:
        throw new Refusal(-32601, `Metode ${method} tidak diizinkan dari kantor`);
    }
  }

  private track(call: { method: string; profile: string }, result: Params): Params {
    if ((call.method === 'session.create' || call.method === 'session.resume') && typeof result.session_id === 'string') {
      this.live.set(result.session_id, call.profile);
    }
    if (call.method === 'session.create' && typeof result.stored_session_id === 'string') {
      this.ctx.remember(call.profile, result.stored_session_id);
    }
    if (Array.isArray(result.open_requests)) {
      for (const r of result.open_requests as Params[]) {
        if (typeof r?.id === 'string' && FORWARDED_REQUESTS.has(str(r.method))) this.serverRequests.set(r.id, str(r.method));
      }
    }
    if (call.method === 'session.list' && Array.isArray(result.sessions)) {
      const known = this.ctx.known(call.profile);
      return { ...result, sessions: (result.sessions as Params[]).filter((row) => known.has(str(row.id)) || known.has(str(row.resolved_id))) };
    }
    return result;
  }
}
