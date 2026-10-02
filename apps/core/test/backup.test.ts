import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { backupDue, includeInBackup, latestBackupMs, pruneBackups, runBackup } from '../src/backup.js';
import { openCoreDb } from '../src/db.js';

describe('includeInBackup', () => {
  it('keeps state and drops runtime, caches, secrets and locks', () => {
    const keep = ['config.yaml', 'kanban.db', 'profiles', 'profiles/chief/SOUL.md', 'profiles/chief/cron/jobs.json', 'workspaces/x/notes.md', 'skills/a/SKILL.md'];
    const drop = [
      'tools', 'installs', 'cache', 'sandboxes', 'logs', 'backups', '.env', '.env.bak-1', 'profiles/chief/.env', 'kanban.db-wal', 'state.db-shm', 'gateway.lock', 'gateway.pid',
      'profiles/chief/cache', 'profiles/chief/sandboxes', 'profiles/chief/plugins/os-bridge/spool', 'skills/a/__pycache__',
      'workspaces/_archive/x/D:', 'workspaces/odd:name.md', 'workspaces/_archive/y/D',
    ];
    for (const p of keep) expect([p, includeInBackup(p, !p.includes('.'))]).toEqual([p, true]);
    for (const p of drop) expect([p, includeInBackup(p, !p.includes('.') || p.endsWith('spool'))]).toEqual([p, false]);
  });
});

describe('backupDue', () => {
  const tz = 'Asia/Jakarta';
  it('runs at 23:30 local once a day, or when the last backup is over 26 hours old', () => {
    const at = (iso: string) => Date.parse(iso);
    expect(backupDue(null, at('2026-10-02T03:00:00Z'), tz)).toBe(true);
    expect(backupDue(at('2026-10-01T16:30:00Z'), at('2026-10-02T03:00:00Z'), tz)).toBe(false);
    expect(backupDue(at('2026-10-01T16:30:00Z'), at('2026-10-02T16:31:00Z'), tz)).toBe(true);
    expect(backupDue(at('2026-10-02T16:31:00Z'), at('2026-10-02T16:45:00Z'), tz)).toBe(false);
    expect(backupDue(at('2026-09-30T10:00:00Z'), at('2026-10-02T03:00:00Z'), tz)).toBe(true);
  });
});

describe('runBackup', () => {
  it('snapshots databases consistently, copies kept files and skips the rest', async () => {
    const home = mkdtempSync(join(tmpdir(), 'aos-bk-home-'));
    const backupsDir = mkdtempSync(join(tmpdir(), 'aos-bk-out-'));
    writeFileSync(join(home, 'config.yaml'), 'a: 1\n');
    writeFileSync(join(home, '.env'), 'SECRET=1\n');
    mkdirSync(join(home, 'cache'), { recursive: true });
    writeFileSync(join(home, 'cache', 'big.bin'), 'x');
    mkdirSync(join(home, 'profiles', 'chief'), { recursive: true });
    const live = new Database(join(home, 'profiles', 'chief', 'state.db'));
    live.pragma('journal_mode = WAL');
    live.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('ok')");
    const zipped: string[] = [];
    const result = await runBackup({
      hermesHome: home,
      backupsDir,
      coreDb: openCoreDb(join(mkdtempSync(join(tmpdir(), 'aos-bk-core-')), 'core.db')),
      now: Date.parse('2026-10-02T16:30:00Z'),
      timeZone: 'Asia/Jakarta',
      zip: async (staging, zipFile) => {
        zipped.push(zipFile);
        expect(existsSync(join(staging, 'hermes-home', 'config.yaml'))).toBe(true);
        expect(existsSync(join(staging, 'hermes-home', '.env'))).toBe(false);
        expect(existsSync(join(staging, 'hermes-home', 'cache'))).toBe(false);
        expect(existsSync(join(staging, 'core', 'core.db'))).toBe(true);
        const copy = new Database(join(staging, 'hermes-home', 'profiles', 'chief', 'state.db'), { readonly: true });
        expect(copy.prepare('SELECT v FROM t').get()).toEqual({ v: 'ok' });
        copy.close();
        writeFileSync(zipFile, 'zip');
      },
    });
    live.close();
    expect(result.file).toBe(join(backupsDir, 'aos-backup-20261002-233000.zip'));
    expect(result.failed).toEqual([]);
    expect(result.files).toBe(3);
    expect(zipped).toEqual([result.file]);
    expect(readdirSync(backupsDir)).toEqual(['aos-backup-20261002-233000.zip']);
  });
});

describe('pruneBackups / latestBackupMs', () => {
  it('keeps the newest backups only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-bk-prune-'));
    for (let d = 1; d <= 16; d++) {
      const f = join(dir, `aos-backup-202609${String(d).padStart(2, '0')}-233000.zip`);
      writeFileSync(f, 'z');
      utimesSync(f, new Date(2026, 8, d), new Date(2026, 8, d));
    }
    writeFileSync(join(dir, 'other.txt'), 'keep');
    expect(pruneBackups(dir, 14)).toEqual(['aos-backup-20260901-233000.zip', 'aos-backup-20260902-233000.zip']);
    expect(readdirSync(dir)).toHaveLength(15);
    expect(latestBackupMs(dir)).toBe(new Date(2026, 8, 16).getTime());
    expect(latestBackupMs(mkdtempSync(join(tmpdir(), 'aos-bk-empty-')))).toBeNull();
  });
});
