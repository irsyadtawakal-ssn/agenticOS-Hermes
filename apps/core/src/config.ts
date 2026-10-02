import { join } from 'node:path';

export const PROFILES = ['chief', 'researcher', 'secretary', 'content', 'dev'] as const;

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
    workspacesRoot: env.AOS_WORKSPACES_ROOT?.trim() || join(hermesHome, 'workspaces'),
    gatewayLockDir: env.HERMES_GATEWAY_LOCK_DIR?.trim() || join(env.USERPROFILE ?? '', '.local', 'state', 'hermes', 'gateway-locks'),
    routerBaseUrl: routerBase(env.AOS_ROUTER_URL),
    servePort: env.AOS_SERVE_PORT?.trim() ? Number(env.AOS_SERVE_PORT) : null,
  };
}
