import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildOverlay, buildSoul, deepMerge, loadRoster, mergeEnv, parseEnv } from '../src/profiles.js';

const ROSTER = `
profiles:
  - name: chief
    description: Chief of Staff
    tier: os-brain
    gateway: true
  - name: researcher
    description: Riset
    tier: os-worker
  - name: secretary
    description: Sekretaris
    tier: os-private
  - name: dev
    description: Dev
    tier: os-brain
    docker_network: true
`;
const BASE = 'http://127.0.0.1:20128/v1';

describe('loadRoster', () => {
  it('parses profiles and applies defaults', () => {
    const roster = loadRoster(ROSTER);
    expect(roster.map((p) => p.name)).toEqual(['chief', 'researcher', 'secretary', 'dev']);
    expect(roster[1]).toEqual({ name: 'researcher', description: 'Riset', tier: 'os-worker', dockerNetwork: false, gateway: false });
  });
  it('rejects an unknown tier', () => {
    expect(() => loadRoster('profiles:\n  - {name: x, tier: gpt-4, gateway: true}\n')).toThrow(/invalid tier/);
  });
  it('requires exactly one gateway profile', () => {
    expect(() => loadRoster('profiles:\n  - {name: a, tier: os-brain}\n')).toThrow(/Exactly one/);
  });
});

describe('buildOverlay', () => {
  const roster = loadRoster(ROSTER);
  it('routes the main model through 9Router using the profile tier', () => {
    expect(buildOverlay(roster[1], roster, BASE).model).toEqual({
      provider: 'custom',
      base_url: BASE,
      default: 'os-worker',
      key_env: 'OPENAI_API_KEY',
    });
  });
  it('routes auxiliary compression through 9Router, private for os-private profiles', () => {
    expect(buildOverlay(roster[1], roster, BASE).auxiliary).toEqual({ compression: { model: 'os-worker', base_url: BASE } });
    expect(buildOverlay(roster[2], roster, BASE).auxiliary).toEqual({ compression: { model: 'os-private', base_url: BASE } });
  });
  it('sandboxes the terminal in docker with network only when allowed', () => {
    expect(buildOverlay(roster[1], roster, BASE).terminal).toEqual({
      backend: 'docker',
      docker_network: false,
      docker_mount_cwd_to_workspace: true,
      container_cpu: 1,
      container_memory: 2048,
    });
    expect(buildOverlay(roster[3], roster, BASE).terminal).toEqual({
      backend: 'docker',
      docker_network: true,
      docker_mount_cwd_to_workspace: true,
      container_cpu: 2,
      container_memory: 4096,
    });
  });
  it('enables the dispatcher and cron catch-up only on the gateway profile', () => {
    const chief = buildOverlay(roster[0], roster, BASE);
    expect(chief.kanban).toEqual({
      dispatch_in_gateway: true,
      dispatch_interval_seconds: 60,
      dispatch_profiles: ['chief', 'researcher', 'secretary', 'dev'],
      max_in_progress: 2,
      failure_limit: 2,
    });
    expect(chief.cron).toEqual({ catch_up_missed: true });
    const researcher = buildOverlay(roster[1], roster, BASE);
    expect(researcher.kanban).toEqual({ dispatch_in_gateway: false });
    expect(researcher.cron).toBeUndefined();
  });
});

describe('deepMerge', () => {
  it('merges nested objects and replaces scalars and arrays', () => {
    const base = { model: { default: 'x', context_length: 64000 }, agent: { max_turns: 50 }, list: [1, 2] };
    const overlay = { model: { default: 'os-brain' }, list: [3] };
    expect(deepMerge(base, overlay)).toEqual({ model: { default: 'os-brain', context_length: 64000 }, agent: { max_turns: 50 }, list: [3] });
  });
  it('does not mutate the base object', () => {
    const base = { a: { b: 1 } };
    deepMerge(base, { a: { b: 2 } });
    expect(base).toEqual({ a: { b: 1 } });
  });
});

describe('mergeEnv / parseEnv', () => {
  it('replaces existing keys, keeps other lines and appends new keys', () => {
    const existing = '# bot\nTELEGRAM_BOT_TOKEN=abc\nOPENAI_API_KEY=old\n';
    expect(mergeEnv(existing, { OPENAI_API_KEY: 'rk', HERMES_TIMEZONE: 'Asia/Jakarta' })).toBe(
      '# bot\nTELEGRAM_BOT_TOKEN=abc\nOPENAI_API_KEY=rk\nHERMES_TIMEZONE=Asia/Jakarta\n',
    );
  });
  it('handles an empty file and CRLF input', () => {
    expect(mergeEnv('', { A: '1' })).toBe('A=1\n');
    expect(mergeEnv('X=1\r\nA=0\r\n', { A: '2' })).toBe('X=1\nA=2\n');
  });
  it('parses keys and strips matching quotes', () => {
    expect(parseEnv('# c\nA=1\nB="two"\nC=\'3\'\nbad line\n')).toEqual({ A: '1', B: 'two', C: '3' });
  });
});

describe('buildSoul', () => {
  it('appends the common rules to the profile persona', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-soul-'));
    writeFileSync(join(dir, 'researcher.md'), '# Researcher\n\nRiset.\n');
    writeFileSync(join(dir, '_common.md'), '## Aturan bersama\n');
    const [spec] = loadRoster('profiles:\n  - {name: researcher, tier: os-worker, gateway: true}\n');
    expect(buildSoul(spec, dir)).toBe('# Researcher\n\nRiset.\n\n## Aturan bersama\n');
  });
});
