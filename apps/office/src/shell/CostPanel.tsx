import { Button } from '../../vendor/pixel-agents/webview-ui/src/components/ui/Button.tsx';
import { formatUsd } from './model.ts';
import { shell, useShell } from './store.ts';

interface Row {
  label: string;
  calls: number;
  cost_usd: number;
}

function CostTable({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="text-text-muted">
          <th className="text-left font-normal">{title}</th>
          <th className="text-right font-normal">Panggilan</th>
          <th className="text-right font-normal">USD</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="pr-12">{r.label}</td>
            <td className="pr-12 text-right">{r.calls}</td>
            <td className="text-right">{formatUsd(r.cost_usd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CostPanel() {
  const costs = useShell((s) => s.costs);
  const daily = useShell((s) => s.daily);
  return (
    <div role="dialog" aria-label="Rincian biaya" className="fixed bottom-56 left-12 right-12 z-40 max-w-[520px] max-h-[60vh] overflow-auto pixel-panel p-12 flex flex-col gap-12 text-sm whitespace-normal">
      <div className="flex items-center justify-between">
        <strong>Biaya hari ini {costs ? formatUsd(costs.total.cost_usd) : '…'}</strong>
        <Button size="sm" variant="ghost" onClick={() => shell.toggleCosts()}>
          Tutup
        </Button>
      </div>
      {costs && (
        <>
          <CostTable title="Agent" rows={costs.byProfile.map((p) => ({ label: p.profile, calls: p.calls, cost_usd: p.cost_usd }))} />
          <CostTable title="Model" rows={costs.byModel.map((m) => ({ label: m.model ?? '-', calls: m.calls, cost_usd: m.cost_usd }))} />
          {costs.byTask.length > 0 && (
            <CostTable title="Kartu" rows={costs.byTask.map((t) => ({ label: t.task_id, calls: t.calls, cost_usd: t.cost_usd }))} />
          )}
          {costs.byProfile.length > 0 && costs.byProfile.every((p) => p.profile === 'shared') && (
            <p className="text-text-muted">Semua biaya tercatat sebagai "shared" sampai key 9Router per agent dibuat (runbook §3).</p>
          )}
        </>
      )}
      <CostTable title="7 hari" rows={daily.map((d) => ({ label: d.day, calls: d.calls, cost_usd: d.cost_usd }))} />
    </div>
  );
}
