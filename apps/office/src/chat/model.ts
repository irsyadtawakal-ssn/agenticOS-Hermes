import type { ChatEvent, ServerRequest } from './rpc.ts';

export type ApprovalChoice = 'once' | 'session' | 'always' | 'deny';

export type ChatItem =
  | { kind: 'user'; id: string; text: string; broadcast?: boolean; broadcastId?: string; targetCount?: number; targetProfiles?: string[] }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean; profile?: string }
  | { kind: 'tool'; id: string; name: string; label: string; status: 'running' | 'done'; durationMs?: number; profile?: string }
  | { kind: 'approval'; id: string; requestId: string; command: string; description: string; choices: ApprovalChoice[]; decided?: ApprovalChoice; profile?: string }
  | { kind: 'clarify'; id: string; requestId: string; qid?: string; question: string; choices: string[]; answered?: string; profile?: string }
  | { kind: 'notice'; id: string; text: string; tone: 'info' | 'error'; profile?: string };

export interface ChatView {
  items: ChatItem[];
  busy: boolean;
}

export interface TranscriptMessage {
  role: string;
  text?: string | null;
  name?: string | null;
  context?: string | null;
}

export interface SessionRow {
  id: string;
  title: string;
  preview: string;
  started_at: number;
  message_count: number;
}

const CHOICES: ApprovalChoice[] = ['once', 'session', 'always', 'deny'];
const s = (v: unknown): string => (typeof v === 'string' ? v : '');
const toolLabel = (name: string, detail: string): string => (detail && detail !== name ? `${name} · ${detail}` : name);

let counter = 0;
export function newItemId(): string {
  counter += 1;
  return `c${counter}`;
}

/** Hermes reports `started_at` in (fractional) seconds. */
export function startedAtMs(v: number): number {
  return Math.round(v < 1e12 ? v * 1000 : v);
}

/** Close the open streaming bubble (dropping it when empty) so later deltas start a new one. */
function settle(items: ChatItem[]): ChatItem[] {
  const last = items[items.length - 1];
  if (last?.kind !== 'assistant' || !last.streaming) return items;
  return last.text ? [...items.slice(0, -1), { ...last, streaming: false }] : items.slice(0, -1);
}

function answeredSinceLastUser(items: ChatItem[]): boolean {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (items[i].kind === 'user') return false;
    if (items[i].kind === 'assistant') return true;
  }
  return false;
}

export function applyChatEvent(view: ChatView, ev: ChatEvent, profile?: string): ChatView {
  const p = ev.payload ?? {};
  const items = view.items;
  const last = items[items.length - 1];
  const prof = profile ? { profile } : {};
  switch (ev.type) {
    case 'message.start':
      if (last?.kind === 'assistant' && last.streaming) return { items, busy: true };
      return { items: [...items, { kind: 'assistant', id: newItemId(), text: '', streaming: true, ...prof }], busy: true };
    case 'message.delta': {
      const text = s(p.text);
      if (last?.kind === 'assistant' && last.streaming) return { items: [...items.slice(0, -1), { ...last, text: last.text + text }], busy: true };
      return { items: [...items, { kind: 'assistant', id: newItemId(), text, streaming: true, ...prof }], busy: true };
    }
    case 'message.complete': {
      const text = s(p.text);
      let next = settle(items);
      if (last?.kind === 'assistant' && last.streaming && !last.text && text) {
        next = [...next, { kind: 'assistant', id: last.id, text, streaming: false, ...prof }];
      } else if (text && !answeredSinceLastUser(next)) {
        next = [...next, { kind: 'assistant', id: newItemId(), text, streaming: false, ...prof }];
      }
      const error = s(p.error) || s(p.failure_reason);
      if (error) next = [...next, { kind: 'notice', id: newItemId(), text: error, tone: 'error', ...prof }];
      return { items: next, busy: false };
    }
    case 'tool.start': {
      const name = s(p.name) || 'tool';
      const label = toolLabel(name, s(p.preview) || s(p.context));
      return { items: [...settle(items), { kind: 'tool', id: s(p.tool_id) || newItemId(), name, label, status: 'running', ...prof }], busy: true };
    }
    case 'tool.complete': {
      const id = s(p.tool_id);
      const ms = typeof p.duration_s === 'number' ? p.duration_s * 1000 : undefined;
      return { items: items.map((i) => (i.kind === 'tool' && i.id === id ? { ...i, status: 'done', durationMs: ms } : i)), busy: view.busy };
    }
    case 'error':
      return { items: [...settle(items), { kind: 'notice', id: newItemId(), text: s(p.message) || 'Terjadi kesalahan di Hermes', tone: 'error', ...prof }], busy: false };
    default:
      return view;
  }
}

export function fromTranscript(messages: TranscriptMessage[], profile?: string): ChatItem[] {
  const out: ChatItem[] = [];
  const prof = profile ? { profile } : {};
  for (const m of messages) {
    const text = s(m.text).trim();
    if (m.role === 'user' && text) out.push({ kind: 'user', id: newItemId(), text });
    else if (m.role === 'assistant' && text) out.push({ kind: 'assistant', id: newItemId(), text, streaming: false, ...prof });
    else if (m.role === 'tool') {
      const name = s(m.name) || 'tool';
      out.push({ kind: 'tool', id: newItemId(), name, label: toolLabel(name, s(m.context)), status: 'done', ...prof });
    }
  }
  return out;
}

export function requestItem(req: ServerRequest): ChatItem | null {
  const p = req.params;
  if (req.method === 'approval') {
    const offered: unknown[] = Array.isArray(p.choices) ? p.choices : CHOICES;
    const choices = offered.filter((c): c is ApprovalChoice => CHOICES.includes(c as ApprovalChoice));
    return {
      kind: 'approval',
      id: newItemId(),
      requestId: req.id,
      command: s(p.command),
      description: s(p.description),
      choices: choices.length > 0 ? choices : ['once', 'deny'],
    };
  }
  if (req.method === 'clarify') {
    const first = Array.isArray(p.questions) && p.questions.length > 0 ? (p.questions[0] as Record<string, unknown>) : p;
    const choices = Array.isArray(first.choices) ? first.choices.filter((c): c is string => typeof c === 'string') : [];
    const qid = s(first.qid);
    return { kind: 'clarify', id: newItemId(), requestId: req.id, ...(qid ? { qid } : {}), question: s(first.question) || 'Agent bertanya', choices };
  }
  return null;
}

export function resolveRequest(items: ChatItem[], requestId: string, answer: string): ChatItem[] {
  return items.map((i) => {
    if (i.kind === 'approval' && i.requestId === requestId) return { ...i, decided: answer as ApprovalChoice };
    if (i.kind === 'clarify' && i.requestId === requestId) return { ...i, answered: answer };
    return i;
  });
}
