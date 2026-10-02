import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCoreConfig } from '../src/config.js';

const BASE_ENV = {
  AOS_HERMES_HOME: 'D:\\agentic-os\\hermes-home',
  AOS_BRIDGE_TOKEN: 'bt',
  AOS_UI_TOKEN: 'ut',
  AOS_APPROVER_TOKEN: 'at',
  APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
};

describe('loadCoreConfig', () => {
  it('derives paths and always binds to localhost', () => {
    const c = loadCoreConfig(BASE_ENV);
    expect(c.host).toBe('127.0.0.1');
    expect(c.port).toBe(7400);
    expect(c.kanbanDbPath).toBe(join('D:\\agentic-os\\hermes-home', 'kanban.db'));
    expect(c.dbPath).toBe(join('D:\\agentic-os\\hermes-home', '..', 'core', 'core.db'));
    expect(c.routerDbPath).toBe(join('C:\\Users\\me\\AppData\\Roaming', '9router', 'db', 'data.sqlite'));
  });

  it('maps router keys to profiles without exposing them elsewhere', () => {
    const c = loadCoreConfig({ ...BASE_ENV, AOS_ROUTER_KEY: 'shared-k', AOS_ROUTER_KEY_CHIEF: 'chief-k', AOS_CORE_PORT: '7411' });
    expect(c.port).toBe(7411);
    expect(c.routerKeyProfiles.get('chief-k')).toBe('chief');
    expect(c.routerKeyProfiles.get('shared-k')).toBe('shared');
  });

  it('requires the home and both tokens', () => {
    expect(() => loadCoreConfig({ ...BASE_ENV, AOS_BRIDGE_TOKEN: '' })).toThrow(/AOS_BRIDGE_TOKEN/);
    expect(() => loadCoreConfig({ ...BASE_ENV, AOS_UI_TOKEN: undefined })).toThrow(/AOS_UI_TOKEN/);
    expect(() => loadCoreConfig({ ...BASE_ENV, AOS_HERMES_HOME: '' })).toThrow(/AOS_HERMES_HOME/);
  });

  it('requires a distinct approver token and derives chief env and hermes exe', () => {
    const c = loadCoreConfig(BASE_ENV);
    expect(c.approverToken).toBe('at');
    expect(c.chiefEnvPath).toBe(join('D:\\agentic-os\\hermes-home', 'profiles', 'chief', '.env'));
    expect(c.hermesExe).toBe('hermes');
    expect(loadCoreConfig({ ...BASE_ENV, AOS_HERMES_EXE: ' C:\\h\\hermes.exe ' }).hermesExe).toBe('C:\\h\\hermes.exe');
    expect(() => loadCoreConfig({ ...BASE_ENV, AOS_APPROVER_TOKEN: '' })).toThrow(/AOS_APPROVER_TOKEN/);
    expect(() => loadCoreConfig({ ...BASE_ENV, AOS_APPROVER_TOKEN: 'bt' })).toThrow('AOS_APPROVER_TOKEN must differ from the bridge and UI tokens');
    expect(() => loadCoreConfig({ ...BASE_ENV, AOS_APPROVER_TOKEN: 'ut' })).toThrow('AOS_APPROVER_TOKEN must differ from the bridge and UI tokens');
  });

  it('rejects identical bridge and UI tokens', () => {
    expect(() => loadCoreConfig({ ...BASE_ENV, AOS_BRIDGE_TOKEN: 'same', AOS_UI_TOKEN: 'same' })).toThrow('AOS_BRIDGE_TOKEN and AOS_UI_TOKEN must differ');
  });

  it('derives office workspace settings with sensible defaults', () => {
    const c = loadCoreConfig({ ...BASE_ENV, USERPROFILE: 'C:\\Users\\me' });
    expect(c.timeZone).toBe('Asia/Jakarta');
    expect(c.workspacesRoot).toBe(join('D:\\agentic-os\\hermes-home', 'workspaces'));
    expect(c.gatewayLockDir).toBe(join('C:\\Users\\me', '.local', 'state', 'hermes', 'gateway-locks'));
    expect(c.routerBaseUrl).toBe('http://127.0.0.1:20128/v1');
    expect(c.servePort).toBeNull();
    const o = loadCoreConfig({ ...BASE_ENV, AOS_SERVE_PORT: '9129', AOS_ROUTER_URL: 'http://x:1/', AOS_TIMEZONE: 'UTC', HERMES_GATEWAY_LOCK_DIR: 'E:\\locks' });
    expect([o.servePort, o.routerBaseUrl, o.timeZone, o.gatewayLockDir]).toEqual([9129, 'http://x:1/v1', 'UTC', 'E:\\locks']);
  });
});
