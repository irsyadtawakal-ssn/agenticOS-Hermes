import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { profileDir } from '../src/apply.js';
import { checkApprovals, checkCore, checkEgressProxy, checkEnvFile, checkGatewayRunning, checkHermesPin, checkProfile, checkRootConfig, runDoctor } from '../src/doctor.js';
import type { Exec } from '../src/exec.js';
import { buildOverlay, buildRootOverlay, loadRoster, pluginsFor } from '../src/profiles.js';

const BASE = 'http://127.0.0.1:20128/v1';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const roster = loadRoster('profiles:\n  - {name: chief, tier: os-brain, gateway: true}\n  - {name: researcher, tier: os-worker}\n');

function healthyHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'aos-doc-'));
  for (const spec of roster) {
    const dir = profileDir(home, spec.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'config.yaml'), YAML.stringify(buildOverlay(spec, roster, BASE)));
    writeFileSync(join(dir, '.env'), 'OPENAI_API_KEY=rk\nTELEGRAM_BOT_TOKEN=tg\n');
    writeFileSync(join(dir, 'SOUL.md'), '# x\n');
    for (const plugin of pluginsFor(spec)) {
      mkdirSync(join(dir, 'plugins', plugin), { recursive: true });
      writeFileSync(join(dir, 'plugins', plugin, '__init__.py'), '#\n');
    }
    writeFileSync(join(dir, 'plugins', 'os-bridge', 'config.json'), JSON.stringify({ core_url: 'http://127.0.0.1:7400', token: 'bt' }));
    writeFileSync(join(dir, 'plugins', 'os-bridge', 'policy.py'), '#\n');
    writeFileSync(join(dir, 'plugins', 'os-bridge', 'policy.json'), JSON.stringify({ version: 1, workspaces_root: 'D:\\w', rules: [{ id: 'x', action: 'deny', match: {} }] }));
    if (spec.gateway) {
      writeFileSync(join(dir, 'plugins', 'aos-office-tools', 'config.json'), JSON.stringify({ core_url: 'http://127.0.0.1:7400', token: 'at' }));
    }
  }
  writeFileSync(join(home, 'config.yaml'), YAML.stringify(buildRootOverlay(roster, BASE)));
  writeFileSync(join(home, '.env'), '');
  return home;
}

const INSTALL_DIR = 'C:\\Users\\lu.DESKTOP-HRO3RNS\\AppData\\Local\\hermes\\hermes-agent';
const versionOutput = (installDir = INSTALL_DIR): string =>
  [
    'Hermes Agent v0.21.5+4515.ge85706c (2026.9.24) · upstream e85706cb',
    `Install directory: ${installDir}`,
    'Install method: git',
    'Python: 3.14.7',
    '',
  ].join('\n');

type Call = { cmd: string; args: string[] };
const fakeExec =
  (head: string, opts: { gitCode?: number; version?: string; calls?: Call[] } = {}): Exec =>
  async (cmd, args) => {
    opts.calls?.push({ cmd, args });
    if (cmd === 'hermes') return { code: 0, stdout: opts.version ?? versionOutput(), stderr: '' };
    const code = opts.gitCode ?? 0;
    return { code, stdout: `${head}\n`, stderr: code ? 'not a git repo' : '' };
  };

describe('checkHermesPin', () => {
  it('passes when HEAD equals the locked commit', async () => {
    const r = await checkHermesPin(`commit=${SHA}\n`, fakeExec(SHA));
    expect(r).toEqual({ name: 'hermes-pin', ok: true, detail: `pinned at ${SHA.slice(0, 12)} (${INSTALL_DIR})` });
  });
  it('fails on drift and on git errors', async () => {
    expect((await checkHermesPin(`commit=${SHA}\n`, fakeExec('f'.repeat(40)))).ok).toBe(false);
    const r = await checkHermesPin(`commit=${SHA}\n`, fakeExec('', { gitCode: 128 }));
    expect(r).toMatchObject({ ok: false, detail: expect.stringMatching(/git rev-parse failed/) });
  });
  it('runs git against the install directory reported by hermes --version', async () => {
    const calls: Call[] = [];
    await checkHermesPin(`commit=${SHA}\n`, fakeExec(SHA, { calls, version: versionOutput('D:\\elsewhere\\hermes-agent') }));
    expect(calls[0]).toEqual({ cmd: 'hermes', args: ['--version'] });
    expect(calls[1]).toEqual({ cmd: 'git', args: ['-C', 'D:\\elsewhere\\hermes-agent', 'rev-parse', 'HEAD'] });
  });
});

