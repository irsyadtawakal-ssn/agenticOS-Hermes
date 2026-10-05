import type {
  IApproval,
  IKanbanTask,
  IDailyCost,
  ICostSummary,
  IHealthComponent,
  IAgentState,
  IProfileSpec,
  ICreateProfileInput,
  IBackupResponse,
} from './types.ts';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export const getApprovals = (): Promise<IApproval[]> =>
  call<IApproval[]>('/v1/approvals?status=pending');

export const decide = (id: string, decision: 'approve' | 'deny', note?: string): Promise<IApproval> =>
  call<IApproval>(
    `/v1/approvals/${encodeURIComponent(id)}/decision`,
    post({ decision, ...(note ? { note } : {}), by: 'office' })
  );

export const getKanban = (): Promise<IKanbanTask[]> =>
  call<{ tasks: IKanbanTask[] }>('/v1/kanban').then((r) => r.tasks);

export const moveCard = (id: string, to: string, note: string): Promise<{ ok: true; output: string }> =>
  call<{ ok: true; output: string }>(`/v1/kanban/${encodeURIComponent(id)}/move`, post({ to, note }));

export const createCard = (input: {
  title: string;
  assignee: string;
  body: string;
}): Promise<{ ok: true; output: string; workspace: string }> =>
  call<{ ok: true; output: string; workspace: string }>('/v1/kanban', post(input));

export const getDailyCosts = (days: number): Promise<IDailyCost[]> =>
  call<IDailyCost[]>(`/v1/costs/daily?days=${days}`);

export const getCosts = (sinceMs: number): Promise<ICostSummary> =>
  call<ICostSummary>(`/v1/costs?since=${sinceMs}`);

export const getHealth = (): Promise<IHealthComponent[]> =>
  call<IHealthComponent[]>('/v1/health/components');

export const getEvents = (profile: string, limit = 50): Promise<Array<Record<string, unknown>>> =>
  call<Array<Record<string, unknown>>>(
    `/v1/events?profile=${encodeURIComponent(profile)}&limit=${limit}`
  );

export const getAgents = (): Promise<IAgentState[]> =>
  call<IAgentState[]>('/v1/agents');

export const triggerBackup = (): Promise<IBackupResponse> =>
  call<IBackupResponse>('/v1/backup', post({}));

export const getProfiles = (): Promise<IProfileSpec[]> =>
  call<IProfileSpec[]>('/v1/profiles');

export const createProfile = (input: ICreateProfileInput): Promise<{ ok: true; profile: IProfileSpec }> =>
  call<{ ok: true; profile: IProfileSpec }>('/v1/profiles', post(input));
