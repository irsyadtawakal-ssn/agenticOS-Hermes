import { ApprovalsPanel } from './ApprovalsPanel.tsx';
import { CostPanel } from './CostPanel.tsx';
import { formatUsd, sparkline, todayCost } from './model.ts';
import { shell, useShell } from './store.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
import './sims-shell.css';

const DOT: Record<string, string> = {
  ok: 'bg-emerald-500 shadow-[0_0_6px_#10b981]',
  down: 'bg-rose-500 shadow-[0_0_6px_#f43f5e]',
  absent: 'bg-slate-500',
};

export function Hud() {
  const approvals = useShell((s) => s.approvals);
  const daily = useShell((s) => s.daily);
  const health = useShell((s) => s.health);
  const approvalsOpen = useShell((s) => s.approvalsOpen);
  const costsOpen = useShell((s) => s.costsOpen);
  const drawerOpen = useShell((s) => s.drawerOpen);
  const selected = useShell((s) => s.selected);
  const waiting = approvals.length > 0;

  return (
    <div className="sims-hud-bar relative h-full flex items-center gap-12 px-12 text-xs whitespace-nowrap overflow-x-auto [scrollbar-width:thin] text-slate-200">
      <button
        type="button"
        onClick={() => {
          simsAudio.playBubbleClick();
          shell.select('all');
          shell.setTab('chat');
        }}
        aria-pressed={selected === 'all'}
        className={`px-8 py-2 rounded-full border cursor-pointer font-bold transition ${
          selected === 'all'
            ? 'border-cyan-400 text-cyan-200 bg-cyan-500/25 shadow-[0_0_8px_rgba(6,182,212,0.4)]'
            : 'border-white/10 hover:border-cyan-400/40 hover:bg-cyan-500/10 text-slate-300'
        }`}
        title="Buka Chat All / Broadcast ke Semua Agent (Shortcut: Shift+C)"
      >
        📢 Chat All (Shift+C)
      </button>

      <button
        type="button"
        onClick={() => {
          simsAudio.playBubbleClick();
          shell.toggleApprovals();
        }}
        aria-pressed={approvalsOpen}
        className={`px-8 py-2 rounded-full border cursor-pointer font-bold transition ${
          waiting
            ? 'border-amber-400 text-amber-300 bg-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
            : 'border-white/10 hover:border-sky-400/40 hover:bg-sky-500/10 text-slate-300'
        }`}
      >
        ⚠️ Approval ({approvals.length})
      </button>

      <button
        type="button"
        onClick={() => {
          simsAudio.playBubbleClick();
          shell.toggleCosts();
        }}
        aria-pressed={costsOpen}
        className="px-8 py-2 rounded-full border border-white/10 hover:border-sky-400/40 hover:bg-sky-500/10 cursor-pointer text-slate-300 transition"
        title="Biaya 7 hari terakhir"
      >
        🪙 Biaya hari ini <strong className="text-emerald-300 font-mono ml-2">{formatUsd(todayCost(daily))}</strong>{' '}
        <span aria-hidden="true" className="text-sky-400 ml-4">
          {sparkline(daily.map((d) => d.cost_usd))}
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          simsAudio.playBubbleClick();
          shell.toggleDrawer();
        }}
        aria-pressed={drawerOpen}
        className={`px-8 py-2 rounded-full border cursor-pointer transition font-semibold ${
          drawerOpen
            ? 'border-sky-400 text-sky-200 bg-sky-500/25 shadow-[0_0_8px_rgba(56,189,248,0.4)]'
            : 'border-white/10 hover:border-sky-400/40 hover:bg-sky-500/10 text-slate-300'
        }`}
        title="Buka / Tutup Papan Kanban (Shortcut: B)"
      >
        📋 Papan Kanban (B)
      </button>

      <ul className="flex items-center gap-8 shrink-0 ml-4" aria-label="Kesehatan sistem">
        {health.map((c) => (
          <li key={c.id} className="flex items-center gap-4 text-[11px]" title={`${c.label}: ${c.detail}`}>
            <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${DOT[c.status]}`} />
            <span className={c.status === 'down' ? 'text-rose-400 font-bold' : 'text-slate-400'}>
              {c.label}
              <span className="sr-only">
                : {c.status === 'ok' ? 'normal' : c.status === 'down' ? 'bermasalah' : 'tidak dipasang'}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <span className="ml-auto pl-16 text-slate-400 text-[11px]">
        1–9 agent · Shift+C chat all · C chat · B kanban · A approval · Esc tutup
      </span>

      {approvalsOpen && <ApprovalsPanel />}
      {costsOpen && <CostPanel />}
    </div>
  );
}
