import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import type { Exec } from './exec.js';
import { buildOverlay, buildSoul, deepMerge, mergeEnv, type ProfileSpec } from './profiles.js';

export interface ApplyOptions {
  home: string;
  roster: ProfileSpec[];
  templatesDir: string;
  routerBaseUrl: string;
  routerKey: string;
  timezone: string;
  exec: Exec;
  stamp: string;
}

export function profileDir(home: string, name: string): string {
  return join(home, 'profiles', name);
}

function backup(path: string, stamp: string): void {
  if (existsSync(path)) copyFileSync(path, `${path}.bak-${stamp}`);
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
    const current = existsSync(configPath) ? ((YAML.parse(readFileSync(configPath, 'utf8')) ?? {}) as Record<string, unknown>) : {};
    backup(configPath, o.stamp);
    writeFileSync(configPath, YAML.stringify(deepMerge(current, buildOverlay(spec, o.roster, o.routerBaseUrl))), 'utf8');

    const envPath = join(dir, '.env');
    const envText = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    backup(envPath, o.stamp);
    writeFileSync(envPath, mergeEnv(envText, { OPENAI_API_KEY: o.routerKey, HERMES_TIMEZONE: o.timezone }), 'utf8');

    const soulPath = join(dir, 'SOUL.md');
    backup(soulPath, o.stamp);
    writeFileSync(soulPath, buildSoul(spec, o.templatesDir), 'utf8');
    log.push(`configured profile ${spec.name} (tier ${spec.tier})`);
  }
  return log;
}
