import { useEffect, useMemo, useState } from 'react';
import { ChatPanel } from '../chat/ChatPanel.tsx';
import { PROFILES } from '../hermes/labels.ts';
import { formatUsd, type Profile, TIERS } from './model.ts';
import { type DockTab, shell, useShell } from './store.ts';
import { calculateMotives, getProfileMeta, type SimProfileMeta } from '../sims-office/SimsMotives.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { SoulViewerModal } from './SoulViewerModal.tsx';
import { getAllRooms, getRoomById, isRoomId, subscribeRooms, type ChatRoom } from '../chat/rooms.ts';
import { CreateRoomModal } from '../chat/CreateRoomModal.tsx';
import './sims-shell.css';

const TABS: Array<[DockTab, string]> = [
  ['chat', '💬 Chat'],
  ['cards', '📋 Kartu'],
  ['activity', '⚡ Aktivitas'],
  ['agent', '👤 Simologi'],
];
const ACTIVE = new Set(['triage', 'todo', 'ready', 'running', 'blocked', 'review']);

export function Dock({ profile }: { profile: string }) {
  const tab = useShell((s) => s.dockTab);
  const tasks = useShell((s) => s.tasks);
  const activity = useShell((s) => s.activity);
  const agents = useShell((s) => s.agents);
  const costs = useShell((s) => s.costs);
  const daily = useShell((s) => s.daily);
  const health = useShell((s) => s.health);
  const approvals = useShell((s) => s.approvals);
  const operatorAvatar = useShell((s) => s.operatorAvatar);
  const operatorName = useShell((s) => s.operatorName);
  const [soulModalOpen, setSoulModalOpen] = useState(false);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [rooms, setRooms] = useState<ChatRoom[]>(() => getAllRooms());

  useEffect(() => {
    return subscribeRooms(() => setRooms(getAllRooms()));
  }, []);

  const isAll = profile === 'all';
  const isRoom = isRoomId(profile);
  const room = isRoom ? getRoomById(profile) : undefined;
  const agent = agents.find((a) => a.profile === profile);

  const mine = tasks.filter((t) =>
    isAll ? true : isRoom && room ? room.members.includes(t.assignee ?? '') : t.assignee === profile
  );
  const active = mine.filter((t) => ACTIVE.has(t.status));
  const history = mine.filter((t) => !ACTIVE.has(t.status)).slice(0, 10);
  const cost = isRoom && room
    ? costs?.byProfile.filter((p) => room.members.includes(p.profile)).reduce((sum, c) => sum + c.cost_usd, 0)
    : costs?.byProfile.find((p) => p.profile === profile)?.cost_usd;
  const log = isAll
    ? Object.values(activity).flat().sort((a, b) => b.ts - a.ts)
    : isRoom && room
      ? room.members.flatMap((m) => activity[m] ?? []).sort((a, b) => b.ts - a.ts)
      : activity[profile] ?? [];

  const meta: SimProfileMeta = isRoom && room
    ? {
        name: room.name,
        title: room.description,
        department: `Saluran Room (${room.members.length} Agen)`,
        tier: 'os-brain',
        aspiration: 'Popularity',
        aspirationIcon: room.icon,
        aspirationLabel: `Kolaborasi Tim ${room.name}`,
        zodiac: 'Gemini',
        zodiacIcon: '👥',
        traits: ['Kolaboratif', 'Multi-Agen', 'Fokus Divisi'],
        soulBio: `${room.description}. Anggota room: ${room.members.map((m) => (m === 'chief' ? 'Arthur' : m)).join(', ')}.`,
        skills: { logic: 10, creativity: 10, charisma: 10, mechanical: 10, cleaning: 10 },
      }
    : isAll
    ? {
        name: 'all',
        title: 'Broadcast Serentak',
        tier: 'os-brain',
        aspiration: 'Popularity',
        aspirationIcon: '📢',
        aspirationLabel: 'Harmoni & Kolaborasi Tim',
        zodiac: 'Aquarius',
        zodiacIcon: '♒',
        traits: ['Terkoordinasi', 'Multi-Agen'],
        soulBio: 'Saluran siaran pesan ke seluruh armada agent Hermes.',
        skills: { logic: 10, creativity: 10, charisma: 10, mechanical: 10, cleaning: 10 },
      }
    : getProfileMeta(profile);

  const report = useMemo(() => {
    return calculateMotives(
      isAll ? 'chief' : isRoom && room ? room.members[0] ?? 'chief' : profile,
      { approvals, tasks, costs, daily, health, agents }
    );
  }, [profile, isAll, isRoom, room, approvals, tasks, costs, daily, health, agents]);

  const handleTabClick = (nextTab: DockTab) => {
    simsAudio.playTabSwitch();
    shell.setTab(nextTab);
  };

  const handleSelectProfile = (nextProfile: string) => {
    if (nextProfile === '__create_room__') {
      simsAudio.playBubbleClick();
      setCreateRoomOpen(true);
      return;
    }
    simsAudio.playSelectSim();
    shell.select(nextProfile);
  };

  const handleClose = () => {
    simsAudio.playBubbleClick();
    shell.select(null);
  };

  const currentTabs: Array<[DockTab, string]> = isRoom && room
    ? [
        ['chat', `💬 Chat ${room.icon}`],
        ['cards', `📋 Kartu (${mine.length})`],
        ['activity', '⚡ Aktivitas Tim'],
        ['agent', '👤 Info Saluran'],
      ]
    : isAll
    ? [
        ['chat', '📢 Chat All'],
        ['cards', '📋 Semua Kartu'],
        ['activity', '⚡ Aktivitas Tim'],
      ]
    : TABS;

  return (
    <aside aria-label={`Dock ${profile}`} className="sims-dock">
      {/* Sims 2 Aqua/Steel Dock Header */}
      <header className="sims-dock-header">
        <div className="sims-dock-profile-pod">
          <div
            className="sims-dock-avatar"
            style={{
              borderColor: isRoom ? '#06b6d4' : isAll ? '#38bdf8' : profile === 'owner' ? '#f59e0b' : report.plumbobColor,
              boxShadow: `0 0 10px ${isRoom ? '#06b6d4' : isAll ? '#38bdf8' : profile === 'owner' ? '#f59e0b' : report.plumbobColor}66`,
            }}
          >
            {isRoom && room
              ? room.icon
              : isAll
                ? '📢'
                : profile === 'owner'
                  ? operatorAvatar || '👑'
                  : profile === 'chief'
                    ? 'AR'
                    : profile.slice(0, 2).toUpperCase()}
            <span
              className="sims-dock-avatar-dot"
              style={{
                backgroundColor: isRoom
                  ? '#06b6d4'
                  : isAll
                    ? '#38bdf8'
                    : profile === 'owner'
                      ? '#10b981'
                      : report.plumbobColor,
              }}
            />
          </div>
          <div>
            <select
              aria-label="Pilih saluran atau agen"
              value={profile}
              onChange={(e) => handleSelectProfile(e.target.value)}
              className="sims-dock-select"
            >
              <optgroup label="👑 KOMANDO">
                <option value="owner">👑 {operatorName.toUpperCase()} (OWNER)</option>
              </optgroup>
              <optgroup label="👥 ROOM CHAT / SALURAN">
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.icon} {r.name.toUpperCase()} ({r.members.length} AGEN)
                  </option>
                ))}
                <option value="__create_room__">✨ + BUAT ROOM CHAT BARU...</option>
              </optgroup>
              <optgroup label="💬 DIRECT CHAT (1-ON-1)">
                {PROFILES.map((p) => {
                  const pMeta = getProfileMeta(p);
                  const tag = pMeta.department?.includes('SukaShawarma') ? '🌯 ' : '';
                  const display = p === 'chief' ? 'ARTHUR (CHIEF)' : p.toUpperCase();
                  return (
                    <option key={p} value={p}>
                      {tag}{display}
                    </option>
                  );
                })}
              </optgroup>
            </select>
            <div className="sims-dock-status-pill">
              <span>{meta.title}</span>
              {meta.department && (
                <>
                  <span>·</span>
                  <span className="text-cyan-300 font-semibold">{meta.department}</span>
                </>
              )}
              <span>·</span>
              <span className="capitalize">
                {profile === 'owner'
                  ? 'Komandan Eksekutif'
                  : isRoom && room
                    ? `${room.members.length} agen aktif`
                    : isAll
                      ? `${PROFILES.length} agen terhubung`
                      : agent?.state ?? 'offline'}
              </span>
            </div>
          </div>
        </div>
        <button
          className="sims-dock-close-btn"
          onClick={handleClose}
          title="Tutup Panel Inspector"
          aria-label="Tutup dock"
        >
          ✕
        </button>
      </header>

      {/* Tabs navigation */}
      <nav className="sims-dock-nav" role="tablist" aria-label="Tab dock">
        {currentTabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => handleTabClick(id)}
            className={`sims-dock-tab ${tab === id ? 'active' : ''}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Tab Panels */}
      {tab === 'chat' ? (
        <div className="flex-1 min-h-0 flex flex-col" role="tabpanel">
          <ErrorBoundary fallbackTitle="Gagal Memuat Panel Chat">
            <ChatPanel key={profile} profile={profile} />
          </ErrorBoundary>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-16 flex flex-col gap-14" role="tabpanel">
          {tab === 'cards' && (
            <>
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <strong className="text-sm font-bold text-sky-300">
                  Tugas Aktif ({active.length})
                </strong>
                <button
                  className="text-xs px-10 py-4 bg-sky-500/25 hover:bg-sky-500/40 text-sky-200 border border-sky-400/50 rounded-lg cursor-pointer transition font-bold shadow-sm"
                  onClick={() => {
                    simsAudio.playBubbleClick();
                    shell.toggleDrawer();
                  }}
                  title="Buka Papan Kanban Lengkap (Shortcut: B)"
                >
                  📋 Buka Kanban ↗
                </button>
              </div>

              {active.length === 0 && (
                <p className="text-slate-400 text-xs italic py-8 text-center bg-slate-900/40 rounded-lg border border-white/5">
                  Tidak ada kartu aktif untuk {profile}. Sedang standby di kantor.
                </p>
              )}

              {active.map((t) => (
                <div
                  key={t.id}
                  className="bg-slate-800/80 border border-slate-700/80 hover:border-sky-400/60 p-12 rounded-xl shadow transition flex flex-col gap-6"
                >
                  <div className="font-semibold text-sm text-slate-100">{t.title}</div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono text-[10px] text-sky-400">{t.id}</span>
                    <span className="px-6 py-1 bg-sky-500/20 text-sky-300 rounded font-semibold text-[10px] uppercase">
                      {t.status}
                    </span>
                  </div>
                </div>
              ))}

              <strong className="text-sm font-bold text-slate-300 mt-6 pb-4 border-b border-white/10">
                Riwayat Selesai ({history.length})
              </strong>
              {history.length === 0 && (
                <p className="text-slate-400 text-xs italic py-4">Belum ada kartu riwayat.</p>
              )}
              {history.map((t) => (
                <div
                  key={t.id}
                  className="bg-slate-900/60 border border-white/5 p-10 rounded-lg text-xs text-slate-300 flex items-center justify-between"
                >
                  <span className="truncate flex-1">{t.title}</span>
                  <span className="px-6 py-1 bg-emerald-500/20 text-emerald-300 rounded font-bold text-[10px] uppercase ml-6">
                    {t.status}
                  </span>
                </div>
              ))}
            </>
          )}

          {tab === 'activity' && (
            <ol className="flex flex-col gap-6" aria-live="polite">
              <div className="pb-4 border-b border-white/10 text-xs font-bold text-sky-300">
                Log Aktivitas Tool Terakhir
              </div>
              {log.length === 0 && (
                <li className="text-slate-400 text-xs italic py-8 text-center bg-slate-900/40 rounded-lg">
                  Belum ada log aktivitas untuk {profile}.
                </li>
              )}
              {log.map((a) => (
                <li
                  key={a.id}
                  className="bg-slate-800/60 border border-white/5 p-10 rounded-lg flex flex-col gap-4 text-xs"
                >
                  <div className="text-slate-200 break-words">{a.text}</div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span
                      className={`font-semibold uppercase ${
                        a.status === 'blocked' || a.status === 'breaker'
                          ? 'text-amber-400'
                          : 'text-sky-400'
                      }`}
                    >
                      {a.status}
                    </span>
                    <span>{new Date(a.ts).toLocaleTimeString('id-ID')}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {tab === 'agent' && (
            <div className="flex flex-col gap-10 text-xs">
              <div className="p-12 bg-sky-950/40 border border-sky-400/30 rounded-xl flex items-center justify-between gap-6">
                <div className="flex items-center gap-10">
                  <span className="text-3xl">{meta.aspirationIcon}</span>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-sky-400">Aspirasi Sim</div>
                    <div className="text-sm font-bold text-white">{meta.aspirationLabel}</div>
                  </div>
                </div>
                {meta.department && (
                  <div className="text-right flex-shrink-0">
                    <div className="text-[10px] uppercase font-bold text-amber-400">Divisi / Strata</div>
                    <div className="text-xs font-bold text-cyan-300">{meta.department}</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-8 bg-slate-900/60 p-12 rounded-xl border border-white/5">
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">LLM Engine</div>
                  <div className="text-xs font-bold text-sky-300 mt-2 flex items-center gap-1.5 truncate">
                    <span>🧠</span>
                    <span className="truncate">{meta.llmModel || 'Claude 3.5 Sonnet'}</span>
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Provider / Router</div>
                  <div className="text-xs font-bold text-emerald-400 mt-2 flex items-center gap-1.5 truncate">
                    <span>⚡</span>
                    <span className="truncate">{meta.llmProvider || '9Router'}</span>
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Zodiak</div>
                  <div className="text-sm font-bold text-slate-200 mt-2">
                    {meta.zodiacIcon} {meta.zodiac}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Tier Sistem</div>
                  <div className="text-sm font-bold text-sky-300 mt-2">
                    {TIERS[profile as Profile] ?? meta.tier}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Status Live</div>
                  <div className="text-sm font-bold text-emerald-400 mt-2 capitalize">
                    {agent?.state ?? 'offline'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px] uppercase font-bold">Biaya Hari Ini</div>
                  <div className="text-sm font-bold text-amber-300 mt-2">
                    {cost !== undefined ? formatUsd(cost) : '$0.00 (shared)'}
                  </div>
                </div>
              </div>

              {/* Soul.md Dossier Box */}
              <div className="p-10 bg-slate-900/60 rounded-xl border border-white/5 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <div className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1.5">
                    <span>📜</span>
                    <span>Protokol & Kepribadian (Soul.md)</span>
                  </div>
                  <span className="text-[10px] font-mono text-sky-300 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/25">
                    {meta.soulFile || `infra/profiles/soul/${profile}.md`}
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed text-xs m-0">
                  {meta.soulBio}
                </p>
                {!isAll && (
                  <button
                    type="button"
                    onClick={() => {
                      simsAudio.playBubbleClick();
                      setSoulModalOpen(true);
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/40 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
                  >
                    <span>📜</span>
                    <span>Buka & Baca Berkas Soul.md Lengkap</span>
                  </button>
                )}
              </div>

              {/* Tugas Pokok & Tanggung Jawab */}
              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold mb-4 flex items-center gap-1.5">
                  <span>🎯</span>
                  <span>Tugas Pokok & Tanggung Jawab ({meta.duties?.length || 1})</span>
                </div>
                <ul className="flex flex-col gap-2.5 bg-slate-900/60 p-8 rounded-xl border border-white/5 list-none m-0">
                  {(meta.duties || [meta.soulBio]).map((duty, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-slate-200 leading-snug">
                      <span className="text-emerald-400 font-bold text-xs mt-0.5 flex-shrink-0">✓</span>
                      <span>{duty}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold mb-4">Sifat / Traits</div>
                <div className="flex flex-wrap gap-4">
                  {meta.traits.map((trait: string) => (
                    <span
                      key={trait}
                      className="px-8 py-2 bg-sky-500/20 text-sky-200 border border-sky-400/30 rounded-full font-semibold text-[11px]"
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold mb-4">
                  Keahlian Sim (1-10)
                </div>
                <div className="flex flex-col gap-4 bg-slate-900/60 p-8 rounded-xl border border-white/5">
                  {Object.entries(meta.skills).map(([skill, val]) => {
                    const score = typeof val === 'number' ? val : 0;
                    return (
                      <div key={skill} className="flex items-center justify-between">
                        <span className="capitalize text-slate-300">{skill}</span>
                        <div className="flex gap-2">
                          {[...Array(10)].map((_, i) => (
                            <span
                              key={i}
                              className={`w-2.5 h-2.5 rounded-full border border-white/10 ${
                                i < score ? 'bg-sky-400 shadow-[0_0_4px_#38bdf8]' : 'bg-slate-800'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <CreateRoomModal
        isOpen={createRoomOpen}
        onClose={() => setCreateRoomOpen(false)}
      />

      <SoulViewerModal
        isOpen={soulModalOpen}
        onClose={() => setSoulModalOpen(false)}
        profile={profile}
      />
    </aside>
  );
}
