import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { applyProfiles, profileDir } from '../src/apply.js';
import type { Exec } from '../src/exec.js';
import { loadRoster } from '../src/profiles.js';

const BASE = 'http://127.0.0.1:20128/v1';

function setup() {
  const home = mkdtempSync(join(tmpdir(), 'aos-home-'));
  const templatesDir = mkdtempSync(join(tmpdir(), 'aos-soul-'));
  writeFileSync(join(templatesDir, '_common.md'), 'COMMON\n');
  writeFileSync(join(templatesDir, 'chief.md'), 'CHIEF\n');
  const roster = loadRoster('profiles:\n  - {name: chief, description: Boss, tier: os-brain, gateway: true}\n');
  const calls: string[][] = [];
  const exec: Exec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const dir = profileDir(home, args[2]);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.yaml'), 'model:\n  default: something\nagent:\n  max_turns: 50\n');
    return { code: 0, stdout: '', stderr: '' };
  };
  const opts = { home, roster, templatesDir, routerBaseUrl: BASE, routerKey: 'rk-123', timezone: 'Asia/Jakarta', exec, stamp: '20260930' };
  return { home, calls, opts };
}

describe('applyProfiles', () => {
  it('creates a missing profile via the hermes CLI and writes config, env and SOUL.md', async () => {
    const { home, calls, opts } = setup();
    const log = await applyProfiles(opts);

    expect(calls).toEqual([['hermes', 'profile', 'create', 'chief', '--description', 'Boss']]);
    const dir = profileDir(home, 'chief');
    const cfg = YAML.parse(readFileSync(join(dir, 'config.yaml'), 'utf8'));
    expect(cfg.agent).toEqual({ max_turns: 50 });
    expect(cfg.model).toEqual({ default: 'os-brain', provider: 'custom', base_url: BASE, key_env: 'OPENAI_API_KEY' });
    expect(cfg.kanban).toEqual({ dispatch_in_gateway: false });
    expect(existsSync(join(dir, 'config.yaml.bak-20260930'))).toBe(true);
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('OPENAI_API_KEY=rk-123\nHERMES_TIMEZONE=Asia/Jakarta\n');
    expect(readFileSync(join(dir, 'SOUL.md'), 'utf8')).toBe('CHIEF\n\nCOMMON\n');
    expect(log).toEqual(['created profile chief', 'configured profile chief (tier os-brain)', 'configured root (dispatcher + cron)']);
    const root = YAML.parse(readFileSync(join(home, 'config.yaml'), 'utf8'));
    expect(root.kanban.dispatch_in_gateway).toBe(true);
    expect(root.cron).toEqual({ catch_up_missed: true });
    expect(readFileSync(join(home, '.env'), 'utf8')).toBe('OPENAI_API_KEY=rk-123\nHERMES_TIMEZONE=Asia/Jakarta\n');
  });

  it('reuses an existing profile and keeps unrelated env keys', async () => {
    const { home, calls, opts } = setup();
    const dir = profileDir(home, 'chief');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '.env'), 'TELEGRAM_BOT_TOKEN=tg\nOPENAI_API_KEY=old\n');
    writeFileSync(join(dir, 'SOUL.md'), 'OLD\n');

    await applyProfiles(opts);

    expect(calls).toEqual([]);
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('TELEGRAM_BOT_TOKEN=tg\nOPENAI_API_KEY=rk-123\nHERMES_TIMEZONE=Asia/Jakarta\n');
    expect(existsSync(join(dir, '.env.bak-20260930'))).toBe(true);
    expect(readFileSync(join(dir, 'SOUL.md.bak-20260930'), 'utf8')).toBe('OLD\n');
  });

  it('writes the mapped model name when tierModels is given', async () => {
    const { home, opts } = setup();
    await applyProfiles({ ...opts, tierModels: { 'os-brain': 'COMBO-SS', 'os-worker': 'COMBO-SS', 'os-private': 'COMBO-SS' } });
    const cfg = YAML.parse(readFileSync(join(profileDir(home, 'chief'), 'config.yaml'), 'utf8'));
    expect(cfg.model.default).toBe('COMBO-SS');
  });

  it('throws when hermes profile create fails', async () => {
    const { opts } = setup();
    const failing: Exec = async () => ({ code: 1, stdout: '', stderr: 'boom' });
    await expect(applyProfiles({ ...opts, exec: failing })).rejects.toThrow(/hermes profile create chief failed: boom/);
  });
});
