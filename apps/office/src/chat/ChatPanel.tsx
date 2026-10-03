import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { type ApprovalChoice, type ChatItem, startedAtMs } from './model.ts';
import { chat, getChatAllTimeline, useChat } from './store.ts';
import { PROFILES } from '../hermes/labels.ts';
import { getProfileMeta } from '../sims-office/SimsMotives.ts';
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
  const itemProfile = item.profile ?? (profile === 'all' ? undefined : profile);
  const meta = itemProfile ? getProfileMeta(itemProfile) : null;
  switch (item.kind) {
    case 'user':
      return (
        <div className={`sims-bubble-user ${item.broadcast ? 'broadcast' : ''}`}>
          {item.broadcast && (
            <div className="flex items-center gap-1.5 text-[10px] text-cyan-200 font-bold mb-1 pb-1 border-b border-cyan-300/30">
              <span>📢</span>
              <span>Broadcast ke {item.targetCount ?? item.targetProfiles?.length ?? 'semua'} agent</span>
            </div>
          )}
          {item.text}
        </div>
      );
    case 'assistant':
      return (
        <div className="sims-bubble-assistant">
          {itemProfile && (
            <div className="flex items-center gap-2 mb-1.5 pb-1 border-b border-white/10 text-[11px] font-bold">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block shrink-0 shadow-sm"
                style={{ backgroundColor: meta?.plumbobColor ?? '#38bdf8' }}
              />
              <span className="text-sky-200 capitalize font-mono">{itemProfile}</span>
              {meta && <span className="text-slate-400 font-normal text-[10px]">· {meta.title}</span>}
            </div>
          )}
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
          {itemProfile && <span className="text-sky-300 font-bold capitalize mr-1">[{itemProfile}]</span>}
          <span>{item.label}</span>
          {item.durationMs !== undefined ? (
            <span className="text-slate-400">({Math.round(item.durationMs)} ms)</span>
          ) : null}
        </div>
      );
    case 'notice':
      return (
        <div className={`sims-chat-notice ${item.tone === 'error' ? 'error' : 'info'}`}>
          {itemProfile && <strong className="capitalize font-mono mr-1">[{itemProfile}]</strong>}
          {item.text}
        </div>
      );
    case 'approval': {
      const targetProfile = item.profile ?? (profile === 'all' ? 'chief' : profile);
      return (
        <div role="group" aria-label="Permintaan izin" className="sims-chat-approval">
          <div className="sims-chat-approval-title">
            <span>⚠️</span>
            <span>
              {targetProfile ? <strong className="capitalize text-sky-200 mr-1">[{targetProfile}]</strong> : ''}
              Agent Meminta Izin Operasi
            </span>
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
                    chat.answer(targetProfile, item, c);
                  }}
                >
                  {CHOICE_LABEL[c]}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'clarify': {
      const targetProfile = item.profile ?? (profile === 'all' ? 'chief' : profile);
      return <Clarify profile={targetProfile} item={item} />;
    }
  }
}

