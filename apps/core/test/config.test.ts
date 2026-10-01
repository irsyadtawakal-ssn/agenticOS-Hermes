import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCoreConfig } from '../src/config.js';

const BASE_ENV = {
  AOS_HERMES_HOME: 'D:\agentic-os\hermes-home',
  AOS_BRIDGE_TOKEN: 'bt',
  AOS_UI_TOKEN: 'ut',
  APPDATA: 'C:\Users\me\AppData\Roaming',
};

describe('loadCoreConfig', () => {
  it('derives paths and always binds to localhost', () => {
    const c = loadCoreConfig(BASE_ENV);
    expect(c.host).toBe('127.0.0.1');
    expect(c.port).toBe(7400);
    expect(c.kanbanDbPath).toBe(join('D:\agentic-os\hermes-home', 'kanban.db'));
    expect(c.dbPath).toBe(join('D:\agentic-os\hermes-home', '..', 'core', 'core.db'));
    expect(c.routerDbPath).toBe(join('C:\Users\me\AppData\Roaming', '9router', 'db', 'data.sqlite'));
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
});
