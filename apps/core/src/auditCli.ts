import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { auditRiskyActions } from './audit.js';
import { loadCoreConfig } from './config.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const envFile = join(repoRoot, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const since = process.argv[2] ? Date.parse(process.argv[2]) : 0;
if (Number.isNaN(since)) {
  console.error('Usage: pnpm -F @aos/core risk-audit [ISO-8601 since]');
  process.exit(2);
}
const config = loadCoreConfig(process.env);
const db = new Database(config.dbPath, { readonly: true, fileMustExist: true });
const result = auditRiskyActions(db, since);
console.log(JSON.stringify(result, null, 2));
process.exit(result.violations.length === 0 ? 0 : 1);
