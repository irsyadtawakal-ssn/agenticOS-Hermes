import { useState, useMemo } from 'react';
import { PROFILES } from '../hermes/labels.ts';
import { useShell } from '../shell/store.ts';
import { calculateMotives } from './SimsMotives.ts';
import { simsAudio } from './SimsAudio.ts';
import type { WallDisplayMode } from './WallManager.ts';

export interface SimsConsoleProps {
  selectedProfile: string;
  onSelectAgent: (profile: string) => void;
  onOpenChat: (profile: string) => void;
  onOpenKanban: () => void;
  simSpeed: number;
  onSetSpeed: (speed: number) => void;
  timeLabel: string;
  onCycleTime: () => void;
  wallMode: WallDisplayMode;
  onCycleWalls: () => void;
  isBuildMode: boolean;
  onToggleBuildMode: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  isMusicOn: boolean;
  onToggleMusic: () => void;
  onSwitchClassic?: () => void;
}

type ConsoleTab = 'motives' | 'simology' | 'career';

export function SimsConsole({
  selectedProfile,
  onSelectAgent,
  onOpenChat,
  onOpenKanban,
  simSpeed,
  onSetSpeed,
  timeLabel,
  onCycleTime,
  wallMode,
  onCycleWalls,
  isBuildMode,
  onToggleBuildMode,
  isMuted,
  onToggleMute,
  isMusicOn,
  onToggleMusic,
  onSwitchClassic,
}: SimsConsoleProps) {
  const [activeTab, setActiveTab] = useState<ConsoleTab>('motives');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const approvals = useShell((s) => s.approvals);
  const tasks = useShell((s) => s.tasks);
  const costs = useShell((s) => s.costs);
  const daily = useShell((s) => s.daily);
  const health = useShell((s) => s.health);
  const agents = useShell((s) => s.agents);

  const report = useMemo(() => {
    return calculateMotives(selectedProfile, { approvals, tasks, costs, daily, health, agents });
  }, [selectedProfile, approvals, tasks, costs, daily, health, agents]);

  const activeAgentState = agents.find((a) => a.profile === selectedProfile);
  const pendingApprovalsCount = approvals.filter((a) => a.profile === selectedProfile && a.status === 'pending').length;
  const assignedTasks = tasks.filter((t) => t.assignee === selectedProfile && t.status !== 'done');

  // Format human-friendly current status label
  const getActionStatus = () => {
    if (pendingApprovalsCount > 0) return 'Menunggu Approval Izin';
    const st = activeAgentState?.state;
    if (st === 'working' || st === 'thinking' || st === 'executing') return 'Sedang Menjalankan Tugas';
    if (st === 'error') return 'Mengalami Kendala / Error';
    if (st === 'blocked') return 'Terkendala / Blocked';
    if (assignedTasks.length > 0) return `${assignedTasks.length} Tugas Menunggu`;
    return 'Standby di Kantor';
  };

  const handleTabChange = (tab: ConsoleTab) => {
    simsAudio.playTabSwitch();
    setActiveTab(tab);
  };

  const handleSelectSim = (profile: string) => {
    simsAudio.playSelectSim();
    onSelectAgent(profile);
  };

  const handleSpeedClick = (speed: number) => {
    onSetSpeed(speed);
  };

  return (
    <aside
      className={`sims-console ${isCollapsed ? 'collapsed' : ''}`}
      aria-label="The Sims 2 Console Antarmuka"
    >
      {/* Top Gloss Chrome Edge & Collapse Button */}
      <div className="sims-console-top-strip">
        <div className="sims-console-branding">
          <span className="sims-gem-mini" style={{ color: report.plumbobColor }}>💎</span>
          <span className="sims-console-title">THE SIMS 2 CONSOLE</span>
          <span className="sims-console-tier-tag">{report.meta.tier}</span>
        </div>
        <button
          className="sims-console-collapse-btn"
          onClick={() => {
            simsAudio.playBubbleClick();
            setIsCollapsed(!isCollapsed);
          }}
          title={isCollapsed ? 'Perluas Console (The Sims 2)' : 'Kecilkan Console'}
          aria-label="Toggle Console Collapse"
        >
          {isCollapsed ? '▲ Buka' : '▼ Kecilkan'}
        </button>
      </div>

      {/* Main Console Body */}
      <div className="sims-console-main">
        {/* POD 1: Sim Portrait & Plumbob Mood Ring */}
        <section className="sims-portrait-pod">
          <div
            className="sims-avatar-frame"
            style={{
              borderColor: report.plumbobColor,
              boxShadow: `0 0 16px ${report.plumbobColor}66`,
            }}
          >
            <div className="sims-avatar-content">
              {report.meta.name.slice(0, 2).toUpperCase()}
            </div>
            <div
              className="sims-plumbob-mood-gem"
              style={{
                color: report.plumbobColor,
                filter: `drop-shadow(0 0 8px ${report.plumbobColor})`,
              }}
              title={`Suasana Hati: ${report.overallMood.toUpperCase()}`}
            >
              💎
            </div>
          </div>

          <div className="sims-sim-identity">
            <h2 className="sims-sim-name">{report.meta.name.toUpperCase()}</h2>
            <div className="sims-sim-title">{report.meta.title}</div>
            <div className="sims-sim-status-pill">
              <span
                className="sims-sim-status-dot"
                style={{ backgroundColor: report.plumbobColor }}
              />
              <span className="sims-sim-status-text">{getActionStatus()}</span>
            </div>
          </div>

          <div className="sims-sim-quick-actions">
            <button
              className="sims-quick-btn"
              onClick={() => {
                simsAudio.playBubbleClick();
                onOpenChat(selectedProfile);
              }}
              title={`Buka Obrolan dengan ${report.meta.name} (Shortcut: C)`}
            >
              💬 Chat (C)
            </button>
            <button
              className="sims-quick-btn"
              onClick={() => {
                simsAudio.playBubbleClick();
                onOpenKanban();
              }}
              title="Buka Papan Tugas Kanban (Shortcut: B)"
            >
              📋 Tugas (B)
            </button>
          </div>
        </section>

        {/* POD 2: Needs / Simology / Career Sub-panel */}
        {!isCollapsed && (
          <section className="sims-center-pod">
            {/* Console Sub-tabs */}
            <div className="sims-mode-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={activeTab === 'motives'}
                className={`sims-mode-tab ${activeTab === 'motives' ? 'active' : ''}`}
                onClick={() => handleTabChange('motives')}
              >
                💚 Kebutuhan
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'simology'}
                className={`sims-mode-tab ${activeTab === 'simology' ? 'active' : ''}`}
                onClick={() => handleTabChange('simology')}
              >
                👤 Simologi
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'career'}
                className={`sims-mode-tab ${activeTab === 'career' ? 'active' : ''}`}
                onClick={() => handleTabChange('career')}
              >
                💼 Pekerjaan ({assignedTasks.length})
              </button>
            </div>

            {/* TAB CONTENT 1: MOTIVES (KEBUTUHAN) */}
            {activeTab === 'motives' && (
              <div className="sims-motives-grid" role="tabpanel">
                {report.motives.map((motive) => (
                  <div key={motive.id} className="sims-motive-row" title={`${motive.label} (${motive.simsAnalog}): ${motive.statusLabel}`}>
                    <div className="sims-motive-header">
                      <span className="sims-motive-label">
                        <span className="sims-motive-icon">{motive.icon}</span>
                        {motive.label}
                      </span>
                      <span className="sims-motive-val">{motive.value}%</span>
                    </div>
                    <div className="sims-motive-bar-track">
                      <div
                        className={`sims-motive-bar-fill ${motive.color}`}
                        style={{ width: `${Math.max(8, motive.value)}%` }}
                      >
                        <div className="sims-motive-bar-gloss" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TAB CONTENT 2: SIMOLOGY */}
            {activeTab === 'simology' && (
              <div className="sims-simology-panel" role="tabpanel">
                <div className="sims-simology-top">
                  <div className="sims-aspiration-box">
                    <span className="sims-aspiration-icon">{report.meta.aspirationIcon}</span>
                    <div>
                      <div className="sims-simology-sub">Aspirasi</div>
                      <div className="sims-aspiration-name">{report.meta.aspirationLabel}</div>
                    </div>
                  </div>
                  <div className="sims-zodiac-box">
                    <span className="sims-zodiac-icon">{report.meta.zodiacIcon}</span>
                    <div>
                      <div className="sims-simology-sub">Zodiak</div>
                      <div className="sims-zodiac-name">{report.meta.zodiac}</div>
                    </div>
                  </div>
                </div>

                <div className="sims-traits-row">
                  {report.meta.traits.map((t) => (
                    <span key={t} className="sims-trait-badge">{t}</span>
                  ))}
                </div>

                <div className="sims-simology-skills">
                  <div className="sims-skill-item">
                    <span>Logika</span>
                    <div className="sims-skill-dots">
                      {[...Array(10)].map((_, i) => (
                        <span key={i} className={`sims-skill-dot ${i < report.meta.skills.logic ? 'filled' : ''}`} />
                      ))}
                    </div>
                  </div>
                  <div className="sims-skill-item">
                    <span>Kreativitas</span>
                    <div className="sims-skill-dots">
                      {[...Array(10)].map((_, i) => (
                        <span key={i} className={`sims-skill-dot ${i < report.meta.skills.creativity ? 'filled' : ''}`} />
                      ))}
                    </div>
                  </div>
                  <div className="sims-skill-item">
                    <span>Karisma</span>
                    <div className="sims-skill-dots">
                      {[...Array(10)].map((_, i) => (
                        <span key={i} className={`sims-skill-dot ${i < report.meta.skills.charisma ? 'filled' : ''}`} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="sims-soul-bio" title={report.meta.soulBio}>
                  {report.meta.soulBio}
                </div>
              </div>
            )}

            {/* TAB CONTENT 3: CAREER & TASKS */}
            {activeTab === 'career' && (
              <div className="sims-career-panel" role="tabpanel">
                <div className="sims-career-header">
                  <span>Daftar Tugas Aktif ({assignedTasks.length})</span>
                  <button
                    className="sims-career-open-btn"
                    onClick={() => {
                      simsAudio.playBubbleClick();
                      onOpenKanban();
                    }}
                  >
                    Buka Kanban ↗
                  </button>
                </div>
                <div className="sims-career-tasks-list">
                  {assignedTasks.length === 0 ? (
                    <div className="sims-career-empty">
                      Agent tidak memiliki tugas antri. Sedang santai di kantor.
                    </div>
                  ) : (
                    assignedTasks.map((task) => (
                      <div key={task.id} className="sims-career-task-card">
                        <span className="sims-task-status-tag">{task.status}</span>
                        <span className="sims-task-title">{task.title}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* POD 3: Simulation Time & Controls Pod */}
        <section className="sims-controls-pod">
          {/* Time & Clock */}
          <button
            className="sims-console-time-btn"
            onClick={() => {
              simsAudio.playBubbleClick();
              onCycleTime();
            }}
            title="Klik untuk beralih waktu: Live / Pagi / Siang / Sore / Malam"
          >
            🕒 {timeLabel}
          </button>

          {/* VCR Speed Controls */}
          <div className="sims-speed-controls" role="group" aria-label="Kecepatan Simulasi">
            <button
              className={`sims-speed-btn ${simSpeed === 0 ? 'active' : ''}`}
              onClick={() => handleSpeedClick(0)}
              title="Jeda Simulasi (0)"
              aria-label="Pause"
            >
              ⏸
            </button>
            <button
              className={`sims-speed-btn ${simSpeed === 1 ? 'active' : ''}`}
              onClick={() => handleSpeedClick(1)}
              title="Kecepatan Normal 1x (1)"
              aria-label="Normal Speed"
            >
              ▶
            </button>
            <button
              className={`sims-speed-btn ${simSpeed === 2 ? 'active' : ''}`}
              onClick={() => handleSpeedClick(2)}
              title="Kecepatan Cepat 2x (2)"
              aria-label="Fast Speed"
            >
              ⏩
            </button>
            <button
              className={`sims-speed-btn ${simSpeed === 3 ? 'active' : ''}`}
              onClick={() => handleSpeedClick(3)}
              title="Kecepatan Ultra 3x (3)"
              aria-label="Ultra Speed"
            >
              ⏭
            </button>
          </div>

          {/* Mode & Sound Toggles */}
          <div className="sims-extra-toggles">
            <button
              className={`sims-mini-toggle ${wallMode !== 'full' ? 'active' : ''}`}
              onClick={() => {
                simsAudio.playBubbleClick();
                onCycleWalls();
              }}
              title={`Mode Dinding: ${wallMode.toUpperCase()}`}
            >
              🧱 {wallMode === 'cutaway' ? 'Potong' : wallMode === 'down' ? 'Turun' : 'Penuh'}
            </button>

            <button
              className={`sims-mini-toggle ${isBuildMode ? 'active-build' : ''}`}
              onClick={() => {
                simsAudio.playBubbleClick();
                onToggleBuildMode();
              }}
              title="Mode Build/Buy (Beli & Geser Furnitur)"
            >
              🛠 {isBuildMode ? 'Tutup' : 'Build'}
            </button>

            <button
              className={`sims-mini-toggle ${isMusicOn ? 'active-music' : ''}`}
              onClick={() => {
                simsAudio.playBubbleClick();
                onToggleMusic();
              }}
              title={isMusicOn ? 'Matikan Musik Sims' : 'Putar Musik Sims 2'}
            >
              🎵
            </button>

            <button
              className="sims-mini-toggle"
              onClick={() => {
                simsAudio.playBubbleClick();
                onToggleMute();
              }}
              title={isMuted ? 'Unmute Suara' : 'Mute Suara'}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>

            {onSwitchClassic && (
              <button
                className="sims-mini-toggle"
                onClick={() => {
                  simsAudio.playBubbleClick();
                  onSwitchClassic();
                }}
                title="Beralih ke tampilan klasik"
              >
                ↗ Klasik
              </button>
            )}
          </div>
        </section>
      </div>

      {/* Household Sim Selector Strip */}
      <nav className="sims-household-strip" aria-label="Pilih Agent / Sim">
        {PROFILES.map((p) => {
          const isSel = p === selectedProfile;
          const rawStatus = agents.find((a) => a.profile === p)?.state ?? 'idle';
          const hasApproval = approvals.some((a) => a.profile === p && a.status === 'pending');

          let dotColor = '#22c55e'; // Green
          if (rawStatus === 'offline') dotColor = '#64748b';
          else if (hasApproval) dotColor = '#eab308';
          else if (rawStatus === 'working' || rawStatus === 'thinking' || rawStatus === 'executing') dotColor = '#06b6d4';
          else if (rawStatus === 'error' || rawStatus === 'blocked') dotColor = '#ef4444';

          return (
            <button
              key={p}
              className={`sims-sim-pod-btn ${isSel ? 'selected' : ''}`}
              onClick={() => handleSelectSim(p)}
              title={`Pilih ${p}`}
            >
              <div className="sims-sim-pod-avatar">
                {p.slice(0, 2).toUpperCase()}
                <span className="sims-sim-pod-dot" style={{ backgroundColor: dotColor }} />
              </div>
              <span className="sims-sim-pod-label">{p}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
