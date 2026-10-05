import { shell, useShell } from './store.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
import './sims-shell.css';

export function ActivityRail() {
  const selected = useShell((s) => s.selected);
  const drawerOpen = useShell((s) => s.drawerOpen);
  const approvalsOpen = useShell((s) => s.approvalsOpen);
  const costsOpen = useShell((s) => s.costsOpen);
  const settingsOpen = useShell((s) => s.settingsOpen);
  const approvals = useShell((s) => s.approvals);

  const isBroadcast = selected === 'all';
  const hasPendingApprovals = approvals.length > 0;

  return (
    <aside
      aria-label="Activity Rail Navigasi Cepat"
      className="w-12 h-full bg-slate-950/80 backdrop-blur-md border-r border-sky-400/20 flex flex-col items-center py-3 gap-3 z-20 select-none"
    >
      {/* Broadcast Chat All */}
      <button
        type="button"
        onClick={() => {
          simsAudio.playBubbleClick();
          shell.select('all');
          shell.setTab('chat');
        }}
        aria-pressed={isBroadcast}
        className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition cursor-pointer relative group ${
          isBroadcast
            ? 'bg-cyan-500/25 border border-cyan-400 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
            : 'border border-white/5 text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 hover:border-cyan-400/30'
        }`}
        title="Broadcast Chat All (Shift+C)"
      >
        <span>📢</span>
        <span className="sr-only">Broadcast Chat All</span>
      </button>

      {/* Kanban Board */}
      <button
        type="button"
        onClick={() => {
          simsAudio.playBubbleClick();
          shell.toggleDrawer();
        }}
        aria-pressed={drawerOpen}
        className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition cursor-pointer relative group ${
          drawerOpen
            ? 'bg-sky-500/25 border border-sky-400 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.4)]'
            : 'border border-white/5 text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 hover:border-sky-400/30'
        }`}
        title="Papan Kanban Tugas (Shortcut: B)"
      >
        <span>📋</span>
        <span className="sr-only">Papan Kanban</span>
      </button>

      {/* Approvals */}
      <button
        type="button"
        onClick={() => {
          simsAudio.playBubbleClick();
          shell.toggleApprovals();
        }}
        aria-pressed={approvalsOpen}
        className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition cursor-pointer relative group ${
          hasPendingApprovals
            ? 'bg-amber-500/25 border border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.5)] animate-pulse'
            : approvalsOpen
              ? 'bg-sky-500/25 border border-sky-400 text-sky-200'
              : 'border border-white/5 text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 hover:border-amber-400/30'
        }`}
        title={`Izin Approval (${approvals.length}) (Shortcut: A)`}
      >
        <span>⚠️</span>
        {hasPendingApprovals && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center shadow-md">
            {approvals.length}
          </span>
        )}
        <span className="sr-only">Izin Operasi</span>
      </button>

      {/* Cost Analytics */}
      <button
        type="button"
        onClick={() => {
          simsAudio.playBubbleClick();
          shell.toggleCosts();
        }}
        aria-pressed={costsOpen}
        className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition cursor-pointer relative group ${
          costsOpen
            ? 'bg-emerald-500/25 border border-emerald-400 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
            : 'border border-white/5 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 hover:border-emerald-400/30'
        }`}
        title="Laporan Biaya Token (9Router)"
      >
        <span>🪙</span>
        <span className="sr-only">Laporan Biaya</span>
      </button>

      <div className="mt-auto flex flex-col items-center gap-3">
        {/* Settings */}
        <button
          type="button"
          onClick={() => {
            simsAudio.playBubbleClick();
            shell.toggleSettings();
          }}
          aria-pressed={settingsOpen}
          className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg transition cursor-pointer relative group ${
            settingsOpen
              ? 'bg-sky-500/25 border border-sky-400 text-sky-200 shadow-[0_0_12px_rgba(56,189,248,0.4)]'
              : 'border border-white/5 text-slate-400 hover:text-sky-300 hover:bg-sky-500/10 hover:border-sky-400/30'
          }`}
          title="Pengaturan Sistem (Shortcut: S)"
        >
          <span>⚙️</span>
          <span className="sr-only">Pengaturan</span>
        </button>
      </div>
    </aside>
  );
}
