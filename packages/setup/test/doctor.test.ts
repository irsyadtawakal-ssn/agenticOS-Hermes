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

const gitExec = (head: string, code = 0): Exec => async () => ({ code, stdout: `${head}\n`, stderr: code ? 'not a git repo' : '' });

describe('checkHermesPin', () => {
  it('passes when HEAD equals the locked commit', async () => {
    expect((await checkHermesPin('H', `commit=${SHA}\n`, gitExec(SHA))).ok).toBe(true);
  });
  it('fails on drift and on git errors', async () => {
    expect((await checkHermesPin('H', `commit=${SHA}\n`, gitExec('f'.repeat(40)))).ok).toBe(false);
    const r = await checkHermesPin('H', `commit=${SHA}\n`, gitExec('', 128));
    expect(r).toMatchObject({ ok: false, detail: expect.stringMatching(/git rev-parse failed/) });
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
      { exec: gitExec(SHA), fetchFn },
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.map((r) => r.name)).toContain('hermes-pin');
    expect(results.map((r) => r.name)).toContain('root-env:no-direct-keys');
    expect(results.map((r) => r.name)).toContain('combo:os-private');
  });
});
