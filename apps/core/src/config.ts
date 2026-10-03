import { join } from 'node:path';
import officeRoster from '../../../infra/profiles/office-roster.json' with { type: 'json' };

export const PROFILES = officeRoster.map((p) => p.name);

export interface CoreConfig {
  host: '127.0.0.1';
  port: number;
  dbPath: string;
  bridgeToken: string;
  uiToken: string;
  approverToken: string;
  chiefEnvPath: string;
  hermesExe: string;
  hermesHome: string;
  kanbanDbPath: string;
  routerDbPath: string;
  routerKeyProfiles: Map<string, string>;
  timeZone: string;
  workspacesRoot: string;
  gatewayLockDir: string;
  routerBaseUrl: string;
  servePort: number | null;
  serveToken: string | null;
  serveLockDir: string;
  chatRoot: string;
}

function routerBase(raw: string | undefined): string {
  const url = (raw?.trim() || 'http://127.0.0.1:20128/v1').replace(/\/+$/, '');
  return url.endsWith('/v1') ? url : `${url}/v1`;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} (set it in .env.local)`);
  return value;
}

export function loadCoreConfig(env: NodeJS.ProcessEnv): CoreConfig {
  const hermesHome = required(env, 'AOS_HERMES_HOME');
  const routerKeyProfiles = new Map<string, string>();
  const shared = env.AOS_ROUTER_KEY?.trim();
  if (shared) routerKeyProfiles.set(shared, 'shared');
  for (const profile of PROFILES) {
    const key = env[`AOS_ROUTER_KEY_${profile.toUpperCase()}`]?.trim();
    if (key) routerKeyProfiles.set(key, profile);
  }
  const bridgeToken = required(env, 'AOS_BRIDGE_TOKEN');
  const uiToken = required(env, 'AOS_UI_TOKEN');
  if (bridgeToken === uiToken) throw new Error('AOS_BRIDGE_TOKEN and AOS_UI_TOKEN must differ');
  const approverToken = required(env, 'AOS_APPROVER_TOKEN');
  if (approverToken === bridgeToken || approverToken === uiToken) {
    throw new Error('AOS_APPROVER_TOKEN must differ from the bridge and UI tokens');
  }
  const serveToken = env.AOS_SERVE_TOKEN?.trim() || null;
  if (serveToken && [bridgeToken, uiToken, approverToken].includes(serveToken)) {
    throw new Error('AOS_SERVE_TOKEN must differ from the other Core tokens');
  }
  const workspacesRoot = env.AOS_WORKSPACES_ROOT?.trim() || join(hermesHome, 'workspaces');
  return {
    host: '127.0.0.1',
    port: Number(env.AOS_CORE_PORT ?? 7400),
    dbPath: env.AOS_CORE_DB?.trim() || join(hermesHome, '..', 'core', 'core.db'),
    bridgeToken,
    uiToken,
    approverToken,
    chiefEnvPath: join(hermesHome, 'profiles', 'chief', '.env'),
    hermesExe: env.AOS_HERMES_EXE?.trim() || 'hermes',
    hermesHome,
    kanbanDbPath: join(hermesHome, 'kanban.db'),
    routerDbPath: env.AOS_ROUTER_DB?.trim() || join(env.APPDATA ?? '', '9router', 'db', 'data.sqlite'),
    routerKeyProfiles,
    timeZone: env.AOS_TIMEZONE?.trim() || 'Asia/Jakarta',
    workspacesRoot,
    gatewayLockDir: env.HERMES_GATEWAY_LOCK_DIR?.trim() || join(env.USERPROFILE ?? '', '.local', 'state', 'hermes', 'gateway-locks'),
    routerBaseUrl: routerBase(env.AOS_ROUTER_URL),
    servePort: serveToken ? Number(env.AOS_SERVE_PORT?.trim() || 9129) : null,
    serveToken,
    serveLockDir: env.AOS_SERVE_LOCK_DIR?.trim() || join(hermesHome, '..', 'serve-locks'),
    chatRoot: join(workspacesRoot, 'chat'),
  };
}
