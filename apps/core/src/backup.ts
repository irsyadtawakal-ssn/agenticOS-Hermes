import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { Db } from './db.js';
import { localStamp } from './kanbanActions.js';

/** Daily backup of Agentic OS state (PRD §9): HERMES_HOME without runtime/caches/secrets + core.db. */
const ROOT_SKIP = new Set(['cache', 'installs', 'tools', 'sandboxes', 'audio_cache', 'image_cache', 'logs', 'source-checks', 'plugin-update-checks', 'backups', 'bin']);
const PROFILE_SKIP = new Set(['cache', 'sandboxes', 'logs', 'audio_cache', 'image_cache']);
const ANY_SKIP = new Set(['__pycache__', 'node_modules', 'spool']);
const BACKUP_FILE = /^aos-backup-\d{8}-\d{6}\.zip$/;

export interface BackupResult {
  file: string;
  files: number;
  failed: string[];
}

export function includeInBackup(rel: string, isDir: boolean): boolean {
  const parts = rel.split(/[\\/]/).filter(Boolean);
  if (parts.some((p) => ANY_SKIP.has(p))) return false;
  if (parts.length >= 1 && ROOT_SKIP.has(parts[0])) return false;
  if (parts[0] === 'profiles' && parts.length >= 3 && PROFILE_SKIP.has(parts[2])) return false;
  if (isDir) return true;
  const name = parts[parts.length - 1] ?? '';
  return !(name.startsWith('.env') || /\.(lock|pid)$/.test(name) || /-(wal|shm)$/.test(name));
}

function localParts(ms: number, timeZone: string): { date: string; time: string } {
  const stamp = localStamp(ms, timeZone);
  return { date: stamp.slice(0, 8), time: stamp.slice(9, 13) };
}

export function backupDue(lastMs: number | null, now: number, timeZone: string): boolean {
  if (lastMs === null) return true;
  const today = localParts(now, timeZone);
  if (localParts(lastMs, timeZone).date === today.date) return false;
  return today.time >= '2330' || now - lastMs > 26 * 60 * 60 * 1000;
}

export function latestBackupMs(backupsDir: string): number | null {
  if (!existsSync(backupsDir)) return null;
  const times = readdirSync(backupsDir)
    .filter((f) => BACKUP_FILE.test(f))
    .map((f) => statSync(join(backupsDir, f)).mtimeMs);
  return times.length > 0 ? Math.max(...times) : null;
}

export function pruneBackups(backupsDir: string, keep = 14): string[] {
  const files = readdirSync(backupsDir)
    .filter((f) => BACKUP_FILE.test(f))
    .sort();
  const removed = files.slice(0, Math.max(0, files.length - keep));
  for (const f of removed) rmSync(join(backupsDir, f));
  return removed;
}

async function copyTree(src: string, dest: string, rel: string, result: { files: number; failed: string[] }): Promise<void> {
  for (const entry of readdirSync(join(src, rel), { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (!includeInBackup(childRel, entry.isDirectory())) continue;
    if (entry.isDirectory()) {
      await copyTree(src, dest, childRel, result);
      continue;
    }
    if (!entry.isFile()) continue;
    const from = join(src, childRel);
    const to = join(dest, childRel);
    mkdirSync(join(to, '..'), { recursive: true });
    try {
      if (entry.name.endsWith('.db')) {
        const db = new Database(from, { readonly: true, fileMustExist: true });
        try {
          await db.backup(to);
        } finally {
          db.close();
        }
      } else {
        copyFileSync(from, to);
      }
      result.files += 1;
    } catch {
      result.failed.push(childRel);
    }
  }
}

export async function runBackup(o: {
  hermesHome: string;
  backupsDir: string;
  coreDb: Db;
  now: number;
  timeZone: string;
  zip(stagingDir: string, zipFile: string): Promise<void>;
}): Promise<BackupResult> {
  const stamp = localStamp(o.now, o.timeZone);
  mkdirSync(o.backupsDir, { recursive: true });
  const staging = join(o.backupsDir, `.staging-${stamp}`);
  rmSync(staging, { recursive: true, force: true });
  const result = { files: 0, failed: [] as string[] };
  try {
    await copyTree(o.hermesHome, join(staging, 'hermes-home'), '', result);
    mkdirSync(join(staging, 'core'), { recursive: true });
    await o.coreDb.backup(join(staging, 'core', 'core.db'));
    result.files += 1;
    const file = join(o.backupsDir, `aos-backup-${stamp}.zip`);
    await o.zip(staging, file);
    pruneBackups(o.backupsDir);
    return { file, ...result };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
