import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrate, openCoreDb } from '../src/db.js';

describe('openCoreDb', () => {
  it('creates the folder and all tables, idempotently', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'aos-core-')), 'nested', 'core.db');
    const db = openCoreDb(path);
    migrate(db);
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['agent_state', 'approvals', 'cursors', 'events', 'llm_usage']));
    db.close();
  });
});
