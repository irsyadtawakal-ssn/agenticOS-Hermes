import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { profileDir } from '../src/apply.js';
import { checkEnvFile, checkHermesPin, checkProfile, runDoctor } from '../src/doctor.js';
import type { Exec } from '../src/exec.js';
import { buildOverlay, loadRoster } from '../src/profiles.js';

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
  }
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
      ['profile:chief:dispatcher', true],
    ]);
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

describe('checkEnvFile', () => {
  it('treats a missing file as clean', () => {
    expect(checkEnvFile(join(tmpdir(), 'nope-aos.env'), 'root').ok).toBe(true);
  });
});

describe('runDoctor', () => {
  it('combines pin, root env, profile and router checks', async () => {
    const home = healthyHome();
    const fetchFn = (async (_u: string, init?: RequestInit) =>
      new Headers(init?.headers).get('authorization')
        ? new Response(JSON.stringify({ data: [{ id: 'os-brain' }, { id: 'os-worker' }, { id: 'os-private' }] }), { status: 200 })
        : new Response('', { status: 401 })) as unknown as typeof fetch;
    const results = await runDoctor(
      { home, roster, lockText: `commit=${SHA}\n`, routerBaseUrl: BASE, routerKey: 'rk' },
      { exec: fakeExec(SHA), fetchFn },
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.map((r) => r.name)).toContain('hermes-pin');
    expect(results.map((r) => r.name)).toContain('root-env:no-direct-keys');
    expect(results.map((r) => r.name)).toContain('combo:os-private');
  });
});
