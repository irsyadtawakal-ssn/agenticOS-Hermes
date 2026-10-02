import type { Db } from './db.js';

/** Stored Hermes session ids created from the office; only these may be listed or resumed there. */
export function rememberChatSession(db: Db, profile: string, storedId: string, now: number): void {
  db.prepare('INSERT OR IGNORE INTO chat_sessions (stored_id, profile, created_at) VALUES (?, ?, ?)').run(storedId, profile, now);
}

export function knownChatSessions(db: Db, profile: string): Set<string> {
  const rows = db.prepare('SELECT stored_id FROM chat_sessions WHERE profile = ?').all(profile) as Array<{ stored_id: string }>;
  return new Set(rows.map((r) => r.stored_id));
}
