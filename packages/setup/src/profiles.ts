import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

export const TIERS = ['os-brain', 'os-worker', 'os-private'] as const;
export type Tier = (typeof TIERS)[number];

export interface ProfileSpec {
  name: string;
  description: string;
  tier: Tier;
  dockerNetwork: boolean;
  gateway: boolean;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export function loadRoster(yamlText: string): ProfileSpec[] {
  const doc = (YAML.parse(yamlText) ?? {}) as { profiles?: Obj[] };
  const roster = (doc.profiles ?? []).map((p): ProfileSpec => {
    const tier = p.tier as Tier;
    if (!TIERS.includes(tier)) throw new Error(`Profile ${String(p.name)} has invalid tier ${String(p.tier)}`);
    return {
      name: String(p.name),
      description: String(p.description ?? ''),
      tier,
      dockerNetwork: p.docker_network === true,
      gateway: p.gateway === true,
    };
  });
  const gateways = roster.filter((p) => p.gateway).length;
  if (gateways !== 1) throw new Error(`Exactly one profile must have gateway: true (found ${gateways})`);
  return roster;
}

export type TierModels = Record<Tier, string>;

export const DEFAULT_TIER_MODELS: TierModels = { 'os-brain': 'os-brain', 'os-worker': 'os-worker', 'os-private': 'os-private' };

export function tierModelsFromEnv(env: NodeJS.ProcessEnv): TierModels {
  const pick = (name: string, tier: Tier): string => env[name]?.trim() || DEFAULT_TIER_MODELS[tier];
  return {
    'os-brain': pick('AOS_TIER_MODEL_OS_BRAIN', 'os-brain'),
    'os-worker': pick('AOS_TIER_MODEL_OS_WORKER', 'os-worker'),
    'os-private': pick('AOS_TIER_MODEL_OS_PRIVATE', 'os-private'),
  };
}

export function buildOverlay(
  spec: ProfileSpec,
  roster: ProfileSpec[],
  routerBaseUrl: string,
  tierModels: TierModels = DEFAULT_TIER_MODELS,
): Obj {
  const isDev = spec.name === 'dev';
  const overlay: Obj = {
    model: { provider: 'custom', base_url: routerBaseUrl, default: tierModels[spec.tier], key_env: 'OPENAI_API_KEY' },
    auxiliary: {
      compression: { model: tierModels[spec.tier === 'os-private' ? 'os-private' : 'os-worker'], base_url: routerBaseUrl },
    },
    terminal: {
      backend: 'docker',
      container_persistent: false,
      docker_network: spec.dockerNetwork,
      docker_mount_cwd_to_workspace: !spec.gateway,
      container_cpu: isDev ? 2 : 1,
      container_memory: isDev ? 4096 : 2048,
    },
    kanban: spec.gateway
      ? {
          dispatch_in_gateway: true,
          dispatch_interval_seconds: 60,
          dispatch_profiles: roster.map((p) => p.name),
          max_in_progress: 2,
          failure_limit: 2,
        }
      : { dispatch_in_gateway: false },
  };
  if (spec.gateway) overlay.cron = { catch_up_missed: true };
  return overlay;
}

export function deepMerge(base: Obj, overlay: Obj): Obj {
  const out: Obj = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = out[key];
    out[key] = isObj(value) && isObj(current) ? deepMerge(current, value) : value;
  }
  return out;
}

const ENV_LINE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

export function mergeEnv(existing: string, updates: Record<string, string>): string {
  const lines = existing.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const key = ENV_LINE.exec(line)?.[1];
    if (key !== undefined && key in updates) {
      seen.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });
  for (const [key, value] of Object.entries(updates)) if (!seen.has(key)) out.push(`${key}=${value}`);
  return `${out.join('\n')}\n`;
}

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = ENV_LINE.exec(line);
    if (match) out[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export function buildSoul(spec: ProfileSpec, templatesDir: string): string {
  const own = readFileSync(join(templatesDir, `${spec.name}.md`), 'utf8').trimEnd();
  const common = readFileSync(join(templatesDir, '_common.md'), 'utf8').trimEnd();
  return `${own}\n\n${common}\n`;
}
