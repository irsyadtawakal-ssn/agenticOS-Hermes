import { lazy, Suspense, useEffect } from 'react';
import { agentIdFor, PROFILES } from '../hermes/labels.ts';
import { officeTransport } from '../hermes/transport.ts';
import { simsAudio } from '../sims-office/SimsAudio.ts';
import { Dock } from './Dock.tsx';
import { TopBar } from './TopBar.tsx';
import { KanbanDrawer } from './KanbanDrawer.tsx';
import { ApprovalsPanel } from './ApprovalsPanel.tsx';
import { CostPanel } from './CostPanel.tsx';
import { SettingsDashboard } from './SettingsDashboard.tsx';
import { CharacterStudioModal } from './CharacterStudioModal.tsx';
import { keyAction } from './model.ts';
import { shell, useShell } from './store.ts';
import { requestNotificationPermission } from './notifications.ts';
import './sims-shell.css';

const SimsOfficeView = lazy(() =>
  import('../sims-office/SimsOfficeView.tsx').then((m) => ({ default: m.SimsOfficeView }))
);
const ClaudeOfficeView = lazy(() =>
  import('../claude-office/ClaudeOfficeView.tsx').then((m) => ({ default: m.ClaudeOfficeView }))
);

export default function AosShell() {
  const selected = useShell((s) => s.selected);
  const toast = useShell((s) => s.toast);
  const viewMode = useShell((s) => s.viewMode);
  const settingsOpen = useShell((s) => s.settingsOpen);
  const approvalsOpen = useShell((s) => s.approvalsOpen);
  const costsOpen = useShell((s) => s.costsOpen);
  const characterStudioOpen = useShell((s) => s.characterStudioOpen);
  const characterStudioProfile = useShell((s) => s.characterStudioProfile);

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
      const tp =
        sp.get('tab') ||
        (typeof localStorage !== 'undefined'
          ? localStorage.getItem('aos.settings.defaultDockTab')
          : null);
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
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* 1. Unified Sleek Top Command Bar */}
      <TopBar />

      {/* 2. Main Work Area: Full Canvas + Right Dock */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Full Viewport Canvas */}
        <div className="flex-1 relative min-w-0 min-h-0 bg-slate-950">
          <div className="isolate h-full w-full">
            <Suspense
              fallback={
                <div role="status" className="p-24 text-sky-300 font-semibold flex items-center gap-3">
                  <span className="animate-spin text-xl">💎</span>
                  <span>Memuat The Sims 2 Office…</span>
                </div>
              }
            >
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

          {/* Kanban Board Drawer */}
          <KanbanDrawer />
        </div>

        {/* Right Dock (Agent Profile / Chat / Cards / Simology) */}
        {selected && (
          <aside aria-label="Agent Detail Dock" className="w-[420px] shrink-0 min-h-0 border-l border-sky-400/30 bg-slate-950 z-20 shadow-2xl">
            <Dock profile={selected} />
          </aside>
        )}
      </div>

      {/* Floating Modals and Dialogs */}
      {approvalsOpen && <ApprovalsPanel />}
      {costsOpen && <CostPanel />}
      {settingsOpen && <SettingsDashboard />}
      {characterStudioOpen && (
        <CharacterStudioModal
          isOpen={characterStudioOpen}
          initialProfile={characterStudioProfile ?? selected ?? 'chief'}
          onClose={() => shell.closeCharacterStudio()}
        />
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div
          role="status"
          className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 pixel-panel px-6 py-2.5 text-sm bg-slate-900 border border-sky-400/60 shadow-xl rounded-lg text-sky-100 animate-bounce"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
