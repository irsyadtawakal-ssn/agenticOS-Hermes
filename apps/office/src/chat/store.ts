import { useSyncExternalStore } from 'react';
import { applyChatEvent, type ChatItem, fromTranscript, newItemId, requestItem, resolveRequest, type SessionRow, type TranscriptMessage } from './model.ts';
import { type ChatEvent, ChatRpc, type ChatState, type ServerRequest } from './rpc.ts';

export interface ProfileChat {
  runtimeId: string | null;
  storedId: string | null;
  items: ChatItem[];
  busy: boolean;
  sessions: SessionRow[];
}

export interface ChatStoreState {
  connection: ChatState;
  closeCode: number | null;
  chats: Record<string, ProfileChat>;
}

const EMPTY: ProfileChat = { runtimeId: null, storedId: null, items: [], busy: false, sessions: [] };
const RETRY_MS = [1_000, 3_000, 10_000, 30_000];

let state: ChatStoreState = { connection: 'idle', closeCode: null, chats: {} };
const listeners = new Set<() => void>();
let rpc: ChatRpc | null = null;
let retry = 0;

function set(patch: Partial<ChatStoreState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

const chatOf = (profile: string): ProfileChat => state.chats[profile] ?? EMPTY;

function patchChat(profile: string, patch: Partial<ProfileChat>): void {
  set({ chats: { ...state.chats, [profile]: { ...chatOf(profile), ...patch } } });
}

function notice(profile: string, text: string): void {
  patchChat(profile, { items: [...chatOf(profile).items, { kind: 'notice', id: newItemId(), text, tone: 'error' }], busy: false });
}

function profileOfSession(sessionId: unknown): string | null {
  if (typeof sessionId !== 'string') return null;
  return Object.keys(state.chats).find((p) => state.chats[p]?.runtimeId === sessionId) ?? null;
}

function onEvent(ev: ChatEvent): void {
  const profile = profileOfSession(ev.session_id);
  if (!profile) return;
  const c = chatOf(profile);
  const next = applyChatEvent({ items: c.items, busy: c.busy }, ev);
  if (next.items !== c.items || next.busy !== c.busy) patchChat(profile, next);
}

function onRequest(req: ServerRequest): void {
  const profile = profileOfSession(req.params.session_id);
  const item = requestItem(req);
  if (profile && item) patchChat(profile, { items: [...chatOf(profile).items, item] });
}

function onState(next: ChatState, code?: number): void {
  set({ connection: next, closeCode: code ?? null });
  if (next === 'open') {
    retry = 0;
    void reattach();
  }
  if (next === 'closed' && code !== 1000) {
    const delay = RETRY_MS[Math.min(retry, RETRY_MS.length - 1)];
    retry += 1;
    setTimeout(() => rpc?.connect(), delay);
  }
}

function ensure(): ChatRpc {
  if (!rpc) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    rpc = new ChatRpc(`${protocol}//${window.location.host}/v1/chat`, { onEvent, onRequest, onState });
  }
  rpc.connect();
  return rpc;
}

function ready(): Promise<ChatRpc> {
  const r = ensure();
  if (r.state === 'open') return Promise.resolve(r);
  return new Promise((resolve, reject) => {
    const check = () => {
      if (state.connection !== 'open') return;
      listeners.delete(check);
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      listeners.delete(check);
      reject(new Error('Hermes serve belum terhubung'));
    }, 15_000);
    listeners.add(check);
  });
}

async function resume(profile: string, storedId: string): Promise<void> {
  const r = await ready();
  const res = await r.request<{ session_id: string; messages?: TranscriptMessage[]; open_requests?: ServerRequest[] }>('session.resume', {
    profile,
    session_id: storedId,
  });
  const open = (res.open_requests ?? []).map(requestItem).filter((i): i is ChatItem => i !== null);
  patchChat(profile, { runtimeId: res.session_id, storedId, items: [...fromTranscript(res.messages ?? []), ...open], busy: false });
}

async function reattach(): Promise<void> {
  for (const [profile, c] of Object.entries(state.chats)) {
    if (!c.storedId) continue;
    try {
      await resume(profile, c.storedId);
    } catch (err) {
      patchChat(profile, { runtimeId: null });
      notice(profile, (err as Error).message);
    }
  }
}

async function loadSessions(profile: string): Promise<void> {
  const r = await ready();
  const res = await r.request<{ sessions: SessionRow[] }>('session.list', { profile, limit: 20 });
  patchChat(profile, { sessions: res.sessions });
}

async function newSession(profile: string): Promise<void> {
  const r = await ready();
  const res = await r.request<{ session_id: string; stored_session_id?: string }>('session.create', { profile });
  patchChat(profile, { runtimeId: res.session_id, storedId: res.stored_session_id ?? null, items: [], busy: false });
}

async function guarded(profile: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    notice(profile, (err as Error).message);
  }
}

export const chat = {
  connect: () => void ensure(),
  loadSessions: (profile: string) => guarded(profile, () => loadSessions(profile)),
  newSession: (profile: string) => guarded(profile, () => newSession(profile)),
  resume: (profile: string, storedId: string) => guarded(profile, () => resume(profile, storedId)),
  send: (profile: string, text: string) =>
    guarded(profile, async () => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!chatOf(profile).runtimeId) await newSession(profile);
      const c = chatOf(profile);
      patchChat(profile, { items: [...c.items, { kind: 'user', id: newItemId(), text: trimmed }], busy: true });
      await (await ready()).request('prompt.submit', { session_id: c.runtimeId, text: trimmed });
    }),
  interrupt: (profile: string) =>
    guarded(profile, async () => {
      const c = chatOf(profile);
      if (c.runtimeId) await (await ready()).request('session.interrupt', { session_id: c.runtimeId });
    }),
  answer(profile: string, item: ChatItem, value: string): void {
    if (!rpc) return;
    if (item.kind === 'approval') rpc.respond(item.requestId, { choice: value });
    else if (item.kind === 'clarify') rpc.respond(item.requestId, item.qid ? { answers: { [item.qid]: value } } : { answer: value });
    else return;
    patchChat(profile, { items: resolveRequest(chatOf(profile).items, item.requestId, value) });
  },
};

export function useChat<T>(selector: (s: ChatStoreState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(state),
  );
}
