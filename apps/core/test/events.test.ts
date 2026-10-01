import { describe, expect, it } from 'vitest';
import { openCoreDb } from '../src/db.js';
import { ingestEvents } from '../src/events.js';
import { listAgentStates } from '../src/state.js';

const good = {
  id: 'a'.repeat(32),
  ts: 1790000000000,
  type: 'tool.started',
  profile: 'researcher',
  session_id: 's1',
  task_id: 't_1',
  mode: 'kanban',
  payload: { tool: 'web_search', category: 'read', args_preview: '{}' },
};

describe('ingestEvents', () => {
  it('stores valid events once and projects state', () => {
    const db = openCoreDb(':memory:');
    const first = ingestEvents(db, [good, { ...good, id: 'b'.repeat(32), type: 'nope' }]);
    expect(first).toMatchObject({ inserted: 1, duplicates: 0, rejected: 1 });
    expect(first.accepted.map((e) => e.id)).toEqual([good.id]);
    const again = ingestEvents(db, [good]);
    expect(again).toMatchObject({ inserted: 0, duplicates: 1, rejected: 0, accepted: [] });
    const row = db.prepare('SELECT payload FROM events WHERE id = ?').get(good.id) as { payload: string };
    expect(JSON.parse(row.payload)).toEqual(good.payload);
    expect(listAgentStates(db)[1].state).toBe('reading');
  });

  it('accepts null session/task ids and rejects non-arrays or huge batches', () => {
    const db = openCoreDb(':memory:');
    expect(ingestEvents(db, [{ ...good, id: 'c'.repeat(32), session_id: null, task_id: null }]).inserted).toBe(1);
    expect(() => ingestEvents(db, { not: 'array' })).toThrow(/array/);
    expect(() => ingestEvents(db, new Array(501).fill(good))).toThrow(/500/);
  });
});
