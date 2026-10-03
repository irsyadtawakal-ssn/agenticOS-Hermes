import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { type ApprovalChoice, type ChatItem, startedAtMs } from './model.ts';
import { chat, useChat } from './store.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
import '../shell/sims-shell.css';

const CHOICE_LABEL: Record<ApprovalChoice, string> = {
  once: 'Izinkan sekali',
  session: 'Izinkan sesi ini',
  always: 'Selalu izinkan',
  deny: 'Tolak',
};

function Clarify({ profile, item }: { profile: string; item: Extract<ChatItem, { kind: 'clarify' }> }) {
  const [text, setText] = useState('');
  return (
    <div role="group" aria-label="Pertanyaan agent" className="sims-chat-clarify">
      <strong className="text-sky-200 text-xs">{item.question}</strong>
      {item.answered !== undefined ? (
        <span className="text-slate-400 text-xs">Dijawab: {item.answered}</span>
      ) : (
        <>
          {item.choices.length > 0 && (
            <div className="flex flex-wrap gap-4 mt-2">
              {item.choices.map((c) => (
                <button
                  key={c}
                  className="sims-chat-action-btn"
                  onClick={() => {
                    simsAudio.playBubbleClick();
                    chat.answer(profile, item, c);
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-4 mt-2">
            <input
              aria-label="Jawaban untuk agent"
              className="flex-1 min-w-0 bg-slate-900 border border-sky-400/40 rounded px-6 py-2 text-xs text-white outline-none focus:border-sky-300"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ketik jawaban..."
            />
            <button
              className="sims-chat-action-btn accent disabled:opacity-40"
              disabled={!text.trim()}
              onClick={() => {
                simsAudio.playBubbleClick();
                chat.answer(profile, item, text.trim());
              }}
            >
              Jawab
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Item({ profile, item }: { profile: string; item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return <div className="sims-bubble-user">{item.text}</div>;
    case 'assistant':
      return (
        <div className="sims-bubble-assistant">
          {item.text}
          {item.streaming && <span className="sims-streaming-cursor">▍</span>}
        </div>
      );
    case 'tool':
      return (
        <div className="sims-tool-pill">
          <span className={item.status === 'running' ? 'icon-run' : 'icon-check'}>
            {item.status === 'running' ? '⏳' : '✓'}
          </span>
          <span>{item.label}</span>
          {item.durationMs !== undefined ? (
            <span className="text-slate-400">({Math.round(item.durationMs)} ms)</span>
          ) : null}
        </div>
      );
    case 'notice':
      return (
        <div className={`sims-chat-notice ${item.tone === 'error' ? 'error' : 'info'}`}>
          {item.text}
        </div>
      );
    case 'approval':
      return (
        <div role="group" aria-label="Permintaan izin" className="sims-chat-approval">
          <div className="sims-chat-approval-title">
            <span>⚠️</span>
            <span>Agent Meminta Izin Operasi</span>
          </div>
          <code className="sims-chat-approval-cmd">{item.command || '(tanpa perintah)'}</code>
          {item.description && <span className="text-slate-300 text-xs">{item.description}</span>}
          {item.decided ? (
            <span className="text-slate-400 text-xs font-semibold">
              Status: {CHOICE_LABEL[item.decided]}
            </span>
          ) : (
            <div className="sims-chat-approval-actions">
              {item.choices.map((c) => (
                <button
                  key={c}
                  className={`sims-chat-action-btn ${c !== 'deny' ? 'accent' : ''}`}
                  onClick={() => {
                    simsAudio.playBubbleClick();
                    chat.answer(profile, item, c);
                  }}
                >
                  {CHOICE_LABEL[c]}
                </button>
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
    simsAudio.playBubbleClick();
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
    <div className="sims-chat-panel">
      {/* Session selector & control bar */}
      <div className="sims-chat-session-bar">
        <select
          aria-label="Riwayat sesi"
          className="sims-chat-session-select"
          value={selected}
          onChange={(e) => {
            if (e.target.value) {
              simsAudio.playBubbleClick();
              void chat.resume(profile, e.target.value);
            }
          }}
        >
          <option value="">{current?.storedId ? 'Sesi saat ini' : 'Buka sesi lama…'}</option>
          {sessions.map((row) => (
            <option key={row.id} value={row.id}>
              {new Date(startedAtMs(row.started_at)).toLocaleString('id-ID')} · {row.title || row.preview || row.id}
            </option>
          ))}
        </select>
        <button
          className="sims-chat-session-btn"
          disabled={offline}
          onClick={() => {
            simsAudio.playBubbleClick();
            void chat.newSession(profile);
          }}
          title="Mulai percakapan baru"
        >
          + Sesi baru
        </button>
        {current?.busy && (
          <button
            className="sims-chat-session-btn danger"
            onClick={() => {
              simsAudio.playBubbleClick();
              void chat.interrupt(profile);
            }}
            title="Hentikan respons agen"
          >
            ⏹ Hentikan
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="sims-chat-messages" aria-live="polite">
        {offline && (
          <p className="text-amber-300 text-xs italic p-8 bg-amber-950/30 border border-amber-500/20 rounded-lg">
            {status}
          </p>
        )}
        {!offline && items.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs italic bg-slate-900/50 border border-white/5 rounded-xl my-auto">
            <span className="text-2xl block mb-4">💬</span>
            Mulai obrolan dengan <strong className="text-sky-300 capitalize">{profile}</strong>.<br />
            Tekan <kbd className="px-4 py-1 bg-slate-800 rounded border border-white/10 text-[10px]">Enter</kbd> untuk kirim,{' '}
            <kbd className="px-4 py-1 bg-slate-800 rounded border border-white/10 text-[10px]">Shift+Enter</kbd> untuk baris baru.
          </div>
        )}
        {items.map((item) => (
          <Item key={item.id} profile={profile} item={item} />
        ))}
        <div ref={endRef} />
      </div>

      {/* Message Input Bar */}
      <div className="sims-chat-input-bar">
        <textarea
          aria-label={`Pesan untuk ${profile}`}
          autoFocus
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={`Tulis pesan untuk ${profile}…`}
          className="sims-chat-textarea"
        />
        <button
          className="sims-chat-send-btn"
          disabled={offline || !draft.trim()}
          onClick={submit}
          title="Kirim pesan (Enter)"
        >
          Kirim ↵
        </button>
      </div>
    </div>
  );
}
