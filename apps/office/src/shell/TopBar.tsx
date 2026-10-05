import { useState } from 'react';
import { PROFILES } from '../hermes/labels.ts';
import { formatUsd, todayCost } from './model.ts';
import { shell, useShell } from './store.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
import './sims-shell.css';

const DOT: Record<string, string> = {
  ok: 'bg-emerald-400 shadow-[0_0_8px_#34d399]',
  down: 'bg-rose-500 shadow-[0_0_8px_#f43f5e]',
  absent: 'bg-slate-500',
};

export function TopBar() {
  const approvals = useShell((s) => s.approvals);
  const daily = useShell((s) => s.daily);
  const health = useShell((s) => s.health);
  const agents = useShell((s) => s.agents);
  const selected = useShell((s) => s.selected);
  const drawerOpen = useShell((s) => s.drawerOpen);
  const viewMode = useShell((s) => s.viewMode);
  const approvalsOpen = useShell((s) => s.approvalsOpen);
  const costsOpen = useShell((s) => s.costsOpen);
  const settingsOpen = useShell((s) => s.settingsOpen);
  const operatorName = useShell((s) => s.operatorName);
  const operatorAvatar = useShell((s) => s.operatorAvatar);
  const operatorTitle = useShell((s) => s.operatorTitle);

  const [healthOpen, setHealthOpen] = useState(false);

  const waiting = approvals.length > 0;
  const downServices = health.filter((h) => h.status === 'down');
  const allHealthy = downServices.length === 0;

  const onlineCount = PROFILES.filter((p) => {
    const raw = agents.find((a) => a.profile === p)?.state;
    return raw && raw !== 'offline';
  }).length;

  return (
    <header role="banner" className="sims-topbar">
      {/* 1. Left Section: Logo, Online Roster, and 3D/2D Switcher */}
      <div className="sims-topbar-left">
        {/* Brand Plumbob & Title */}
        <div className="sims-topbar-brand">
          <span className="sims-topbar-plumbob" title="The Sims 2 Plumbob">
            💎
          </span>
          <div className="sims-topbar-title-wrap">
            <div className="sims-topbar-title-row">
              <h1 className="sims-topbar-title">THE SIMS 2 OFFICE</h1>
              <span className="sims-topbar-online-pill">
                <span className="sims-topbar-online-dot" />
                {onlineCount}/{PROFILES.length} ONLINE
              </span>
            </div>
            <span className="sims-topbar-subtitle">Agentic OS Command Hub</span>
          </div>
        </div>

        <div className="sims-topbar-divider" />

        {/* 3D Sims / 2D Classic Segmented Control */}
        <div className="sims-topbar-segmented">
          <button
            type="button"
            onClick={() => {
              simsAudio.playBubbleClick();
              shell.setViewMode('sims');
            }}
            className={`sims-topbar-seg-btn ${viewMode === 'sims' ? 'active' : ''}`}
            title="Mode Tampilan 3D Isometric The Sims 2"
          >
            3D Kantor
          </button>
          <button
            type="button"
            onClick={() => {
              simsAudio.playBubbleClick();
              shell.setViewMode('claude');
            }}
            className={`sims-topbar-seg-btn ${viewMode === 'claude' ? 'active' : ''}`}
            title="Mode Tampilan 2D Klasik"
          >
            2D Klasik
          </button>
        </div>
      </div>

      {/* 2. Center Section: Compact Interactive System Health Capsule */}
      <div className="sims-topbar-center">
        <button
          type="button"
          onClick={() => setHealthOpen(!healthOpen)}
          className={`sims-topbar-health-btn ${allHealthy ? '' : 'has-issues'}`}
          title="Klik untuk melihat detail kesehatan semua layanan sistem"
        >
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              allHealthy
                ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                : 'bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-ping'
            }`}
          />
          <span>
            {allHealthy ? '🟢 Sistem Sehat (6 Layanan)' : `🔴 ${downServices[0]?.label ?? 'Layanan'} Bermasalah`}
          </span>
          <span className="text-[11px] opacity-70">▾</span>
        </button>

        {/* Health Dropdown Popover */}
        {healthOpen && (
          <div className="sims-topbar-popover">
            <div className="flex items-center justify-between pb-2 border-b border-white/10 text-xs font-bold text-sky-200">
              <span>Status Layanan Agen</span>
              <button
                type="button"
                onClick={() => setHealthOpen(false)}
                className="text-slate-400 hover:text-white text-xs px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <ul className="flex flex-col gap-1.5 m-0 p-0 list-none">
              {health.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between px-2.5 py-1 rounded bg-slate-950/70 border border-white/5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full inline-block ${DOT[c.status]}`} />
                    <span className="font-semibold text-slate-200">{c.label}</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      c.status === 'ok'
                        ? 'text-emerald-300 bg-emerald-500/15'
                        : c.status === 'down'
                          ? 'text-rose-300 bg-rose-500/25 font-bold'
                          : 'text-slate-400'
                    }`}
                  >
                    {c.status.toUpperCase()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 3. Right Section: Action Center with Proper Spacing & Zero Offside */}
      <div className="sims-topbar-right">
        {/* Owner Profile Capsule */}
        <button
          type="button"
          onClick={() => {
            simsAudio.playBubbleClick();
            shell.openSettings('workspace');
          }}
          className="sims-topbar-owner-btn"
          title={`Owner: ${operatorName} (${operatorTitle}) · Klik untuk kustomisasi Avatar & Profil`}
        >
          <div className="sims-topbar-owner-avatar-wrap">
            <span className="sims-topbar-owner-avatar">{operatorAvatar}</span>
            <span className="sims-topbar-owner-dot" />
          </div>
          <div className="sims-topbar-owner-info">
            <div className="sims-topbar-owner-name-row">
              <span className="sims-topbar-owner-name">{operatorName}</span>
              <span className="sims-topbar-owner-tag">OWNER</span>
            </div>
            <span className="sims-topbar-owner-title">{operatorTitle}</span>
          </div>
        </button>

        <div className="sims-topbar-owner-divider" />

        {/* Broadcast Chat All */}
        <button
          type="button"
          onClick={() => {
            simsAudio.playBubbleClick();
            shell.select('all');
            shell.setTab('chat');
          }}
          aria-pressed={selected === 'all'}
          className={`sims-topbar-btn ${selected === 'all' ? 'active' : ''}`}
          title="Broadcast Chat ke Semua Agent (Shortcut: Shift+C)"
        >
          <span className="text-sm">📢</span>
          <span className="sims-btn-label">Chat All</span>
        </button>

        {/* Kanban Board */}
        <button
          type="button"
          onClick={() => {
            simsAudio.playBubbleClick();
            shell.toggleDrawer();
          }}
          aria-pressed={drawerOpen}
          className={`sims-topbar-btn ${drawerOpen ? 'active' : ''}`}
          title="Buka / Tutup Papan Tugas Kanban (Shortcut: B)"
        >
          <span className="text-sm">📋</span>
          <span className="sims-btn-label">Kanban</span>
        </button>

        {/* Character Studio */}
        <button
          type="button"
          onClick={() => {
            simsAudio.playSelectSim();
            shell.openCharacterStudio();
          }}
          className="sims-topbar-btn"
          title="Buka Character Studio (Edit Wajah, Rambut & Busana 3D)"
        >
          <span className="text-sm">🎨</span>
          <span className="sims-btn-label sims-btn-label-optional">Karakter</span>
        </button>

        {/* Daily Cost Metric */}
        <button
          type="button"
          onClick={() => {
            simsAudio.playBubbleClick();
            shell.toggleCosts();
          }}
          aria-pressed={costsOpen}
          className={`sims-topbar-btn ${costsOpen ? 'active' : ''}`}
          title="Rincian biaya token 9Router hari ini"
        >
          <span className="text-sm font-sans">🪙</span>
          <span className="font-mono text-emerald-300 font-black tracking-tight">
            {formatUsd(todayCost(daily))}
          </span>
        </button>

        {/* Approvals Alert Button */}
        <button
          type="button"
          onClick={() => {
            simsAudio.playBubbleClick();
            shell.toggleApprovals();
          }}
          aria-pressed={approvalsOpen}
          className={`sims-topbar-btn ${waiting ? 'warning-alert' : approvalsOpen ? 'active' : ''}`}
          title="Persetujuan Aksi Berisiko (Shortcut: A)"
        >
          <span className="text-sm">⚠️</span>
          <span className="sims-btn-label">Approval</span>
          <span className="sims-topbar-badge">{approvals.length}</span>
        </button>

        {/* Settings Button */}
        <button
          type="button"
          onClick={() => {
            simsAudio.playBubbleClick();
            shell.toggleSettings();
          }}
          aria-pressed={settingsOpen}
          className={`sims-topbar-btn ${settingsOpen ? 'active' : ''}`}
          title="Pengaturan Umum (Shortcut: S)"
        >
          <span className="text-sm">⚙️</span>
          <span className="sims-btn-label">Settings</span>
        </button>
      </div>
    </header>
  );
}
