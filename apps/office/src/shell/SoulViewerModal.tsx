import React, { useState } from 'react';
import { getProfileMeta, type SimProfileMeta } from '../sims-office/SimsMotives.ts';
import { SOUL_CONTENTS } from '../hermes/souls.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
import { useShell } from './store.ts';

interface SoulViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: string | null;
}

export const SoulViewerModal: React.FC<SoulViewerModalProps> = ({ isOpen, onClose, profile }) => {
  const [viewMode, setViewMode] = useState<'formatted' | 'raw'>('formatted');
  const [copied, setCopied] = useState(false);
  const tasks = useShell((s) => s.tasks);

  if (!isOpen || !profile) return null;

  const meta: SimProfileMeta = getProfileMeta(profile);
  const rawSoul =
    SOUL_CONTENTS[profile] ||
    `# Soul: ${meta.name.toUpperCase()}\n\nFile soul.md belum ditemukan di repositori untuk profil ini.\n\n## Peran Utama:\n${meta.soulBio}\n`;

  const plumbob =
    meta.customPlumbobColor ||
    (meta.tier === 'os-brain' ? '#22c55e' : meta.tier === 'os-worker' ? '#eab308' : '#a855f7');

  const tierBadge =
    meta.tier === 'os-brain'
      ? { label: 'BRAIN', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)' }
      : meta.tier === 'os-worker'
        ? { label: 'WORKER', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)' }
        : { label: 'PRIVATE', color: '#c084fc', bg: 'rgba(192, 132, 252, 0.15)', border: 'rgba(192, 132, 252, 0.4)' };

  const assignedTasks = tasks.filter((t) => t.assignee === profile);
  const activeTasks = assignedTasks.filter((t) => t.status === 'in_progress' || t.status === 'todo');

  const handleCopy = () => {
    simsAudio.playBubbleClick();
    navigator.clipboard.writeText(rawSoul);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    simsAudio.playBubbleClick();
    const blob = new Blob([rawSoul], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${profile}-soul.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Simple Markdown line-by-line renderer
  const renderFormattedMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    let tableRows: string[][] = [];
    let inTable = false;

    const flushTable = (keyIndex: number) => {
      if (tableRows.length === 0) return;
      const headers = tableRows[0];
      const rows = tableRows.slice(1).filter((r) => !r.every((c) => c.trim().match(/^:?-+:?$/)));
      elements.push(
        <div key={`table-${keyIndex}`} className="sims-soul-table-wrap">
          <table className="sims-soul-table">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i}>{formatInline(h.trim())}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>{formatInline(cell.trim())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      tableRows = [];
      inTable = false;
    };

    const flushCodeBlock = (keyIndex: number) => {
      if (codeBuffer.length === 0) return;
      elements.push(
        <div key={`code-${keyIndex}`} className="sims-soul-code-block">
          <pre>
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        </div>
      );
      codeBuffer = [];
      inCodeBlock = false;
    };

    const formatInline = (str: string): React.ReactNode => {
      // Bold **text**
      const parts = str.split(/(\*\*.*?\*\*|`.*?`)/g);
      return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="text-white font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="sims-soul-inline-code">
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      });
    };

    lines.forEach((line, idx) => {
      // Code fence
      if (line.trim().startsWith('```')) {
        if (inTable) flushTable(idx);
        if (inCodeBlock) {
          flushCodeBlock(idx);
        } else {
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      // Tables
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        inTable = true;
        const cells = line
          .trim()
          .slice(1, -1)
          .split('|');
        tableRows.push(cells);
        return;
      } else if (inTable) {
        flushTable(idx);
      }

      // Headers
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={idx} className="sims-soul-h1">
            {formatInline(line.replace('# ', ''))}
          </h1>
        );
        return;
      }
      if (line.startsWith('## ')) {
        elements.push(
          <h2 key={idx} className="sims-soul-h2">
            {formatInline(line.replace('## ', ''))}
          </h2>
        );
        return;
      }
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={idx} className="sims-soul-h3">
            {formatInline(line.replace('### ', ''))}
          </h3>
        );
        return;
      }

      // Blockquotes
      if (line.startsWith('> ')) {
        elements.push(
          <blockquote key={idx} className="sims-soul-quote">
            {formatInline(line.replace('> ', ''))}
          </blockquote>
        );
        return;
      }

      // Horizontal rule
      if (line.trim() === '---' || line.trim() === '***') {
        elements.push(<hr key={idx} className="sims-soul-hr" />);
        return;
      }

      // Bullet lists
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        elements.push(
          <div key={idx} className="sims-soul-bullet">
            <span className="sims-soul-bullet-dot">›</span>
            <span>{formatInline(line.trim().slice(2))}</span>
          </div>
        );
        return;
      }

      // Numbered lists
      const numMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
      if (numMatch) {
        elements.push(
          <div key={idx} className="sims-soul-bullet">
            <span className="sims-soul-num-badge">{numMatch[1]}</span>
            <span>{formatInline(numMatch[2])}</span>
          </div>
        );
        return;
      }

      // Empty line
      if (!line.trim()) {
        elements.push(<div key={idx} className="h-2" />);
        return;
      }

      // Standard paragraph
      elements.push(
        <p key={idx} className="sims-soul-p">
          {formatInline(line)}
        </p>
      );
    });

    if (inTable) flushTable(lines.length);
    if (inCodeBlock) flushCodeBlock(lines.length);

    return elements;
  };

  return (
    <div className="sims-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="sims-modal-container sims-soul-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sims-soul-modal-header">
          <div className="flex items-center gap-3">
            <div
              className="sims-fleet-avatar"
              style={{
                width: '44px',
                height: '44px',
                background: `radial-gradient(circle at 35% 35%, ${plumbob}33, #07101d 85%)`,
              }}
            >
              <span style={{ fontSize: '20px' }}>{meta.aspirationIcon || '👤'}</span>
              <span
                className="sims-fleet-plumbob-dot"
                style={{ backgroundColor: plumbob, color: plumbob }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-white capitalize">{profile}</span>
                <span
                  className="sims-fleet-tier-badge"
                  style={{
                    color: tierBadge.color,
                    background: tierBadge.bg,
                    borderColor: tierBadge.border,
                  }}
                >
                  {tierBadge.label}
                </span>
                <span className="text-xs text-slate-400">· {meta.title}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] font-mono text-sky-300 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-500/25">
                  📁 {meta.soulFile || `infra/profiles/soul/${profile}.md`}
                </span>
                <span className="text-[11px] text-slate-400">
                  {meta.zodiacIcon} {meta.zodiac} · {meta.aspirationLabel}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="hermes-settings-close-btn"
            onClick={() => {
              simsAudio.playClick();
              onClose();
            }}
            title="Tutup (Esc)"
          >
            <span>✕</span>
            <span>Tutup</span>
          </button>
        </div>

        {/* Spec Bar: LLM Engine, Provider & Fallback */}
        <div className="sims-soul-spec-bar">
          <div className="sims-soul-spec-item">
            <span className="sims-soul-spec-label">LLM ENGINE</span>
            <div className="sims-soul-spec-val highlight-blue">
              <span>🧠</span>
              <strong>{meta.llmModel || 'Claude 3.5 Sonnet'}</strong>
            </div>
          </div>

          <div className="sims-soul-spec-item">
            <span className="sims-soul-spec-label">PROVIDER & ROUTING</span>
            <div className="sims-soul-spec-val highlight-green">
              <span>⚡</span>
              <span>{meta.llmProvider || '9Router (os-brain)'}</span>
            </div>
          </div>

          <div className="sims-soul-spec-item">
            <span className="sims-soul-spec-label">FALLBACK MODEL</span>
            <div className="sims-soul-spec-val highlight-purple">
              <span>🔄</span>
              <span>{meta.llmFallback || 'Gemini 3.1 Pro'}</span>
            </div>
          </div>
        </div>

        {/* Duties & Live Tasks Overview */}
        <div className="sims-soul-duties-box">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
              <span>🎯</span>
              <span>Tugas Pokok & Tanggung Jawab Operasional:</span>
            </div>
            {activeTasks.length > 0 ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {activeTasks.length} Tugas Aktif di Kanban
              </span>
            ) : (
              <span className="text-[11px] text-slate-400 italic">
                💤 Standby di kantor (0 tugas aktif)
              </span>
            )}
          </div>

          <ul className="sims-soul-duties-list">
            {(meta.duties || [meta.soulBio]).map((duty, idx) => (
              <li key={idx} className="sims-soul-duty-item">
                <span className="sims-soul-duty-bullet">✓</span>
                <span>{duty}</span>
              </li>
            ))}
          </ul>

          {/* If there are live tasks in progress, show them */}
          {activeTasks.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-white/10">
              <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1.5">
                Kartu Kanban Sedang Dikerjakan:
              </span>
              <div className="flex flex-col gap-1.5">
                {activeTasks.map((t) => (
                  <div
                    key={t.id}
                    className="p-2 rounded bg-slate-900/70 border border-emerald-500/30 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono text-[10px] text-sky-400">[{t.id}]</span>
                      <span className="text-slate-200 truncate">{t.title}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300">
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tab Switcher & Action Buttons */}
        <div className="sims-soul-toolbar">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                simsAudio.playClick();
                setViewMode('formatted');
              }}
              className={`sims-soul-tab-btn ${viewMode === 'formatted' ? 'active' : ''}`}
            >
              <span>📖</span>
              <span>Tampilan Dokumen</span>
            </button>
            <button
              type="button"
              onClick={() => {
                simsAudio.playClick();
                setViewMode('raw');
              }}
              className={`sims-soul-tab-btn ${viewMode === 'raw' ? 'active' : ''}`}
            >
              <span>📄</span>
              <span>Raw Markdown ({meta.soulFile || 'soul.md'})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="sims-soul-action-btn"
              title="Salin isi soul.md ke clipboard"
            >
              <span>{copied ? '✓' : '📋'}</span>
              <span>{copied ? 'Tersalin!' : 'Salin Markdown'}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="sims-soul-action-btn"
              title="Unduh file soul.md"
            >
              <span>💾</span>
              <span>Unduh .md</span>
            </button>
          </div>
        </div>

        {/* Soul Body */}
        <div className="sims-soul-content-body">
          {viewMode === 'formatted' ? (
            <div className="sims-soul-formatted-view">{renderFormattedMarkdown(rawSoul)}</div>
          ) : (
            <pre className="sims-soul-raw-view">
              <code>{rawSoul}</code>
            </pre>
          )}
        </div>

        {/* Modal Footer */}
        <div className="sims-soul-modal-footer">
          <div className="text-[11px] text-slate-400">
            Sistem Profil Hermes Agentic OS · Disinkronkan dengan <code>infra/9router/combos.md</code>
          </div>
          <button
            type="button"
            onClick={() => {
              simsAudio.playClick();
              onClose();
            }}
            className="sims-fleet-btn sims-fleet-btn-secondary"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
