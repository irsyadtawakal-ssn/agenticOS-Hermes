import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { applyProfiles, buildPolicy, pluginFiles, profileDir } from '../src/apply.js';
import type { Exec } from '../src/exec.js';
import { loadRoster } from '../src/profiles.js';

const BASE = 'http://127.0.0.1:20128/v1';

function pluginSources(): Record<string, string> {
  const root = mkdtempSync(join(tmpdir(), 'aos-plugsrc-'));
  for (const name of ['os-bridge', 'aos-office-tools']) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, 'plugin.yaml'), `name: ${name}\n`);
    writeFileSync(join(root, name, '__init__.py'), `# ${name}\n`);
    mkdirSync(join(root, name, '__pycache__'), { recursive: true });
  }
  writeFileSync(join(root, 'os-bridge', 'policy.py'), '# policy\n');
  writeFileSync(join(root, 'os-bridge', 'notes.txt'), 'not code\n');
  return { 'os-bridge': join(root, 'os-bridge'), 'aos-office-tools': join(root, 'aos-office-tools') };
}

function setup() {
  const home = mkdtempSync(join(tmpdir(), 'aos-home-'));
  const templatesDir = mkdtempSync(join(tmpdir(), 'aos-soul-'));
  writeFileSync(join(templatesDir, '_common.md'), 'COMMON\n');
  writeFileSync(join(templatesDir, 'chief.md'), 'CHIEF\n');
  const roster = loadRoster('profiles:\n  - {name: chief, description: Boss, tier: os-brain, gateway: true}\n');
  const calls: string[][] = [];
  const exec: Exec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (args[0] === 'profile') {
      const dir = profileDir(home, args[2]);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'config.yaml'), 'model:\n  default: something\nagent:\n  max_turns: 50\n');
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const opts = { home, roster, templatesDir, routerBaseUrl: BASE, routerKey: 'rk-123', timezone: 'Asia/Jakarta', exec, stamp: '20260930' };
  return { home, calls, opts };
}

describe('applyProfiles', () => {
  it('creates a missing profile via the hermes CLI and writes config, env and SOUL.md', async () => {
    const { home, calls, opts } = setup();
    const log = await applyProfiles(opts);

    expect(calls[0]).toEqual(['hermes', 'profile', 'create', 'chief', '--description', 'Boss']);
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

  it('installs and enables plugins, writes bridge config and per-profile keys', async () => {
    const { home, calls, opts } = setup();
    await applyProfiles({
      ...opts,
      routerKeys: { chief: 'rk-chief' },
      pluginSources: pluginSources(),
      bridge: { coreUrl: 'http://127.0.0.1:7400', token: 'bt' },
    });
    const dir = profileDir(home, 'chief');
    expect(readFileSync(join(dir, '.env'), 'utf8')).toContain('OPENAI_API_KEY=rk-chief\n');
    expect(readFileSync(join(dir, 'plugins', 'os-bridge', '__init__.py'), 'utf8')).toBe('# os-bridge\n');
    expect(existsSync(join(dir, 'plugins', 'os-bridge', '__pycache__'))).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, 'plugins', 'os-bridge', 'config.json'), 'utf8'))).toEqual({ core_url: 'http://127.0.0.1:7400', token: 'bt' });
    expect(existsSync(join(dir, 'plugins', 'aos-office-tools', 'plugin.yaml'))).toBe(true);
    expect(calls).toContainEqual(['hermes', '-p', 'chief', 'plugins', 'enable', 'os-bridge']);
    expect(calls).toContainEqual(['hermes', '-p', 'chief', 'plugins', 'enable', 'aos-office-tools']);
  });

  it('throws when enabling a plugin fails', async () => {
    const { opts } = setup();
    const exec: Exec = async (cmd, args) => (args.includes('enable') ? { code: 1, stdout: '', stderr: 'nope' } : opts.exec(cmd, args));
    await expect(
      applyProfiles({ ...opts, exec, pluginSources: pluginSources(), bridge: { coreUrl: 'u', token: 't' } }),
    ).rejects.toThrow(/plugins enable os-bridge failed: nope/);
  });

  it('copies cron scripts for profiles that have them', async () => {
    const { home, opts } = setup();
    const scriptsRoot = mkdtempSync(join(tmpdir(), 'aos-scripts-'));
    mkdirSync(join(scriptsRoot, 'chief'), { recursive: true });
    writeFileSync(join(scriptsRoot, 'chief', 'briefing_context.py'), '# briefing\n');
    writeFileSync(join(scriptsRoot, 'chief', 'notes.txt'), 'not a script\n');
    const log = await applyProfiles({ ...opts, scriptsRoot });
    const target = join(profileDir(home, 'chief'), 'scripts');
    expect(readFileSync(join(target, 'briefing_context.py'), 'utf8')).toBe('# briefing\n');
    expect(existsSync(join(target, 'notes.txt'))).toBe(false);
    expect(log).toContain('installed cron scripts briefing_context.py for chief');
  });

  it('copies plugin code, writes the policy with the workspaces root and the chief approver config', async () => {
    const { home, opts } = setup();
    const template = JSON.stringify({ version: 1, default: 'allow', workspaces_root: '', rules: [{ id: 'x', action: 'deny', match: {} }] });
    await applyProfiles({ ...opts, pluginSources: pluginSources(), policyTemplate: template, approver: { coreUrl: 'http://127.0.0.1:7400', token: 'appr' } });
    const bridge = join(profileDir(home, 'chief'), 'plugins', 'os-bridge');
    expect(readFileSync(join(bridge, 'policy.py'), 'utf8')).toBe('# policy\n');
    expect(existsSync(join(bridge, 'notes.txt'))).toBe(false);
    expect(existsSync(join(bridge, '__pycache__'))).toBe(false);
    const policy = JSON.parse(readFileSync(join(bridge, 'policy.json'), 'utf8'));
    expect(policy.workspaces_root).toBe(join(home, 'workspaces'));
    expect(policy.rules).toHaveLength(1);
    const office = JSON.parse(readFileSync(join(profileDir(home, 'chief'), 'plugins', 'aos-office-tools', 'config.json'), 'utf8'));
    expect(office).toEqual({ core_url: 'http://127.0.0.1:7400', token: 'appr', assignees: opts.roster.map((p) => p.name) });
  });

  it('honours an explicit workspaces root and rejects an invalid policy template', () => {
    expect(JSON.parse(buildPolicy('{"version":1,"rules":[]}', 'E:\\ws')).workspaces_root).toBe('E:\\ws');
    expect(() => buildPolicy('{"version":2}', 'E:\\ws')).toThrow(/version 1/);
  });

  it('lists only plugin.yaml and python files', () => {
    const src = pluginSources()['os-bridge'];
    expect(pluginFiles(src)).toEqual(['__init__.py', 'plugin.yaml', 'policy.py']);
  });

  it('leaves an existing os-bridge spool untouched when re-applied', async () => {
    const { home, opts } = setup();
    const full = { ...opts, pluginSources: pluginSources(), bridge: { coreUrl: 'http://127.0.0.1:7400', token: 'bt' } };
    await applyProfiles(full);
    const spool = join(profileDir(home, 'chief'), 'plugins', 'os-bridge', 'spool');
    mkdirSync(spool, { recursive: true });
    writeFileSync(join(spool, '123.jsonl'), '{"a":1}\n');
    await applyProfiles(full);
    expect(readFileSync(join(spool, '123.jsonl'), 'utf8')).toBe('{"a":1}\n');
  });
});
