import { useSyncExternalStore } from 'react';
import * as api from './api.ts';
import { type ActivityLog, applyKanbanChanges, type CoreEventLike, pushActivity } from './model.ts';

export type DockTab = 'chat' | 'cards' | 'activity' | 'agent';

export interface ShellState {
  selected: string | null;
  dockTab: DockTab;
  drawerOpen: boolean;
  approvalsOpen: boolean;
  costsOpen: boolean;
  approvals: api.Approval[];
  tasks: api.KanbanTask[];
  daily: api.DailyCost[];
  costs: api.CostSummary | null;
  health: api.HealthComponent[];
  activity: ActivityLog;
  agents: api.AgentState[];
  toast: string | null;
}

let state: ShellState = {
  selected: null,
  dockTab: 'cards',
  drawerOpen: false,
  approvalsOpen: false,
  costsOpen: false,
  approvals: [],
  tasks: [],
  daily: [],
  costs: null,
  health: [],
  activity: {},
  agents: [],
  toast: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<ShellState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

async function guard(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    set({ toast: (err as Error).message });
  }
}

const refreshKanban = () => guard(async () => set({ tasks: await api.getKanban() }));
const refreshApprovals = () => guard(async () => set({ approvals: await api.getApprovals() }));
const refreshCosts = () => guard(async () => set({ daily: await api.getDailyCosts(7), costs: await api.getCosts(startOfToday()) }));

export const shell = {
  getState: () => state,
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  select(profile: string | null): void {
    set({ selected: profile });
    if (!profile) return;
    void guard(async () => {
      const events = (await api.getEvents(profile, 50)) as unknown as CoreEventLike[];
      const loaded = pushActivity({}, events.slice().reverse())[profile] ?? [];
      set({ activity: { ...state.activity, [profile]: loaded } });
    });
  },
  setTab: (dockTab: DockTab) => set({ dockTab }),
  toggleDrawer: () => set({ drawerOpen: !state.drawerOpen }),
  toggleApprovals: () => set({ approvalsOpen: !state.approvalsOpen, costsOpen: false }),
  toggleCosts: () => set({ costsOpen: !state.costsOpen, approvalsOpen: false }),
  closeAll: () => set({ selected: null, drawerOpen: false, approvalsOpen: false, costsOpen: false }),
  showToast: (toast: string | null) => set({ toast }),
  refreshKanban,
  refreshApprovals,
  refreshCosts,
  refreshAll(): void {
    void refreshKanban();
    void refreshApprovals();
    void refreshCosts();
    void guard(async () => set({ health: await api.getHealth(), agents: await api.getAgents() }));
  },
  onTopic(topic: string, data: unknown): void {
    if (topic === 'events' && Array.isArray(data)) set({ activity: pushActivity(state.activity, data as CoreEventLike[]) });
    if (topic === 'approvals') void refreshApprovals();
    if (topic === 'kanban' && Array.isArray(data) && applyKanbanChanges(data) === 'refetch') void refreshKanban();
    if (topic === 'costs') void refreshCosts();
    if (topic === 'health' && Array.isArray(data)) set({ health: data as api.HealthComponent[] });
    if (topic === 'agents' && Array.isArray(data)) set({ agents: data as api.AgentState[] });
  },
};

/** Select one stable slice of the shell state (return a state property, not a new object). */
export function useShell<T>(selector: (s: ShellState) => T): T {
  return useSyncExternalStore(shell.subscribe, () => selector(state));
}