describe('checkHermesPin when git cannot run', () => {
  it('returns a failed row instead of throwing', async () => {
    const enoent: Exec = async (cmd) => {
      if (cmd === 'hermes') return { code: 0, stdout: versionOutput(), stderr: '' };
      throw new Error('spawn git ENOENT');
    };
    expect(await checkHermesPin(`commit=${SHA}\n`, enoent)).toEqual({
      name: 'hermes-pin',
      ok: false,
      detail: 'git not runnable: spawn git ENOENT',
    });
  });
});

describe('checkHermesPin when hermes --version is unusable', () => {
  it('fails when hermes cannot run', async () => {
    const enoent: Exec = async () => {
      throw new Error('spawn hermes ENOENT');
    };
    expect(await checkHermesPin(`commit=${SHA}\n`, enoent)).toEqual({
      name: 'hermes-pin',
      ok: false,
      detail: 'hermes not runnable: spawn hermes ENOENT',
    });
  });
  it('fails on a non-zero exit', async () => {
    const bad: Exec = async () => ({ code: 1, stdout: '', stderr: 'boom\n' });
    expect(await checkHermesPin(`commit=${SHA}\n`, bad)).toEqual({
      name: 'hermes-pin',
      ok: false,
      detail: 'hermes --version failed: boom',
    });
  });
  it('fails when the output has no Install directory line', async () => {
    const r = await checkHermesPin(`commit=${SHA}\n`, fakeExec(SHA, { version: 'Hermes Agent v0.21.5\n' }));
    expect(r).toMatchObject({ name: 'hermes-pin', ok: false, detail: expect.stringMatching(/Install directory/) });
  });
});

describe('checkProfile', () => {
  it('passes for a correctly applied profile', () => {
    const home = healthyHome();
    const results = checkProfile(home, roster[0], BASE, 'rk');
    expect(results.map((r) => [r.name, r.ok])).toEqual([
      ['profile:chief:model', true],
      ['profile:chief:no-direct-keys', true],
      ['profile:chief:router-key', true],
      ['profile:chief:soul', true],
      ['profile:chief:approvals', true],
      ['profile:chief:plugins', true],
    ]);
  });

  it('uses the per-profile router key when one is configured', () => {
    const home = healthyHome();
    writeFileSync(join(profileDir(home, 'chief'), '.env'), 'OPENAI_API_KEY=rk-chief\n');
    const byName = Object.fromEntries(checkProfile(home, roster[0], BASE, 'rk', undefined, { chief: 'rk-chief' }).map((r) => [r.name, r]));
    expect(byName['profile:chief:router-key'].ok).toBe(true);
  });

  it('flags a missing plugin and an empty bridge token without printing it', () => {
    const home = healthyHome();
    writeFileSync(join(profileDir(home, 'chief'), 'plugins', 'os-bridge', 'config.json'), JSON.stringify({ core_url: 'u', token: '' }));
    rmSync(join(profileDir(home, 'chief'), 'plugins', 'aos-office-tools'), { recursive: true });
    const row = checkProfile(home, roster[0], BASE, 'rk').find((r) => r.name === 'profile:chief:plugins');
    expect(row).toMatchObject({ ok: false });
    expect(row?.detail).toMatch(/aos-office-tools/);
    expect(row?.detail).toMatch(/bridge token/);
  });

  it('flags direct provider keys, a wrong router key and a wrong tier', () => {
    const home = healthyHome();
    const dir = profileDir(home, 'researcher');
    writeFileSync(join(dir, '.env'), 'OPENAI_API_KEY=other\nANTHROPIC_API_KEY=sk-ant\n');
    writeFileSync(join(dir, 'config.yaml'), YAML.stringify({ model: { provider: 'custom', base_url: BASE, default: 'os-brain' } }));
    const byName = Object.fromEntries(checkProfile(home, roster[1], BASE, 'rk').map((r) => [r.name, r]));
    expect(byName['profile:researcher:model'].ok).toBe(false);
    expect(byName['profile:researcher:no-direct-keys']).toMatchObject({ ok: false, detail: 'remove: ANTHROPIC_API_KEY' });
    expect(byName['profile:researcher:router-key'].ok).toBe(false);
  });

  it('expects model.default to match the tier->model map', () => {
    const home = healthyHome();
    const combo = { 'os-brain': 'COMBO-SS', 'os-worker': 'COMBO-SS', 'os-private': 'COMBO-SS' };
    writeFileSync(join(profileDir(home, 'researcher'), 'config.yaml'), YAML.stringify(buildOverlay(roster[1], roster, BASE, combo)));
    const model = (tm?: typeof combo) => checkProfile(home, roster[1], BASE, 'rk', tm).find((r) => r.name === 'profile:researcher:model');
    expect(model(combo)).toMatchObject({ ok: true, detail: `os-worker -> COMBO-SS via ${BASE}` });
    expect(model()?.ok).toBe(false);
  });

  it('reports malformed config.yaml as a single failed row', () => {
    const home = healthyHome();
    writeFileSync(join(profileDir(home, 'researcher'), 'config.yaml'), 'model: [unclosed\n');
    const results = checkProfile(home, roster[1], BASE, 'rk');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: 'profile:researcher:config', ok: false });
    expect(results[0].detail).toMatch(/^config\.yaml is not valid YAML: /);
  });

  it('reports a missing profile directory', () => {
    const home = mkdtempSync(join(tmpdir(), 'aos-doc-'));
    expect(checkProfile(home, roster[1], BASE, 'rk')).toEqual([
      { name: 'profile:researcher', ok: false, detail: `missing ${profileDir(home, 'researcher')}` },
    ]);
  });
});

