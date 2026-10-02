import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIER_MODELS, buildOverlay, buildRootOverlay, buildSoul, deepMerge, loadRoster, mergeEnv, parseEnv, pluginsFor, routerKeysFromEnv, tierModelsFromEnv } from '../src/profiles.js';

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
    expect(roster[1]).toEqual({ name: 'researcher', description: 'Riset', tier: 'os-worker', dockerNetwork: false, gateway: false, egressProxy: false });
  });
  it('routes the egress-proxy profile through the internal network and proxy', () => {
    const r = loadRoster('profiles:\n  - {name: chief, description: c, tier: os-brain, gateway: true}\n  - {name: dev, description: d, tier: os-brain, docker_network: true, egress_proxy: true}\n');
    expect(r[1].egressProxy).toBe(true);
    const t = buildOverlay(r[1], r, BASE).terminal as Record<string, unknown>;
    expect(t.docker_network).toBe(true);
    expect(t.docker_extra_args).toEqual(['--network', 'aos-egress']);
    expect(t.docker_env).toEqual({
      HTTP_PROXY: 'http://aos-egress-proxy:3128', HTTPS_PROXY: 'http://aos-egress-proxy:3128',
      http_proxy: 'http://aos-egress-proxy:3128', https_proxy: 'http://aos-egress-proxy:3128',
      NO_PROXY: 'localhost,127.0.0.1', no_proxy: 'localhost,127.0.0.1',
    });
    expect((buildOverlay(r[0], r, BASE).terminal as Record<string, unknown>).docker_extra_args).toBeUndefined();
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
      container_persistent: true,
      docker_persist_across_processes: false,
      docker_network: false,
      docker_mount_cwd_to_workspace: true,
      container_cpu: 1,
      container_memory: 2048,
    });
    expect(buildOverlay(roster[3], roster, BASE).terminal).toEqual({
      backend: 'docker',
      container_persistent: true,
      docker_persist_across_processes: false,
      docker_network: true,
      docker_mount_cwd_to_workspace: true,
      container_cpu: 2,
      container_memory: 4096,
    });
    expect(roster[0].gateway).toBe(true);
    expect(buildOverlay(roster[0], roster, BASE).terminal).toMatchObject({
      container_persistent: true,
      docker_persist_across_processes: false,
      docker_mount_cwd_to_workspace: false,
    });
  });
  it('keeps dispatcher and cron settings out of every profile', () => {
    for (const spec of roster) {
      const o = buildOverlay(spec, roster, BASE);
      expect(o.kanban).toEqual({ dispatch_in_gateway: false });
      expect(o.cron).toBeUndefined();
    }
  });
});

describe('buildRootOverlay', () => {
  const roster = loadRoster(ROSTER);
  it('routes the root profile through 9Router and owns the dispatcher and cron settings', () => {
    expect(buildRootOverlay(roster, BASE)).toEqual({
      model: { provider: 'custom', base_url: BASE, default: 'os-worker', key_env: 'OPENAI_API_KEY' },
      auxiliary: { compression: { model: 'os-worker', base_url: BASE } },
      kanban: {
        dispatch_in_gateway: true,
        dispatch_interval_seconds: 60,
        dispatch_profiles: ['chief', 'researcher', 'secretary', 'dev'],
        max_in_progress: 2,
        failure_limit: 2,
      },
      cron: { catch_up_missed: true },
      approvals: { mode: 'manual', timeout: 600, cron_mode: 'deny', single_query_mode: 'deny', unattended_mode: 'deny' },
    });
  });
  it('forces the manual Hermes approval gate everywhere', () => {
    const expected = { mode: 'manual', timeout: 600, cron_mode: 'deny', single_query_mode: 'deny', unattended_mode: 'deny' };
    for (const spec of roster) expect(buildOverlay(spec, roster, BASE).approvals).toEqual(expected);
    expect(buildRootOverlay(roster, BASE).approvals).toEqual(expected);
  });
  it('uses the mapped worker model', () => {
    const map = { 'os-brain': 'B', 'os-worker': 'W', 'os-private': 'P' };
    const o = buildRootOverlay(roster, BASE, map) as { model: { default: string }; auxiliary: { compression: { model: string } } };
    expect(o.model.default).toBe('W');
    expect(o.auxiliary.compression.model).toBe('W');
  });
});

describe('tier models', () => {
  const COMBO = { 'os-brain': 'COMBO-SS', 'os-worker': 'COMBO-SS', 'os-private': 'COMBO-SS' };

  it('buildOverlay uses the tier->model map for model.default and compression', () => {
    const roster = loadRoster(ROSTER);
    const overlay = buildOverlay(roster[1], roster, BASE, COMBO);
    expect((overlay.model as Record<string, unknown>).default).toBe('COMBO-SS');
    expect(overlay.auxiliary).toEqual({ compression: { model: 'COMBO-SS', base_url: BASE } });
  });

  it('tierModelsFromEnv defaults each tier to itself', () => {
    expect(tierModelsFromEnv({})).toEqual(DEFAULT_TIER_MODELS);
    expect(tierModelsFromEnv({ AOS_TIER_MODEL_OS_WORKER: '   ' })).toEqual(DEFAULT_TIER_MODELS);
  });

  it('tierModelsFromEnv trims overrides and keeps other tiers at default', () => {
    expect(tierModelsFromEnv({ AOS_TIER_MODEL_OS_BRAIN: ' X ' })).toEqual({ ...DEFAULT_TIER_MODELS, 'os-brain': 'X' });
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

describe('routerKeysFromEnv / pluginsFor', () => {
  const roster = loadRoster(ROSTER);
  it('reads per-profile router keys by upper-cased profile name', () => {
    expect(routerKeysFromEnv({ AOS_ROUTER_KEY_CHIEF: ' kc ', AOS_ROUTER_KEY_DEV: '', OTHER: 'x' }, roster)).toEqual({ chief: 'kc' });
  });
  it('gives every profile os-bridge and the gateway profile the office tools', () => {
    expect(pluginsFor(roster[0])).toEqual(['os-bridge', 'aos-office-tools']);
    expect(pluginsFor(roster[1])).toEqual(['os-bridge']);
  });
});

describe('real soul templates', () => {
  const soulDir = join(import.meta.dirname, '..', '..', '..', 'infra', 'profiles', 'soul');
  it('teach every agent the approval status codes', () => {
    const common = readFileSync(join(soulDir, '_common.md'), 'utf8');
    for (const code of ['PENDING_APPROVAL', 'DENIED_BY_OWNER', 'DENIED_BY_POLICY', 'DENIED_CORE_UNAVAILABLE', 'CIRCUIT_OPEN', 'awaiting_approval:', 'needs_input']) {
      expect(common).toContain(code);
    }
    expect(common).not.toContain('sampai sistem approval aktif');
  });

  it('teach chief to relay owner decisions only', () => {
    const chief = readFileSync(join(soulDir, 'chief.md'), 'utf8');
    for (const part of ['office_approve', 'office_list_approvals', 'setujui', 'tolak', 'JANGAN']) expect(chief).toContain(part);
  });
});
