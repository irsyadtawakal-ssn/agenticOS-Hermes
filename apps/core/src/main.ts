import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadCoreConfig } from './config.js';
import { syncUsage } from './costs.js';
import { openCoreDb } from './db.js';
import { type HealthDeps, probeHealth } from './health.js';
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
const runHermes = createHermesRunner(config.hermesHome, config.hermesExe);
const reactions = createReactions({
  db,
  hub,
  runHermes,
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

const healthDeps: HealthDeps = {
  readFile: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
  pidAlive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
  fetchFn: fetch,
  runDocker: () =>
    new Promise((done) => {
      execFile('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 5000, windowsHide: true }, (err, stdout) =>
        done({ code: err ? 1 : 0, stdout: String(stdout ?? '') }),
      );
    }),
  hermesHome: config.hermesHome,
  lockDir: config.gatewayLockDir,
  routerBaseUrl: config.routerBaseUrl,
  servePort: config.servePort,
};

let lastHealth = '';
async function refreshHealth(): Promise<void> {
  const components = await probeHealth(healthDeps);
  const key = JSON.stringify(components);
  if (key !== lastHealth) {
    lastHealth = key;
    hub.publish('health', components);
  }
}

safely('kanban', refreshKanban);
safely('costs', refreshCosts);
background('health', refreshHealth());
setInterval(() => safely('kanban', refreshKanban), 2_000);
setInterval(() => safely('costs', refreshCosts), 30_000);
setInterval(() => background('expire', reactions.expireTick()), 60_000);
setInterval(() => background('health', refreshHealth()), 30_000);

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
  probeHealth: () => probeHealth(healthDeps),
  timeZone: config.timeZone,
  runHermes,
  workspacesRoot: config.workspacesRoot,
});
await app.listen({ host: config.host, port: config.port });
console.log(`[aos-core] listening on http://${config.host}:${config.port} (db ${config.dbPath})`);
