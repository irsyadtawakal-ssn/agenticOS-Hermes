import { describe, expect, it } from 'vitest';
import { openCoreDb } from '../src/db.js';
import type { AosEvent } from '../src/events.js';
import { listAgentStates, nextState, projectState } from '../src/state.js';

function ev(type: AosEvent['type'], payload: Record<string, unknown>, ts = 1, profile = 'researcher'): AosEvent {
  return { id: `e${ts}${type}`, ts, type, profile, session_id: 's', task_id: 't_1', mode: 'kanban', payload };
}

describe('nextState', () => {
  it('maps events to the PRD animation states', () => {
    expect(nextState(ev('llm.started', { model: 'COMBO-SS' }))).toEqual({ state: 'thinking', detail: 'COMBO-SS' });
    expect(nextState(ev('tool.started', { tool: 'web_search', category: 'read' })).state).toBe('reading');
    expect(nextState(ev('tool.started', { tool: 'write_file', category: 'write' })).state).toBe('typing');
    expect(nextState(ev('tool.started', { tool: 'terminal', category: 'run' })).state).toBe('running');
    expect(nextState(ev('tool.started', { tool: 'x', category: 'other' })).state).toBe('thinking');
    expect(nextState(ev('tool.finished', { tool: 'terminal' })).state).toBe('thinking');
    expect(nextState(ev('llm.finished', {})).state).toBe('idle');
    expect(nextState(ev('session.started', {})).state).toBe('idle');
    expect(nextState(ev('session.ended', {})).state).toBe('idle');
  });
});

describe('projectState / listAgentStates', () => {
  it('keeps the newest state per profile and lists all profiles', () => {
    const db = openCoreDb(':memory:');
    projectState(db, ev('tool.started', { tool: 'terminal', category: 'run' }, 20));
    projectState(db, ev('llm.started', { model: 'm' }, 10));
    const states = listAgentStates(db);
    expect(states.map((s) => s.profile)).toEqual(['chief', 'researcher', 'secretary', 'content', 'dev']);
    expect(states[1]).toEqual({ profile: 'researcher', state: 'running', task_id: 't_1', session_id: 's', detail: 'terminal', updated_at: 20 });
    expect(states[0]).toEqual({ profile: 'chief', state: 'offline', task_id: null, session_id: null, detail: null, updated_at: null });
  });
});
