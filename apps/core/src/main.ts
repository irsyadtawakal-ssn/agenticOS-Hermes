import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadCoreConfig } from './config.js';
import { syncUsage } from './costs.js';
import { openCoreDb } from './db.js';
import { createHermesRunner } from './hermesCli.js';
import { createHub } from './hub.js';
import { diffTasks, readKanban, type KanbanSnapshot } from './kanban.js';
import { createNotifierFromFile } from './notify.js';
import { createReactions } from './reactions.js';
import { buildServer } from './server.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const envFile = join(repoRoot, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadCoreConfig(process.env);
const db = openCoreDb(config.dbPath);
const hub = createHub();
const log = (message: string) => console.error(`[aos-core] ${message}`);
const reactions = createReactions({
  db,
  hub,
  runHermes: createHermesRunner(config.hermesHome, config.hermesExe),
  notifier: createNotifierFromFile(config.chiefEnvPath),
  now: Date.now,
  log,
});
let snapshot: KanbanSnapshot = { tasks: [], runs: [] };

function safely(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    log(`${label} failed: ${(err as Error).message}`);
  }
}

function background(label: string, task: Promise<void>): void {
  task.catch((err: unknown) => log(`${label} failed: ${(err as Error).message}`));
}

function refreshKanban(): void {
  const next = readKanban(config.kanbanDbPath);
  const changes = diffTasks(snapshot.tasks, next.tasks);
  snapshot = next;
  if (changes.length > 0) hub.publish('kanban', changes);
  background('resume', reactions.resumeTick(snapshot.tasks));
}

function refreshCosts(): void {
  const stored = syncUsage(db, config.routerDbPath, config.routerKeyProfiles, snapshot.runs);
  if (stored > 0) hub.publish('costs', { stored });
}

safely('kanban', refreshKanban);
safely('costs', refreshCosts);
setInterval(() => safely('kanban', refreshKanban), 2_000);
setInterval(() => safely('costs', refreshCosts), 30_000);
setInterval(() => background('expire', reactions.expireTick()), 60_000);

const app = await buildServer({
  db,
  bridgeToken: config.bridgeToken,
  uiToken: config.uiToken,
  approverToken: config.approverToken,
  officeDir: join(repoRoot, 'apps/office/dist'),
  hub,
  kanban: () => snapshot,
  onEvents: (events) => background('events', reactions.onEvents(events)),
  onApprovalCreated: (approval) => reactions.onApprovalCreated(approval),
});
await app.listen({ host: config.host, port: config.port });
console.log(`[aos-core] listening on http://${config.host}:${config.port} (db ${config.dbPath})`);
