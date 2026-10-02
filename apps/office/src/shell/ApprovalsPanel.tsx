import { useState } from 'react';
import { Button } from '../../vendor/pixel-agents/webview-ui/src/components/ui/Button.tsx';
import * as api from './api.ts';
import { shell, useShell } from './store.ts';

export function ApprovalsPanel() {
  const approvals = useShell((s) => s.approvals);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function act(id: string, decision: 'approve' | 'deny') {
    setBusy(id);
    try {
      await api.decide(id, decision, notes[id]?.trim() || undefined);
      shell.showToast(decision === 'approve' ? `Izin ${id} disetujui.` : `Izin ${id} ditolak.`);
      await shell.refreshApprovals();
    } catch (err) {
      shell.showToast((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div role="dialog" aria-label="Kotak masuk approval" className="fixed bottom-56 left-12 z-40 w-[560px] max-h-[60vh] overflow-auto pixel-panel p-12 flex flex-col gap-12">
      <div className="flex items-center justify-between">
        <strong>Approval menunggu ({approvals.length})</strong>
        <Button size="sm" variant="ghost" onClick={() => shell.toggleApprovals()}>
          Tutup
        </Button>
      </div>
      {approvals.length === 0 && <p className="text-text-muted">Tidak ada yang menunggu.</p>}
      {approvals.map((a) => (
        <article key={a.id} className="border-2 border-border p-8 flex flex-col gap-6">
          <div className="flex justify-between gap-8">
            <span>
              <strong>{a.id}</strong> · {a.profile} · kartu {a.task_id ?? '-'}
            </span>
            <span className="text-text-muted">{new Date(a.created_at).toLocaleTimeString('id-ID')}</span>
          </div>
          <div>
            {a.tool} — aturan {a.rule_id}
            {a.reason ? ` (${a.reason})` : ''}
          </div>
          <details>
            <summary className="cursor-pointer text-text-muted">Detail argumen</summary>
            <pre className="whitespace-pre-wrap break-all text-xs">{a.args_preview}</pre>
          </details>
          <input
            aria-label={`Instruksi untuk ${a.id}`}
            placeholder="Instruksi/alasan (opsional)"
            className="bg-bg border-2 border-border px-6 py-2 text-sm"
            value={notes[a.id] ?? ''}
            onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
          />
          <div className="flex gap-8">
            <Button size="sm" variant="accent" disabled={busy === a.id} onClick={() => void act(a.id, 'approve')}>
              Setujui
            </Button>
            <Button size="sm" disabled={busy === a.id} onClick={() => void act(a.id, 'deny')}>
              Tolak
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
