export interface IApproval {
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

export interface IKanbanTask {
  id: string;
  title: string;
  assignee: string | null;
  status: string;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  workspace_path: string | null;
}

export interface IDailyCost {
  day: string;
  cost_usd: number;
  calls: number;
}

export interface ICostTotals {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
}

export interface ICostSummary {
  since: number;
  until: number;
  total: ICostTotals;
  byProfile: Array<ICostTotals & { profile: string }>;
  byModel: Array<ICostTotals & { model: string | null }>;
  byTask: Array<ICostTotals & { task_id: string }>;
}

export interface IHealthComponent {
  id: string;
  label: string;
  status: 'ok' | 'down' | 'absent';
  detail: string;
}

export interface IAgentState {
  profile: string;
  state: string;
  task_id: string | null;
  detail: string | null;
  updated_at: number | null;
}

export interface IProfileSpec {
  name: string;
  description: string;
  tier: 'os-brain' | 'os-worker' | 'os-private';
  docker_network?: boolean;
  egress_proxy?: boolean;
  gateway?: boolean;
}

export interface ICreateProfileInput {
  name: string;
  description: string;
  tier: 'os-brain' | 'os-worker' | 'os-private';
  docker_network?: boolean;
  egress_proxy?: boolean;
  soul?: string;
}

export interface IBackupResponse {
  path?: string;
  bytes?: number;
  timestamp?: number;
  files?: string[];
}
