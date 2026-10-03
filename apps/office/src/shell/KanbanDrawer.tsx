import { type DragEvent, useState } from 'react';
import { PROFILES } from '../hermes/labels.ts';
import * as api from './api.ts';
import { canMove, KANBAN_COLUMNS } from './model.ts';
import { shell, useShell } from './store.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
import './sims-shell.css';

const TARGETS = [...KANBAN_COLUMNS, 'archived'] as const;

const COLUMN_CONFIG: Record<
  string,
  { label: string; dot: string; border: string; bg: string }
> = {
  triage: { label: 'Triage', dot: '#a855f7', border: '#a855f7', bg: 'rgba(168, 85, 247, 0.1)' },
  todo: { label: 'Todo', dot: '#94a3b8', border: '#64748b', bg: 'rgba(100, 116, 139, 0.1)' },
  ready: { label: 'Ready', dot: '#38bdf8', border: '#0284c7', bg: 'rgba(14, 165, 233, 0.1)' },
  running: { label: 'Running', dot: '#06b6d4', border: '#0891b2', bg: 'rgba(6, 182, 212, 0.15)' },
  blocked: { label: 'Blocked', dot: '#ef4444', border: '#dc2626', bg: 'rgba(239, 68, 68, 0.15)' },
  review: { label: 'Review', dot: '#f59e0b', border: '#d97706', bg: 'rgba(245, 158, 11, 0.1)' },
  done: { label: 'Done', dot: '#22c55e', border: '#16a34a', bg: 'rgba(34, 197, 94, 0.1)' },
  archived: { label: 'Arsip', dot: '#64748b', border: '#475569', bg: 'rgba(51, 65, 85, 0.1)' },
};

export function KanbanDrawer() {
  const open = useShell((s) => s.drawerOpen);
  const tasks = useShell((s) => s.tasks);
  const [filter, setFilter] = useState('');
  const [dragging, setDragging] = useState<api.KanbanTask | null>(null);
  const [form, setForm] = useState({ title: '', assignee: 'researcher', body: '' });
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const visible = tasks.filter(
    (t) => t.status !== 'archived' && (!filter || t.assignee === filter)
  );

  async function drop(e: DragEvent, to: string) {
    e.preventDefault();
    const task = dragging;
    setDragging(null);
    if (!task || task.status === to) return;
    if (!canMove(task.status, to)) {
      simsAudio.playMotiveAlert();
      shell.showToast(`Tidak bisa memindah ${task.status} → ${to} dari office.`);
      return;
    }
    const note =
      task.status === 'blocked' && to === 'ready'
        ? window.prompt('Instruksi tambahan untuk agent (opsional):') ?? ''
        : '';
    try {
      simsAudio.playSuccess();
      await api.moveCard(task.id, to, note);
      shell.showToast(`${task.id} dipindah ke ${COLUMN_CONFIG[to]?.label ?? to}.`);
      await shell.refreshKanban();
    } catch (err) {
      simsAudio.playMotiveAlert();
      shell.showToast((err as Error).message);
    }
  }

  async function create() {
    setCreating(true);
    try {
      simsAudio.playSuccess();
      const r = await api.createCard(form);
      shell.showToast(r.output);
      setForm({ ...form, title: '', body: '' });
      await shell.refreshKanban();
    } catch (err) {
      simsAudio.playMotiveAlert();
      shell.showToast((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  const handleClose = () => {
    simsAudio.playBubbleClick();
    shell.toggleDrawer();
  };

  return (
    <section aria-label="Laci kanban" className="sims-kanban-drawer">
      {/* Header Bar */}
      <div className="sims-kanban-header">
        <div className="sims-kanban-title">
          <span>📋</span>
          <span>PAPAN TUGAS KANBAN (THE SIMS 2)</span>
        </div>

        <label className="sims-kanban-filter-label">
          <span>Filter:</span>
          <select
            aria-label="Filter agent"
            className="sims-kanban-select"
            value={filter}
            onChange={(e) => {
              simsAudio.playBubbleClick();
              setFilter(e.target.value);
            }}
          >
            <option value="">Semua Agent</option>
            {PROFILES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        {/* Create Card Form */}
        <input
          aria-label="Judul kartu baru"
          placeholder="Judul kartu tugas baru…"
          maxLength={80}
          className="sims-kanban-input flex-1 min-w-[140px]"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />

        <select
          aria-label="Assignee kartu baru"
          className="sims-kanban-select"
          value={form.assignee}
          onChange={(e) => setForm({ ...form, assignee: e.target.value })}
        >
          {PROFILES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <input
          aria-label="Isi kartu baru"
          placeholder="Goal / kriteria selesai…"
          className="sims-kanban-input flex-1 min-w-[140px]"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />

        <button
          className="sims-kanban-btn-create"
          disabled={creating || !form.title.trim()}
          onClick={() => void create()}
          title="Buat tugas baru"
        >
          + Buat Kartu
        </button>

        <button
          className="sims-kanban-btn-close"
          onClick={handleClose}
          title="Tutup Papan Kanban (B)"
        >
          ✕ Tutup
        </button>
      </div>

      {/* Columns Grid */}
      <div
        className="sims-kanban-columns"
        style={{
          gridTemplateColumns: `repeat(${TARGETS.length}, minmax(185px, 1fr))`,
        }}
      >
        {TARGETS.map((col) => {
          const config = COLUMN_CONFIG[col] ?? {
            label: col,
            dot: '#94a3b8',
            border: '#64748b',
            bg: 'transparent',
          };
          const refused =
            dragging !== null && dragging.status !== col && !canMove(dragging.status, col);
          const cards = col === 'archived' ? [] : visible.filter((t) => t.status === col);

          return (
            <div
              key={col}
              aria-label={`Kolom ${config.label}`}
              onDragOver={(e) => {
                if (!refused) e.preventDefault();
              }}
              onDrop={(e) => void drop(e, col)}
              className="sims-kanban-col"
              style={{
                borderColor: refused ? '#ef4444' : undefined,
                opacity: refused ? 0.45 : 1,
              }}
            >
              <div className="sims-kanban-col-header">
                <div className="sims-kanban-col-title">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: config.dot }}
                  />
                  <span>{config.label}</span>
                </div>
                <span className="sims-kanban-col-count">
                  {col === 'archived' ? 'seret' : cards.length}
                </span>
              </div>

              <div className="sims-kanban-card-list">
                {cards.map((t) => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={() => setDragging(t)}
                    onDragEnd={() => setDragging(null)}
                    className="sims-kanban-card"
                    style={{
                      borderLeftColor: config.border,
                    }}
                    title="Seret ke kolom lain untuk memindahkan status"
                  >
                    <div className="sims-kanban-card-title">{t.title}</div>
                    <div className="sims-kanban-card-meta">
                      <span className="font-mono text-sky-400">{t.id}</span>
                      <span className="sims-kanban-assignee-tag">
                        <span>👤</span>
                        <span>{t.assignee ?? 'unassigned'}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
