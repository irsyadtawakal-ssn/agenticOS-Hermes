import { ApprovalsPanel } from './ApprovalsPanel.tsx';
import { CostPanel } from './CostPanel.tsx';
import { formatUsd, sparkline, todayCost } from './model.ts';
import { shell, useShell } from './store.ts';

const DOT: Record<string, string> = { ok: 'bg-status-success', down: 'bg-danger', absent: 'bg-text-muted' };

export function Hud() {
  const approvals = useShell((s) => s.approvals);
  const daily = useShell((s) => s.daily);
  const health = useShell((s) => s.health);
  const approvalsOpen = useShell((s) => s.approvalsOpen);
  const costsOpen = useShell((s) => s.costsOpen);
  const waiting = approvals.length > 0;
  return (
    <div className="h-full flex items-center gap-16 px-12 bg-bg-dark border-t-2 border-border text-sm">
      <button
        type="button"
        onClick={() => shell.toggleApprovals()}
        aria-pressed={approvalsOpen}
        className={`px-8 py-2 border-2 cursor-pointer ${waiting ? 'border-status-permission text-status-permission' : 'border-transparent'} hover:bg-btn-hover`}
      >
        ⚠ Approval ({approvals.length})
      </button>
      <button
        type="button"
        onClick={() => shell.toggleCosts()}
        aria-pressed={costsOpen}
        className="px-8 py-2 border-2 border-transparent cursor-pointer hover:bg-btn-hover"
        title="Biaya 7 hari terakhir"
      >
        $ hari ini {formatUsd(todayCost(daily))} <span aria-hidden="true" className="text-text-muted">{sparkline(daily.map((d) => d.cost_usd))}</span>
      </button>
      <button type="button" onClick={() => shell.toggleDrawer()} className="px-8 py-2 border-2 border-transparent cursor-pointer hover:bg-btn-hover">
        ▤ Kanban
      </button>
      <ul className="flex items-center gap-10" aria-label="Kesehatan sistem">
        {health.map((c) => (
          <li key={c.id} className="flex items-center gap-4" title={`${c.label}: ${c.detail}`}>
            <span aria-hidden="true" className={`inline-block w-8 h-8 ${DOT[c.status]}`} />
            <span className={c.status === 'down' ? 'text-danger' : 'text-text-muted'}>
              {c.label}
              <span className="sr-only">: {c.status === 'ok' ? 'normal' : c.status === 'down' ? 'bermasalah' : 'tidak dipasang'}</span>
            </span>
          </li>
        ))}
      </ul>
      <span className="ml-auto text-text-muted">1–5 agent · A approval · B kanban · Esc tutup</span>
      {approvalsOpen && <ApprovalsPanel />}
      {costsOpen && <CostPanel />}
    </div>
  );
}
