import { type DragEvent, useState } from 'react';
import { Button } from '../../vendor/pixel-agents/webview-ui/src/components/ui/Button.tsx';
import { PROFILES } from '../hermes/labels.ts';
import * as api from './api.ts';
import { canMove, KANBAN_COLUMNS } from './model.ts';
import { shell, useShell } from './store.ts';

const TARGETS = [...KANBAN_COLUMNS, 'archived'] as const;
const LABEL: Record<string, string> = {
  triage: 'Triage',
  todo: 'Todo',
  ready: 'Ready',
  running: 'Running',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  archived: 'Arsip',
};

export function KanbanDrawer() {
  const open = useShell((s) => s.drawerOpen);
  const tasks = useShell((s) => s.tasks);
  const [filter, setFilter] = useState('');
  const [dragging, setDragging] = useState<api.KanbanTask | null>(null);
  const [form, setForm] = useState({ title: '', assignee: 'researcher', body: '' });
  const [creating, setCreating] = useState(false);
  if (!open) return null;

  const visible = tasks.filter((t) => t.status !== 'archived' && (!filter || t.assignee === filter));

  async function drop(e: DragEvent, to: string) {
    e.preventDefault();
    const task = dragging;
    setDragging(null);
    if (!task || task.status === to) return;
    if (!canMove(task.status, to)) {
      shell.showToast(`Tidak bisa memindah ${task.status} → ${to} dari office.`);
      return;
    }
    const note = task.status === 'blocked' && to === 'ready' ? (window.prompt('Instruksi tambahan untuk agent (opsional):') ?? '') : '';
    try {
      await api.moveCard(task.id, to, note);
      shell.showToast(`${task.id} dipindah ke ${LABEL[to]}.`);
      await shell.refreshKanban();
    } catch (err) {
      shell.showToast((err as Error).message);
    }
  }

  async function create() {
    setCreating(true);
    try {
      const r = await api.createCard(form);
      shell.showToast(r.output);
      setForm({ ...form, title: '', body: '' });
      await shell.refreshKanban();
    } catch (err) {
      shell.showToast((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section aria-label="Laci kanban" className="absolute left-0 right-0 bottom-0 h-[60%] z-30 bg-bg-dark border-t-2 border-border flex flex-col">
      <div className="flex flex-wrap items-center gap-12 p-8 border-b-2 border-border text-sm">
        <strong>Kanban</strong>
        <label className="flex items-center gap-6">
          Agent
          <select aria-label="Filter agent" className="bg-bg border-2 border-border" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">semua</option>
            {PROFILES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <input
          aria-label="Judul kartu baru"
          placeholder="Judul kartu baru"
          maxLength={80}
          className="bg-bg border-2 border-border px-6 flex-1 min-w-0"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <select aria-label="Assignee kartu baru" className="bg-bg border-2 border-border" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
          {PROFILES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          aria-label="Isi kartu baru"
          placeholder="Goal / acceptance criteria"
          className="bg-bg border-2 border-border px-6 flex-1 min-w-0"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
        <Button size="sm" variant="accent" disabled={creating || !form.title.trim()} onClick={() => void create()}>
          Buat
        </Button>
        <Button size="sm" variant="ghost" onClick={() => shell.toggleDrawer()}>
          Tutup
        </Button>
      </div>
      <div className="flex-1 grid gap-6 p-8 overflow-auto" style={{ gridTemplateColumns: `repeat(${TARGETS.length}, minmax(160px, 1fr))` }}>
        {TARGETS.map((col) => {
          const refused = dragging !== null && dragging.status !== col && !canMove(dragging.status, col);
          const cards = col === 'archived' ? [] : visible.filter((t) => t.status === col);
          return (
            <div
              key={col}
              aria-label={`Kolom ${LABEL[col]}`}
              onDragOver={(e) => {
                if (!refused) e.preventDefault();
              }}
              onDrop={(e) => void drop(e, col)}
              className={`flex flex-col gap-6 p-6 border-2 min-h-0 ${refused ? 'border-danger opacity-50' : 'border-border'}`}
            >
              <div className="text-text-muted text-sm">
                {LABEL[col]}
                {col === 'archived' ? ' (seret ke sini)' : ` (${cards.length})`}
              </div>
              {cards.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={() => setDragging(t)}
                  onDragEnd={() => setDragging(null)}
                  className="border-2 border-border bg-bg p-6 cursor-grab text-sm"
                >
                  <div>{t.title}</div>
                  <div className="text-text-muted">
                    {t.id} · {t.assignee ?? '-'}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
