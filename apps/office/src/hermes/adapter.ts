import type { AgentSeatMeta, ServerMessage } from '../../vendor/pixel-agents/core/src/messages.ts';
import { activityLabel, agentIdFor, PROFILES, READING_TOOLS, SUBAGENT_TOOLS } from './labels.ts';

export interface CoreEvent {
  id: string;
  ts: number;
  type: string;
  profile: string;
  session_id?: string | null;
  task_id?: string | null;
  mode: string;
  payload: Record<string, unknown>;
}

export interface CoreApproval {
  id: string;
  profile: string;
  status: string;
  mode: string;
  tool: string;
  task_id: string | null;
}

export interface CoreAgentState {
  profile: string;
  state: string;
  task_id: string | null;
  detail: string | null;
  updated_at: number | null;
}

const ACTIVE_TOOL_STATES = new Set(['reading', 'typing', 'running']);

/** Translates OS Core events, approvals and agent state into Pixel Agents server messages. No I/O. */
export class HermesAdapter {
  private readonly pending = new Map<number, Set<string>>();
  private readonly nativeWaits = new Map<number, Set<string>>();

  capabilities(): ServerMessage {
    return { type: 'providerCapabilities', readingTools: READING_TOOLS, subagentToolNames: SUBAGENT_TOOLS };
  }

  private waiting(id: number): boolean {
    return (this.pending.get(id)?.size ?? 0) > 0 || (this.nativeWaits.get(id)?.size ?? 0) > 0;
  }

  snapshot(states: CoreAgentState[], approvals: CoreApproval[], seats: Record<string, AgentSeatMeta>): ServerMessage[] {
    const ids = PROFILES.map((_, i) => i + 1);
    const agentMeta: Record<string, AgentSeatMeta> = {};
    const folderNames: Record<string, string> = {};
    PROFILES.forEach((profile, i) => {
      folderNames[String(i + 1)] = profile;
      agentMeta[String(i + 1)] = { palette: i, hueShift: 0, ...seats[String(i + 1)] };
    });
    const out: ServerMessage[] = [{ type: 'existingAgents', agents: ids, agentMeta, folderNames, externalAgents: {} }];
    for (const s of states) {
      const id = agentIdFor(s.profile);
      if (id === null) continue;
      if (s.state === 'thinking') out.push({ type: 'agentStatus', id, status: 'active' });
      if (ACTIVE_TOOL_STATES.has(s.state) && s.detail) {
        out.push({ type: 'agentStatus', id, status: 'active' });
        out.push({ type: 'agentToolStart', id, toolId: `restore-${id}`, status: activityLabel(s.detail, ''), toolName: s.detail });
      }
    }
    this.pending.clear();
    for (const a of approvals) {
      const id = agentIdFor(a.profile);
      if (id === null || a.mode !== 'park' || a.status !== 'pending') continue;
      if (!this.pending.has(id)) this.pending.set(id, new Set());
      this.pending.get(id)!.add(a.id);
    }
    for (const id of this.pending.keys()) out.push({ type: 'agentToolPermission', id });
    return out;
  }

  onEvents(events: CoreEvent[]): ServerMessage[] {
    const out: ServerMessage[] = [];
    for (const ev of events) {
      const id = agentIdFor(ev.profile);
      if (id === null) continue;
      const p = ev.payload ?? {};
      switch (ev.type) {
        case 'llm.started':
          out.push({ type: 'agentStatus', id, status: 'active' });
          break;
        case 'tool.started': {
          const tool = typeof p.tool === 'string' ? p.tool : '?';
          const toolId = typeof p.tool_call_id === 'string' && p.tool_call_id ? p.tool_call_id : ev.id;
          const decision = (p.policy as { decision?: string } | undefined)?.decision;
          const gated = decision === 'park' || decision === 'native';
          out.push({ type: 'agentToolStart', id, toolId, status: activityLabel(tool, p.args_preview), toolName: tool, permissionActive: gated });
          if (decision === 'native') {
            if (!this.nativeWaits.has(id)) this.nativeWaits.set(id, new Set());
            this.nativeWaits.get(id)!.add(toolId);
          }
          if (gated) out.push({ type: 'agentToolPermission', id });
          break;
        }
        case 'tool.finished': {
          const toolId = typeof p.tool_call_id === 'string' && p.tool_call_id ? p.tool_call_id : ev.id;
          out.push({ type: 'agentToolDone', id, toolId });
          const waits = this.nativeWaits.get(id);
          if (waits?.delete(toolId) && !this.waiting(id)) out.push({ type: 'agentToolPermissionClear', id });
          break;
        }
        case 'session.ended':
          this.nativeWaits.delete(id);
          out.push({ type: 'agentToolsClear', id }, { type: 'agentStatus', id, status: 'waiting' });
          if (this.waiting(id)) out.push({ type: 'agentToolPermission', id });
          break;
        case 'breaker.tripped':
          out.push({ type: 'agentToolPermission', id });
          break;
        default:
          break;
      }
    }
    return out;
  }

  onApprovals(rows: CoreApproval[]): ServerMessage[] {
    const out: ServerMessage[] = [];
    for (const row of rows) {
      const id = agentIdFor(row.profile);
      if (id === null || row.mode !== 'park') continue;
      const before = this.waiting(id);
      const set = this.pending.get(id) ?? new Set<string>();
      if (row.status === 'pending') set.add(row.id);
      else set.delete(row.id);
      this.pending.set(id, set);
      const after = this.waiting(id);
      if (!before && after) out.push({ type: 'agentToolPermission', id });
      if (before && !after) out.push({ type: 'agentToolPermissionClear', id });
    }
    return out;
  }
}
