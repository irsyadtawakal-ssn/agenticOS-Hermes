import { useEffect } from 'react';
import App from '../../vendor/pixel-agents/webview-ui/src/App.tsx';
import { agentIdFor, PROFILES } from '../hermes/labels.ts';
import { officeTransport } from '../hermes/transport.ts';
import { Dock } from './Dock.tsx';
import { Hud } from './Hud.tsx';
import { KanbanDrawer } from './KanbanDrawer.tsx';
import { keyAction } from './model.ts';
import { shell, useShell } from './store.ts';

export default function AosShell() {
  const selected = useShell((s) => s.selected);
  const toast = useShell((s) => s.toast);

  useEffect(() => {
    shell.refreshAll();
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
      } else if (action.type === 'approvals') shell.toggleApprovals();
      else if (action.type === 'kanban') shell.toggleDrawer();
      else if (action.type === 'close') shell.closeAll();
      else if (action.type === 'chat') {
        shell.select('chief');
        shell.setTab('chat');
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offTopic?.();
      offFocus?.();
      window.removeEventListener('keydown', onKey);
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
      style={{ gridTemplateColumns: selected ? 'minmax(0, 1fr) 380px' : 'minmax(0, 1fr)', gridTemplateRows: 'minmax(0, 1fr) 48px' }}
    >
      <div className="relative min-w-0 min-h-0">
        <div className="isolate h-full">
          <App />
        </div>
        <KanbanDrawer />
      </div>
      {selected && (
        <div className="min-h-0 border-l-2 border-border bg-bg-dark">
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
    </div>
  );
}
