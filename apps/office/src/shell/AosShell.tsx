import { lazy, Suspense, useEffect, useState } from 'react';
import { agentIdFor, PROFILES } from '../hermes/labels.ts';
import { officeTransport } from '../hermes/transport.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
import { Dock } from './Dock.tsx';
import { Hud } from './Hud.tsx';
import './sims-shell.css';
import { KanbanDrawer } from './KanbanDrawer.tsx';
import { keyAction } from './model.ts';
import { shell, useShell } from './store.ts';
import { requestNotificationPermission } from './notifications.ts';
import { SettingsDashboard } from './SettingsDashboard.tsx';

const SimsOfficeView = lazy(() => import('../sims-office/SimsOfficeView.tsx').then((m) => ({ default: m.SimsOfficeView })));
const ClaudeOfficeView = lazy(() => import('../claude-office/ClaudeOfficeView.tsx').then(module => ({ default: module.ClaudeOfficeView })));

export default function AosShell() {
  const selected = useShell((s) => s.selected);
  const drawerOpen = useShell((s) => s.drawerOpen);
  const toast = useShell((s) => s.toast);
  const viewMode = useShell((s) => s.viewMode);
  const settingsOpen = useShell((s) => s.settingsOpen);

  useEffect(() => {
    shell.refreshAll();
    void requestNotificationPermission();
    const handleFirstInteraction = () => {
      void requestNotificationPermission();
      window.removeEventListener('click', handleFirstInteraction);
    };
    window.addEventListener('click', handleFirstInteraction);
    const t = officeTransport;
    const offTopic = t?.onCoreTopic((topic, data) => shell.onTopic(topic, data));
    const offFocus = t?.onFocus((id) => shell.select(PROFILES[id - 1] ?? null));
    const onKey = (e: KeyboardEvent) => {
      const action = keyAction(e);
      if (!action) return;
      if (action.type === 'focus') {
        shell.select(action.profile);
        const id = agentIdFor(action.profile);
        if (id !== null) t?.select(id);
      } else if (action.type === 'approvals') {
        simsAudio.playBubbleClick();
        shell.toggleApprovals();
      } else if (action.type === 'kanban') {
        simsAudio.playBubbleClick();
        shell.toggleDrawer();
      } else if (action.type === 'close') {
        simsAudio.playBubbleClick();
        shell.closeAll();
      } else if (action.type === 'chat') {
        simsAudio.playBubbleClick();
        const currentSel = shell.getState().selected;
        if (!currentSel) {
          shell.select('chief');
        }
        shell.setTab('chat');
        setTimeout(() => {
          const el = document.querySelector('.sims-chat-textarea') as HTMLTextAreaElement | null;
          el?.focus();
        }, 60);
      } else if (action.type === 'chat_all') {
        simsAudio.playBubbleClick();
        shell.select('all');
        shell.setTab('chat');
        setTimeout(() => {
          const el = document.querySelector('.sims-chat-textarea') as HTMLTextAreaElement | null;
          el?.focus();
        }, 60);
      } else if (action.type === 'settings') {
        simsAudio.playBubbleClick();
        shell.toggleSettings();
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('kanban')) shell.toggleDrawer();
      const tp = sp.get('tab');
      if (tp === 'chat' || tp === 'cards' || tp === 'activity' || tp === 'agent') {
        shell.setTab(tp);
      }
    } catch {}
    return () => {
      offTopic?.();
      offFocus?.();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', handleFirstInteraction);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => shell.showToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div
      className="w-full h-full grid bg-bg"
      style={{
        gridTemplateColumns: selected ? 'minmax(0, 1fr) 420px' : 'minmax(0, 1fr)',
        gridTemplateRows: 'minmax(0, 1fr) 48px',
      }}
    >
      <div className="relative min-w-0 min-h-0">
        <div className="isolate h-full">
          <Suspense fallback={<div role="status" className="p-24">Memuat The Sims 2 Office…</div>}>
            {viewMode === 'sims' ? (
              <SimsOfficeView onSwitchClassic={() => shell.setViewMode('claude')} />
            ) : (
              <div className="relative w-full h-full">
                <button
                  onClick={() => shell.setViewMode('sims')}
                  className="absolute top-3 left-3 z-30 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-full text-xs font-semibold shadow-lg cursor-pointer"
                >
                  ← The Sims 2 Office
                </button>
                <ClaudeOfficeView />
              </div>
            )}
          </Suspense>
        </div>
        <KanbanDrawer />
        {!drawerOpen && (
          <button
            type="button"
            onClick={() => {
              simsAudio.playBubbleClick();
              shell.toggleDrawer();
            }}
            className="sims-floating-drawer-btn"
            title="Buka Papan Tugas Kanban (Shortcut: B)"
            aria-label="Buka Papan Tugas Kanban"
          >
            📋 Papan Kanban (B) ▲
          </button>
        )}
      </div>
      {selected && (
        <div className="min-h-0 border-l-2 border-sky-400/40 bg-slate-950">
          <Dock profile={selected} />
        </div>
      )}
      <div className="min-w-0" style={{ gridColumn: '1 / -1' }}>
        <Hud />
      </div>
      {toast && (
        <div role="status" className="fixed bottom-60 left-1/2 -translate-x-1/2 z-50 pixel-panel px-12 py-6 text-sm">
          {toast}
        </div>
      )}
      {settingsOpen && <SettingsDashboard />}
    </div>
  );
}
