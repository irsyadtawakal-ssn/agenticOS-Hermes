import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  policyTemplate?: string;
  workspacesRoot?: string;
  approver?: { coreUrl: string; token: string };
  /** Root holding `<profile>/*.py` cron pre-run scripts, copied to `profiles/<profile>/scripts/`. */
  scriptsRoot?: string;
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

// Copy code only: the plugin dir also holds runtime state (spool/, config.json, policy.json) that apply writes itself.
export function pluginFiles(source: string): string[] {
  return readdirSync(source)
    .filter((f) => f === 'plugin.yaml' || f.endsWith('.py'))
    .sort();
}

export function buildPolicy(templateText: string, workspacesRoot: string): string {
  const doc = JSON.parse(templateText) as Record<string, unknown>;
  if (doc.version !== 1 || !Array.isArray(doc.rules)) throw new Error('policy template must have version 1 and a rules array');
  return `${JSON.stringify({ ...doc, workspaces_root: workspacesRoot }, null, 2)}\n`;
}

async function installPlugins(o: ApplyOptions, spec: ProfileSpec, dir: string): Promise<string | null> {
  if (!o.pluginSources) return null;
  const names = pluginsFor(spec);
  for (const name of names) {
    const source = o.pluginSources[name];
    if (!source) throw new Error(`no plugin source configured for ${name}`);
    const target = join(dir, 'plugins', name);
    mkdirSync(target, { recursive: true });
    for (const file of pluginFiles(source)) copyFileSync(join(source, file), join(target, file));
    if (name === 'os-bridge' && o.bridge) {
      writeFileSync(join(target, 'config.json'), JSON.stringify({ core_url: o.bridge.coreUrl, token: o.bridge.token }), 'utf8');
    }
    if (name === 'os-bridge' && o.policyTemplate) {
      writeFileSync(join(target, 'policy.json'), buildPolicy(o.policyTemplate, o.workspacesRoot ?? join(o.home, 'workspaces')), 'utf8');
    }
    if (name === 'aos-office-tools' && o.approver) {
      writeFileSync(join(target, 'config.json'), JSON.stringify({ core_url: o.approver.coreUrl, token: o.approver.token, assignees: o.roster.map((p) => p.name) }), 'utf8');
    }
    const r = await o.exec('hermes', ['-p', spec.name, 'plugins', 'enable', name], { timeoutMs: 120_000 });
    if (r.code !== 0) throw new Error(`hermes -p ${spec.name} plugins enable ${name} failed: ${(r.stderr || r.stdout).trim()}`);
  }
  return `installed plugins ${names.join(',')} for ${spec.name}`;
}

function installScripts(o: ApplyOptions, spec: ProfileSpec, dir: string): string | null {
  const source = o.scriptsRoot ? join(o.scriptsRoot, spec.name) : null;
  if (!source || !existsSync(source)) return null;
  const files = readdirSync(source).filter((f) => f.endsWith('.py')).sort();
  if (files.length === 0) return null;
  const target = join(dir, 'scripts');
  mkdirSync(target, { recursive: true });
  for (const file of files) copyFileSync(join(source, file), join(target, file));
  return `installed cron scripts ${files.join(',')} for ${spec.name}`;
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
    const overlay = buildOverlay(spec, o.roster, o.routerBaseUrl, o.tierModels ?? DEFAULT_TIER_MODELS);
    if (spec.desktopSource) {
      // Desktop models and auxiliary providers remain as configured by the owner.
      delete overlay.model;
      delete overlay.auxiliary;
    }
    writeConfig(configPath, overlay, o.stamp);

    const envPath = join(dir, '.env');
    writeEnv(envPath, { ...(spec.desktopSource ? {} : { OPENAI_API_KEY: o.routerKeys?.[spec.name] ?? o.routerKey }), HERMES_TIMEZONE: o.timezone }, o.stamp);

    const soulPath = join(dir, 'SOUL.md');
    if (!spec.desktopSource) {
      backup(soulPath, o.stamp);
      writeFileSync(soulPath, buildSoul(spec, o.templatesDir), 'utf8');
    } else if (existsSync(soulPath)) {
      const commonPath = join(o.templatesDir, '_common.md');
      if (existsSync(commonPath)) {
        const common = readFileSync(commonPath, 'utf8').trimEnd();
        const currentSoul = readFileSync(soulPath, 'utf8');
        const marker = '## Aturan bersama';
        const markerIndex = currentSoul.indexOf(marker);
        const persona = markerIndex !== -1 ? currentSoul.slice(0, markerIndex).trimEnd() : currentSoul.trimEnd();
        const updatedSoul = `${persona}\n\n${common}\n`;
        if (updatedSoul !== currentSoul) {
          backup(soulPath, o.stamp);
          writeFileSync(soulPath, updatedSoul, 'utf8');
        }
      }
    }
    const installed = await installPlugins(o, spec, dir);
    if (installed) log.push(installed);
    const scripts = installScripts(o, spec, dir);
    if (scripts) log.push(scripts);
    log.push(`configured profile ${spec.name} (tier ${spec.tier})`);
  }
  mkdirSync(o.home, { recursive: true });
  writeConfig(join(o.home, 'config.yaml'), buildRootOverlay(o.roster, o.routerBaseUrl, o.tierModels ?? DEFAULT_TIER_MODELS), o.stamp);
  writeEnv(join(o.home, '.env'), { OPENAI_API_KEY: o.routerKey, HERMES_TIMEZONE: o.timezone }, o.stamp);
  log.push('configured root (dispatcher + cron)');
  return log;
}