describe('approval hardening checks', () => {
  it('flags a weakened Hermes approval gate', () => {
    expect(checkApprovals({ mode: 'manual', cron_mode: 'deny', single_query_mode: 'deny', unattended_mode: 'deny' }, 'profile:dev').ok).toBe(true);
    const off = checkApprovals({ mode: 'off', cron_mode: 'approve' }, 'profile:dev');
    expect(off).toMatchObject({ name: 'profile:dev:approvals', ok: false });
    expect(off.detail).toContain('mode=off');
    expect(checkApprovals(undefined, 'root').ok).toBe(false);
  });

  it('reports a weakened gate in an applied profile', () => {
    const home = healthyHome();
    const dir = profileDir(home, 'researcher');
    writeFileSync(join(dir, 'config.yaml'), YAML.stringify({ ...buildOverlay(roster[1], roster, BASE), approvals: { mode: 'smart' } }));
    expect(checkProfile(home, roster[1], BASE, 'rk').find((r) => r.name === 'profile:researcher:approvals')?.ok).toBe(false);
  });

  it('flags a missing policy, a policy without root and a missing approver token', () => {
    const home = healthyHome();
    const chief = profileDir(home, 'chief');
    rmSync(join(chief, 'plugins', 'os-bridge', 'policy.json'));
    writeFileSync(join(chief, 'plugins', 'aos-office-tools', 'config.json'), JSON.stringify({ core_url: 'u', token: '' }));
    const row = checkProfile(home, roster[0], BASE, 'rk').find((r) => r.name === 'profile:chief:plugins');
    expect(row?.ok).toBe(false);
    expect(row?.detail).toMatch(/policy\.json missing or invalid/);
    expect(row?.detail).toMatch(/approver token missing/);
    const researcher = profileDir(home, 'researcher');
    writeFileSync(join(researcher, 'plugins', 'os-bridge', 'policy.json'), JSON.stringify({ version: 1, workspaces_root: '', rules: [{ id: 'x', action: 'deny', match: {} }] }));
    rmSync(join(researcher, 'plugins', 'os-bridge', 'policy.py'));
    const other = checkProfile(home, roster[1], BASE, 'rk').find((r) => r.name === 'profile:researcher:plugins');
    expect(other?.detail).toMatch(/no workspaces_root/);
    expect(other?.detail).toMatch(/missing os-bridge\/policy\.py/);
  });

  it('flags HERMES_YOLO_MODE in a profile env', () => {
    const home = healthyHome();
    writeFileSync(join(profileDir(home, 'researcher'), '.env'), 'OPENAI_API_KEY=rk\nHERMES_YOLO_MODE=1\n');
    expect(checkProfile(home, roster[1], BASE, 'rk').find((r) => r.name === 'profile:researcher:no-direct-keys')).toMatchObject({
      ok: false,
      detail: 'remove: HERMES_YOLO_MODE',
    });
  });
});

describe('checkRootConfig', () => {
  it('passes for the applied root overlay', () => {
    const home = healthyHome();
    expect(checkRootConfig(home, BASE).map((r) => [r.name, r.ok])).toEqual([
      ['root:model', true],
      ['root:dispatcher', true],
      ['root:cron-catch-up', true],
      ['root:approvals', true],
    ]);
  });
  it('reports a missing root config as one failing row', () => {
    const home = mkdtempSync(join(tmpdir(), 'aos-doc-'));
    expect(checkRootConfig(home, BASE)).toEqual([
      { name: 'root:config', ok: false, detail: `missing ${join(home, 'config.yaml')}` },
    ]);
  });
  it('flags dispatcher limits that are not applied', () => {
    const home = healthyHome();
    writeFileSync(join(home, 'config.yaml'), YAML.stringify({ ...buildRootOverlay(roster, BASE), kanban: { dispatch_in_gateway: true } }));
    expect(checkRootConfig(home, BASE).find((r) => r.name === 'root:dispatcher')?.ok).toBe(false);
  });
});

