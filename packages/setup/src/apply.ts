import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import type { Exec } from './exec.js';
import {
  DEFAULT_TIER_MODELS,
  buildOverlay,
  buildRootOverlay,
  buildSoul,
  deepMerge,
  mergeEnv,
  pluginsFor,
  type ProfileSpec,
  type TierModels,
} from './profiles.js';

export interface ApplyOptions {
  home: string;
  roster: ProfileSpec[];
  templatesDir: string;
  routerBaseUrl: string;
  routerKey: string;
  timezone: string;
  exec: Exec;
  stamp: string;
  tierModels?: TierModels;
  routerKeys?: Record<string, string>;
  pluginSources?: Record<string, string>;
  bridge?: { coreUrl: string; token: string };
}

export function profileDir(home: string, name: string): string {
  return join(home, 'profiles', name);
}

function backup(path: string, stamp: string): void {
  if (existsSync(path)) copyFileSync(path, `${path}.bak-${stamp}`);
}

function writeConfig(path: string, overlay: Record<string, unknown>, stamp: string): void {
  const current = existsSync(path) ? ((YAML.parse(readFileSync(path, 'utf8')) ?? {}) as Record<string, unknown>) : {};
  backup(path, stamp);
  writeFileSync(path, YAML.stringify(deepMerge(current, overlay)), 'utf8');
}

function writeEnv(path: string, updates: Record<string, string>, stamp: string): void {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  backup(path, stamp);
  writeFileSync(path, mergeEnv(text, updates), 'utf8');
}

// Copy only these files: the plugin dir also holds runtime state (spool/, config.json) that must survive re-apply.
const PLUGIN_FILES = ['plugin.yaml', '__init__.py'];

async function installPlugins(o: ApplyOptions, spec: ProfileSpec, dir: string): Promise<string | null> {
  if (!o.pluginSources) return null;
  const names = pluginsFor(spec);
  for (const name of names) {
    const source = o.pluginSources[name];
    if (!source) throw new Error(`no plugin source configured for ${name}`);
    const target = join(dir, 'plugins', name);
    mkdirSync(target, { recursive: true });
    for (const file of PLUGIN_FILES) copyFileSync(join(source, file), join(target, file));
    if (name === 'os-bridge' && o.bridge) {
      writeFileSync(join(target, 'config.json'), JSON.stringify({ core_url: o.bridge.coreUrl, token: o.bridge.token }), 'utf8');
    }
    const r = await o.exec('hermes', ['-p', spec.name, 'plugins', 'enable', name], { timeoutMs: 120_000 });
    if (r.code !== 0) throw new Error(`hermes -p ${spec.name} plugins enable ${name} failed: ${(r.stderr || r.stdout).trim()}`);
  }
  return `installed plugins ${names.join(',')} for ${spec.name}`;
}

export async function applyProfiles(o: ApplyOptions): Promise<string[]> {
  const log: string[] = [];
  for (const spec of o.roster) {
    const dir = profileDir(o.home, spec.name);
    if (!existsSync(dir)) {
      const r = await o.exec('hermes', ['profile', 'create', spec.name, '--description', spec.description], { timeoutMs: 120_000 });
      if (r.code !== 0) throw new Error(`hermes profile create ${spec.name} failed: ${(r.stderr || r.stdout).trim()}`);
      log.push(`created profile ${spec.name}`);
    }
    mkdirSync(dir, { recursive: true });

    const configPath = join(dir, 'config.yaml');
    writeConfig(configPath, buildOverlay(spec, o.roster, o.routerBaseUrl, o.tierModels ?? DEFAULT_TIER_MODELS), o.stamp);

    const envPath = join(dir, '.env');
    writeEnv(envPath, { OPENAI_API_KEY: o.routerKeys?.[spec.name] ?? o.routerKey, HERMES_TIMEZONE: o.timezone }, o.stamp);

    const soulPath = join(dir, 'SOUL.md');
    backup(soulPath, o.stamp);
    writeFileSync(soulPath, buildSoul(spec, o.templatesDir), 'utf8');
    const installed = await installPlugins(o, spec, dir);
    if (installed) log.push(installed);
    log.push(`configured profile ${spec.name} (tier ${spec.tier})`);
  }
  mkdirSync(o.home, { recursive: true });
  writeConfig(join(o.home, 'config.yaml'), buildRootOverlay(o.roster, o.routerBaseUrl, o.tierModels ?? DEFAULT_TIER_MODELS), o.stamp);
  writeEnv(join(o.home, '.env'), { OPENAI_API_KEY: o.routerKey, HERMES_TIMEZONE: o.timezone }, o.stamp);
  log.push('configured root (dispatcher + cron)');
  return log;
}