export function ChatPanel({ profile }: { profile: string }) {
  const isAll = profile === 'all';
  const connection = useChat((s) => s.connection);
  const closeCode = useChat((s) => s.closeCode);
  const current = useChat((s) => (isAll ? undefined : s.chats[profile]));
  const allChats = useChat((s) => s.chats);
  const [filterProfile, setFilterProfile] = useState<string>('all');
  const [selectedTargets, setSelectedTargets] = useState<string[]>(() => [...PROFILES]);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const timelineItems = useChat((s) => (isAll ? getChatAllTimeline(s, filterProfile) : []));
  const items = isAll ? timelineItems : current?.items ?? [];
  const sessions = current?.sessions ?? [];
  const offline = connection !== 'open';

  const busyAgents = isAll
    ? PROFILES.filter((p) => allChats[p]?.busy)
    : current?.busy
      ? [profile]
      : [];

  useEffect(() => {
    chat.connect();
    if (!isAll) {
      void chat.loadSessions(profile);
    } else {
      for (const p of PROFILES) {
        void chat.loadSessions(p);
      }
    }
  }, [profile, isAll]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items]);

  function submit() {
    const text = draft;
    if (!text.trim()) return;
    simsAudio.playBubbleClick();
    setDraft('');
    if (isAll) {
      simsAudio.playBroadcast();
      void chat.sendAll(text, selectedTargets);
    } else {
      void chat.send(profile, text);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const toggleTarget = (targetProfile: string) => {
    simsAudio.playBubbleClick();
    setSelectedTargets((prev) =>
      prev.includes(targetProfile)
        ? prev.filter((p) => p !== targetProfile)
        : [...prev, targetProfile]
    );
  };

  const toggleAllTargets = () => {
    simsAudio.playBubbleClick();
    if (selectedTargets.length === PROFILES.length) {
      setSelectedTargets(['chief']);
    } else {
      setSelectedTargets([...PROFILES]);
    }
  };

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
        {isAll ? (
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-cyan-300 font-bold text-xs shrink-0 flex items-center gap-1">
              <span>📢</span>
              <span>Filter:</span>
            </span>
            <select
              aria-label="Filter respon agent"
              className="sims-chat-session-select text-xs flex-1 min-w-0"
              value={filterProfile}
              onChange={(e) => {
                simsAudio.playBubbleClick();
                setFilterProfile(e.target.value);
              }}
            >
              <option value="all">Semua Respons ({PROFILES.length} Agen)</option>
              {PROFILES.map((p) => (
                <option key={p} value={p}>
                  Respon: {p.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        ) : (
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
        )}
        <button
          className="sims-chat-session-btn"
          disabled={offline}
          onClick={() => {
            simsAudio.playBubbleClick();
            if (isAll) {
              void chat.newSessionAll(selectedTargets);
            } else {
              void chat.newSession(profile);
            }
          }}
          title={isAll ? 'Mulai sesi baru untuk semua agent target' : 'Mulai percakapan baru'}
        >
          + Sesi baru{isAll ? ' semua' : ''}
        </button>
        {busyAgents.length > 0 && (
          <button
            className="sims-chat-session-btn danger"
            onClick={() => {
              simsAudio.playBubbleClick();
              if (isAll) {
                void chat.interruptAll(selectedTargets);
              } else {
                void chat.interrupt(profile);
              }
            }}
            title="Hentikan respons agen"
          >
            ⏹ Hentikan{isAll ? ` (${busyAgents.length})` : ''}
          </button>
        )}
      </div>

      {/* Target Selector Bar for Chat All */}
      {isAll && (
        <div className="sims-chat-target-bar" role="toolbar" aria-label="Pilih target broadcast">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider shrink-0 mr-1">Kirim ke:</span>
          <button
            type="button"
            className="sims-target-chip text-[10px]"
            onClick={toggleAllTargets}
            title="Pilih semua atau sisakan chief"
          >
            {selectedTargets.length === PROFILES.length ? 'Batal' : 'Semua'}
          </button>
          {PROFILES.map((p) => {
            const active = selectedTargets.includes(p);
            const isBusy = allChats[p]?.busy;
            return (
              <button
                key={p}
                type="button"
                className={`sims-target-chip ${active ? 'active' : ''}`}
                onClick={() => toggleTarget(p)}
                title={`Kirim broadcast ke ${p}`}
                aria-pressed={active}
              >
                {isBusy && <span className="text-[9px]">⏳</span>}
                <span className="capitalize">{p}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div className="sims-chat-messages" aria-live="polite">
        {offline && (
          <p className="text-amber-300 text-xs italic p-8 bg-amber-950/30 border border-amber-500/20 rounded-lg">
            {status}
          </p>
        )}
        {!offline && items.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs italic bg-slate-900/50 border border-white/5 rounded-xl my-auto">
            <span className="text-3xl block mb-4">{isAll ? '📢' : '💬'}</span>
            {isAll ? (
              <>
                <strong className="text-cyan-300 font-bold block text-sm mb-2">Kirim Pesan ke Semua Agent (Chat All)</strong>
                Pesan broadcast akan diterima serentak oleh <strong className="text-white font-mono">{selectedTargets.length} agent</strong>.<br />
                Masing-masing agent akan merespons langsung di timeline ini.<br className="mb-2" />
                Tekan <kbd className="px-4 py-1 bg-slate-800 rounded border border-white/10 text-[10px]">Enter</kbd> untuk kirim,{' '}
                <kbd className="px-4 py-1 bg-slate-800 rounded border border-white/10 text-[10px]">Shift+Enter</kbd> untuk baris baru.
              </>
            ) : (
              <>
                Mulai obrolan dengan <strong className="text-sky-300 capitalize">{profile}</strong>.<br />
                Tekan <kbd className="px-4 py-1 bg-slate-800 rounded border border-white/10 text-[10px]">Enter</kbd> untuk kirim,{' '}
                <kbd className="px-4 py-1 bg-slate-800 rounded border border-white/10 text-[10px]">Shift+Enter</kbd> untuk baris baru.
              </>
            )}
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
          aria-label={isAll ? `Pesan broadcast untuk ${selectedTargets.length} agent` : `Pesan untuk ${profile}`}
          autoFocus
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            isAll
              ? `Tulis pesan broadcast untuk ${selectedTargets.length} agent…`
              : `Tulis pesan untuk ${profile}…`
          }
          className="sims-chat-textarea"
        />
        <button
          className="sims-chat-send-btn"
          disabled={offline || !draft.trim() || (isAll && selectedTargets.length === 0)}
          onClick={submit}
          title={isAll ? `Kirim broadcast ke ${selectedTargets.length} agent (Enter)` : 'Kirim pesan (Enter)'}
        >
          {isAll ? `📢 Kirim (${selectedTargets.length}) ↵` : 'Kirim ↵'}
        </button>
      </div>
    </div>
  );
}