describe('checkGatewayRunning', () => {
  it('passes when hermes reports a running gateway process', async () => {
    const exec: Exec = async () => ({ code: 0, stdout: '✓ Gateway process running (PID: 1)\n', stderr: '' });
    expect((await checkGatewayRunning(exec)).ok).toBe(true);
  });
  it('fails when the gateway is not running or hermes cannot run', async () => {
    const down: Exec = async () => ({ code: 1, stdout: '✗ Gateway is not running\n', stderr: '' });
    const broken: Exec = async () => { throw new Error('ENOENT'); };
    expect((await checkGatewayRunning(down)).ok).toBe(false);
    expect(await checkGatewayRunning(broken)).toMatchObject({ ok: false, detail: expect.stringMatching(/hermes not runnable/) });
  });
});

describe('checkEnvFile', () => {
  it('treats a missing file as clean', () => {
    expect(checkEnvFile(join(tmpdir(), 'nope-aos.env'), 'root').ok).toBe(true);
  });
});

describe('checkCore', () => {
  it('passes when /v1/health returns ok', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch;
    expect(await checkCore('http://127.0.0.1:7400', fetchFn)).toEqual({ name: 'core-health', ok: true, detail: 'GET http://127.0.0.1:7400/v1/health -> 200' });
  });
  it('fails without throwing when Core is down', async () => {
    const fetchFn = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    expect(await checkCore('http://127.0.0.1:7400', fetchFn)).toMatchObject({ ok: false, detail: expect.stringMatching(/ECONNREFUSED/) });
  });
});

describe('checkEgressProxy', () => {
  it('checks the egress proxy container and internal network', async () => {
    const exec: Exec = async () => ({ code: 0, stdout: 'true\n', stderr: '' });
    expect((await checkEgressProxy(exec)).ok).toBe(true);
    const down: Exec = async (_cmd, args) => ({ code: args.includes('network') ? 0 : 1, stdout: args.includes('network') ? 'false\n' : '', stderr: 'No such object' });
    expect(await checkEgressProxy(down)).toMatchObject({ name: 'egress-proxy', ok: false });
    const noDocker: Exec = async () => {
      throw new Error('spawn docker ENOENT');
    };
    expect(await checkEgressProxy(noDocker)).toMatchObject({ ok: false, detail: expect.stringMatching(/docker not runnable/) });
  });

  it('runs in doctor only when a profile uses the egress proxy', async () => {
    const egressRoster = loadRoster('profiles:\n  - {name: chief, tier: os-brain, gateway: true}\n  - {name: dev, tier: os-brain, egress_proxy: true}\n');
    const calls: string[][] = [];
    const exec: Exec = async (cmd, args) => (calls.push([cmd, ...args]), { code: 1, stdout: '', stderr: 'x' });
    const fetchFn = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    const home = mkdtempSync(join(tmpdir(), 'aos-doc-'));
    const names = (await runDoctor({ home, roster: egressRoster, lockText: `commit=${SHA}\n`, routerBaseUrl: BASE, routerKey: 'rk' }, { exec, fetchFn })).map((r) => r.name);
    expect(names).toContain('egress-proxy');
    const plain = (await runDoctor({ home, roster, lockText: `commit=${SHA}\n`, routerBaseUrl: BASE, routerKey: 'rk' }, { exec, fetchFn })).map((r) => r.name);
    expect(plain).not.toContain('egress-proxy');
  });
});

describe('runDoctor', () => {
  it('combines pin, root env, profile and router checks', async () => {
    const home = healthyHome();
    const fetchFn = (async (u: string, init?: RequestInit) => {
      if (String(u).endsWith('/v1/health')) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      return new Headers(init?.headers).get('authorization')
        ? new Response(JSON.stringify({ data: [{ id: 'os-brain' }, { id: 'os-worker' }, { id: 'os-private' }] }), { status: 200 })
        : new Response('', { status: 401 });
    }) as unknown as typeof fetch;
    const baseExec = fakeExec(SHA);
    const exec: Exec = async (cmd, args, opts) =>
      cmd === 'hermes' && args[0] === 'gateway' ? { code: 0, stdout: 'Gateway process running (PID: 1)\n', stderr: '' } : baseExec(cmd, args, opts);
    const results = await runDoctor(
      { home, roster, lockText: `commit=${SHA}\n`, routerBaseUrl: BASE, routerKey: 'rk' },
      { exec, fetchFn },
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.map((r) => r.name)).toContain('hermes-pin');
    expect(results.map((r) => r.name)).toContain('root-env:no-direct-keys');
    expect(results.map((r) => r.name)).toContain('combo:os-private');
    expect(results.map((r) => r.name)).toContain('gateway-running');
    expect(results.map((r) => r.name)).toContain('root:dispatcher');
    expect(results.map((r) => r.name)).toContain('core-health');
  });
});
