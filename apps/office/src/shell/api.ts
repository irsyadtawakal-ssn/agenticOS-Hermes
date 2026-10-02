export interface Approval {
  id: string;
  created_at: number;
  profile: string;
  task_id: string | null;
  mode: string;
  rule_id: string;
  tool: string;
  args_preview: string;
  reason: string | null;
  status: string;
}

export interface KanbanTask {
  id: string;
  title: string;
  assignee: string | null;
  status: string;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  workspace_path: string | null;
}

export interface DailyCost {
  day: string;
  cost_usd: number;
  calls: number;
}

export interface CostTotals {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
}

export interface CostSummary {
  since: number;
  until: number;
  total: CostTotals;
  byProfile: Array<CostTotals & { profile: string }>;
  byModel: Array<CostTotals & { model: string | null }>;
  byTask: Array<CostTotals & { task_id: string }>;
}

export interface HealthComponent {
  id: string;
  label: string;
  status: 'ok' | 'down' | 'absent';
  detail: string;
}

export interface AgentState {
  profile: string;
  state: string;
  task_id: string | null;
  detail: string | null;
  updated_at: number | null;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const getApprovals = () => call<Approval[]>('/v1/approvals?status=pending');
export const decide = (id: string, decision: 'approve' | 'deny', note?: string) =>
  call<Approval>(`/v1/approvals/${encodeURIComponent(id)}/decision`, post({ decision, ...(note ? { note } : {}), by: 'office' }));
export const getKanban = () => call<{ tasks: KanbanTask[] }>('/v1/kanban').then((r) => r.tasks);
export const moveCard = (id: string, to: string, note: string) =>
  call<{ ok: true; output: string }>(`/v1/kanban/${encodeURIComponent(id)}/move`, post({ to, note }));
export const createCard = (input: { title: string; assignee: string; body: string }) =>
  call<{ ok: true; output: string; workspace: string }>('/v1/kanban', post(input));
export const getDailyCosts = (days: number) => call<DailyCost[]>(`/v1/costs/daily?days=${days}`);
export const getCosts = (sinceMs: number) => call<CostSummary>(`/v1/costs?since=${sinceMs}`);
export const getHealth = () => call<HealthComponent[]>('/v1/health/components');
export const getEvents = (profile: string, limit = 50) =>
  call<Array<Record<string, unknown>>>(`/v1/events?profile=${encodeURIComponent(profile)}&limit=${limit}`);
export const getAgents = () => call<AgentState[]>('/v1/agents');
