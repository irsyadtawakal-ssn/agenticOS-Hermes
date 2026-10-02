import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Button } from '../../vendor/pixel-agents/webview-ui/src/components/ui/Button.tsx';
import { type ApprovalChoice, type ChatItem, startedAtMs } from './model.ts';
import { chat, useChat } from './store.ts';

const CHOICE_LABEL: Record<ApprovalChoice, string> = {
  once: 'Izinkan sekali',
  session: 'Izinkan sesi ini',
  always: 'Selalu izinkan',
  deny: 'Tolak',
};

function Clarify({ profile, item }: { profile: string; item: Extract<ChatItem, { kind: 'clarify' }> }) {
  const [text, setText] = useState('');
  return (
    <div role="group" aria-label="Pertanyaan agent" className="border-2 border-accent p-8 flex flex-col gap-6">
      <strong>{item.question}</strong>
      {item.answered !== undefined ? (
        <span className="text-text-muted">Dijawab: {item.answered}</span>
      ) : (
        <>
          {item.choices.length > 0 && (
            <div className="flex flex-wrap gap-6">
              {item.choices.map((c) => (
                <Button key={c} size="sm" onClick={() => chat.answer(profile, item, c)}>
                  {c}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-6">
            <input
              aria-label="Jawaban untuk agent"
              className="flex-1 min-w-0 bg-bg border-2 border-border px-6"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button size="sm" variant="accent" disabled={!text.trim()} onClick={() => chat.answer(profile, item, text.trim())}>
              Jawab
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Item({ profile, item }: { profile: string; item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return <div className="self-end max-w-[85%] bg-active-bg px-8 py-4 whitespace-pre-wrap break-words">{item.text}</div>;
    case 'assistant':
      return (
        <div className="self-start max-w-[95%] whitespace-pre-wrap break-words">
          {item.text}
          {item.streaming ? '▍' : ''}
        </div>
      );
    case 'tool':
      return (
        <div className="text-text-muted text-xs break-all">
          {item.status === 'running' ? '… ' : '✓ '}
          {item.label}
          {item.durationMs !== undefined ? ` (${Math.round(item.durationMs)} ms)` : ''}
        </div>
      );
    case 'notice':
      return <div className={item.tone === 'error' ? 'text-danger' : 'text-text-muted'}>{item.text}</div>;
    case 'approval':
      return (
        <div role="group" aria-label="Permintaan izin" className="border-2 border-status-permission p-8 flex flex-col gap-6">
          <strong>Agent meminta izin</strong>
          <code className="font-[inherit] break-all">{item.command || '(tanpa perintah)'}</code>
          {item.description && <span className="text-text-muted">{item.description}</span>}
          {item.decided ? (
            <span className="text-text-muted">Dijawab: {CHOICE_LABEL[item.decided]}</span>
          ) : (
            <div className="flex flex-wrap gap-6">
              {item.choices.map((c) => (
                <Button key={c} size="sm" variant={c === 'deny' ? undefined : 'accent'} onClick={() => chat.answer(profile, item, c)}>
                  {CHOICE_LABEL[c]}
                </Button>
              ))}
            </div>
          )}
        </div>
      );
    case 'clarify':
      return <Clarify profile={profile} item={item} />;
  }
}

export function ChatPanel({ profile }: { profile: string }) {
  const connection = useChat((s) => s.connection);
  const closeCode = useChat((s) => s.closeCode);
  const current = useChat((s) => s.chats[profile]);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const items = current?.items ?? [];
  const sessions = current?.sessions ?? [];
  const offline = connection !== 'open';

  useEffect(() => {
    chat.connect();
    void chat.loadSessions(profile);
  }, [profile]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items]);

  function submit() {
    const text = draft;
    if (!text.trim()) return;
    setDraft('');
    void chat.send(profile, text);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const status =
    closeCode === 4503
      ? 'Hermes serve nonaktif (AOS_SERVE_TOKEN belum diisi).'
      : connection === 'closed'
        ? 'Chat terputus; mencoba menyambung lagi…'
        : 'Menghubungkan ke Hermes serve…';
  const selected = sessions.some((row) => row.id === current?.storedId) ? (current?.storedId ?? '') : '';

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex flex-wrap items-center gap-6 p-8 border-b-2 border-border">
        <select
          aria-label="Riwayat sesi"
          className="bg-bg border-2 border-border min-w-0 flex-1"
          value={selected}
          onChange={(e) => {
            if (e.target.value) void chat.resume(profile, e.target.value);
          }}
        >
          <option value="">{current?.storedId ? 'Sesi saat ini' : 'Buka sesi lama…'}</option>
          {sessions.map((row) => (
            <option key={row.id} value={row.id}>
              {new Date(startedAtMs(row.started_at)).toLocaleString('id-ID')} · {row.title || row.preview || row.id}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={offline} onClick={() => void chat.newSession(profile)}>
          Sesi baru
        </Button>
        {current?.busy && (
          <Button size="sm" onClick={() => void chat.interrupt(profile)}>
            Hentikan
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-12 flex flex-col gap-8" aria-live="polite">
        {offline && <p className="text-text-muted">{status}</p>}
        {!offline && items.length === 0 && (
          <p className="text-text-muted">Mulai percakapan dengan {profile}. Enter = kirim, Shift+Enter = baris baru. Perintah "/" tidak didukung.</p>
        )}
        {items.map((item) => (
          <Item key={item.id} profile={profile} item={item} />
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-6 p-8 border-t-2 border-border">
        <textarea
          aria-label={`Pesan untuk ${profile}`}
          autoFocus
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder="Tulis pesan…"
          className="flex-1 min-w-0 bg-bg border-2 border-border px-6 py-2 resize-none"
        />
        <Button size="sm" variant="accent" disabled={offline || !draft.trim()} onClick={submit}>
          Kirim
        </Button>
      </div>
    </div>
  );
}
