import { useMemo } from 'react';
import { ChatPanel } from '../chat/ChatPanel.tsx';
import { PROFILES } from '../hermes/labels.ts';
import { formatUsd, type Profile, TIERS } from './model.ts';
import { type DockTab, shell, useShell } from './store.ts';
import { calculateMotives, getProfileMeta } from '../sims-office/SimsMotives.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
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

  const isAll = profile === 'all';
  const agent = agents.find((a) => a.profile === profile);
  const mine = tasks.filter((t) => (isAll ? true : t.assignee === profile));
  const active = mine.filter((t) => ACTIVE.has(t.status));
  const history = mine.filter((t) => !ACTIVE.has(t.status)).slice(0, 10);
  const cost = costs?.byProfile.find((p) => p.profile === profile);
  const log = isAll
    ? Object.values(activity).flat().sort((a, b) => b.ts - a.ts)
    : activity[profile] ?? [];

  const meta = isAll
    ? { title: 'Broadcast Serentak', aspiration: 'Harmoni & Kolaborasi Tim', traits: ['Terkoordinasi', 'Multi-Agen'] }
    : getProfileMeta(profile);
  const report = useMemo(() => {
    return calculateMotives(isAll ? 'chief' : profile, { approvals, tasks, costs, daily, health, agents });
  }, [profile, isAll, approvals, tasks, costs, daily, health, agents]);

  const handleTabClick = (nextTab: DockTab) => {
    simsAudio.playTabSwitch();
    shell.setTab(nextTab);
  };

  const handleSelectProfile = (nextProfile: string) => {
    simsAudio.playSelectSim();
    shell.select(nextProfile);
  };

  const handleClose = () => {
    simsAudio.playBubbleClick();
    shell.select(null);
  };

  const currentTabs: Array<[DockTab, string]> = isAll
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
              borderColor: isAll ? '#38bdf8' : report.plumbobColor,
              boxShadow: `0 0 10px ${isAll ? '#38bdf8' : report.plumbobColor}66`,
            }}
          >
            {isAll ? '📢' : profile.slice(0, 2).toUpperCase()}
            <span
              className="sims-dock-avatar-dot"
              style={{ backgroundColor: isAll ? '#38bdf8' : report.plumbobColor }}
            />
          </div>
          <div>
            <select
              aria-label="Pilih agent"
              value={profile}
              onChange={(e) => handleSelectProfile(e.target.value)}
              className="sims-dock-select"
            >
              <option value="all">📢 CHAT ALL (SEMUA AGENT)</option>
              {PROFILES.map((p) => (
                <option key={p} value={p}>
                  {p.toUpperCase()}
                </option>
              ))}
            </select>
            <div className="sims-dock-status-pill">
              <span>{meta.title}</span>
              <span>·</span>
              <span className="capitalize">{isAll ? `${PROFILES.length} agen terhubung` : agent?.state ?? 'offline'}</span>
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
          <ChatPanel key={profile} profile={profile} />
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
              <div className="p-12 bg-sky-950/40 border border-sky-400/30 rounded-xl flex items-center gap-10">
                <span className="text-3xl">{meta.aspirationIcon}</span>
                <div>
                  <div className="text-[10px] uppercase font-bold text-sky-400">Aspirasi Sim</div>
                  <div className="text-sm font-bold text-white">{meta.aspirationLabel}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 bg-slate-900/60 p-12 rounded-xl border border-white/5">
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
                    {cost ? formatUsd(cost.cost_usd) : '$0.00 (shared)'}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold mb-4">Sifat / Traits</div>
                <div className="flex flex-wrap gap-4">
                  {meta.traits.map((trait) => (
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
                  {Object.entries(meta.skills).map(([skill, val]) => (
                    <div key={skill} className="flex items-center justify-between">
                      <span className="capitalize text-slate-300">{skill}</span>
                      <div className="flex gap-2">
                        {[...Array(10)].map((_, i) => (
                          <span
                            key={i}
                            className={`w-2.5 h-2.5 rounded-full border border-white/10 ${
                              i < val ? 'bg-sky-400 shadow-[0_0_4px_#38bdf8]' : 'bg-slate-800'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-slate-400 text-[10px] uppercase font-bold mb-4">Soul & Tugas</div>
                <p className="p-8 bg-slate-900/60 rounded-xl border border-white/5 text-slate-300 leading-relaxed text-xs">
                  {meta.soulBio}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
