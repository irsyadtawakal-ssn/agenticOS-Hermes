import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import YAML from 'yaml';

const OMIT = new Set(['.archive', '.curator_backups', '.locks', '__pycache__', 'node_modules', 'cache', 'spool']);
const SAFE_NAME = /^[a-z][a-z0-9_-]{0,63}$/;

export function desktopProfiles(sourceHome: string): Array<{ name: string; source: string }> {
  const out = existsSync(join(sourceHome, 'config.yaml')) ? [{ name: 'hermes-default', source: sourceHome }] : [];
  const profiles = join(sourceHome, 'profiles');
  if (existsSync(profiles)) {
    for (const name of readdirSync(profiles).sort()) {
      const source = join(profiles, name);
      if (SAFE_NAME.test(name) && !lstatSync(source).isSymbolicLink() && lstatSync(source).isDirectory() && existsSync(join(source, 'config.yaml'))) out.push({ name, source });
    }
  }
  return out;
}

export function importedEnv(text: string): string {
  // Retain model/tool credentials locally, but never duplicate channel delivery or process ownership.
  return text.split(/\r?\n/)
    .filter((line) => {
      const key = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1];
      return !!key && (!/^(AOS_|TELEGRAM_|DISCORD_|SLACK_|WHATSAPP_|SIGNAL_|MATRIX_|EMAIL_|GATEWAY_|HERMES_)/.test(key) || /^HERMES_CUSTOM_/.test(key));
    })
    .join('\n') + '\n';
}

function remap(value: unknown, source: string, target: string): unknown {
  if (typeof value === 'string') {
    for (const separator of ['\\', '/']) {
      const from = source.replace(/[\\/]/g, separator);
      const to = target.replace(/[\\/]/g, separator);
      if (value.toLowerCase() === from.toLowerCase()) return to;
      if (value.toLowerCase().startsWith((from + separator).toLowerCase())) return to + value.slice(from.length);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => remap(v, source, target));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v, source, target)]));
  return value;
}

/** One-time snapshots. Existing imported agents are preserved on subsequent calls. */
export function importDesktop(sourceHome: string, targetHome: string, repoRoot: string): string[] {
  if (resolve(sourceHome).toLowerCase() === resolve(targetHome).toLowerCase()) throw new Error('Desktop and Agentic OS homes must differ');
  const rosterPath = join(repoRoot, 'infra/profiles/roster.yaml');
  const roster = YAML.parse(readFileSync(rosterPath, 'utf8')) as { profiles: Array<Record<string, unknown>> };
  const sources = desktopProfiles(sourceHome);
  if (!sources.length) throw new Error('No Desktop profiles found');
  // Validate the entire import before creating any targets.
  for (const { name, source } of sources) {
    const existing = roster.profiles.find((p) => p.name === name);
    if (existing && existing.desktop_source !== (name === 'hermes-default' ? 'default' : name)) throw new Error(`Profile name conflict: ${name}`);
    if (!existing && existsSync(join(targetHome, 'profiles', name))) throw new Error(`Target already exists: ${name}`);
    YAML.parse(readFileSync(join(source, 'config.yaml'), 'utf8'));
  }
  const log: string[] = [];
  const common = readFileSync(join(repoRoot, 'infra/profiles/soul/_common.md'), 'utf8');
  for (const { name, source } of sources) {
    const target = join(targetHome, 'profiles', name);
    if (!existsSync(target)) {
      mkdirSync(target, { recursive: true });
      const config = remap(YAML.parse(readFileSync(join(source, 'config.yaml'), 'utf8')) ?? {}, source, target) as Record<string, unknown>;
      // Gateway/cron are managed by Agentic OS; copied profiles have no delivery channels.
      delete config.telegram; delete config.platforms; delete config.gateway; delete config.cron;
      delete config.command_allowlist;
      writeFileSync(join(target, 'config.yaml'), YAML.stringify(config), 'utf8');
      for (const file of ['auth.json']) if (existsSync(join(source, file))) cpSync(join(source, file), join(target, file));
      for (const folder of ['skills', 'memories']) {
        if (existsSync(join(source, folder))) cpSync(join(source, folder), join(target, folder), {
          recursive: true,
          filter: (path) => !lstatSync(path).isSymbolicLink() && !OMIT.has(path.split(/[\\/]/).at(-1)!) && !/\.lock$|\.bak-/.test(path),
        });
      }
      const env = existsSync(join(source, '.env')) ? importedEnv(readFileSync(join(source, '.env'), 'utf8')) : '';
      writeFileSync(join(target, '.env'), env, 'utf8');
      const soul = existsSync(join(source, 'SOUL.md')) ? readFileSync(join(source, 'SOUL.md'), 'utf8') : `# ${name}`;
      writeFileSync(join(target, 'SOUL.md'), `${soul.trimEnd()}\n\n${common}\n`, 'utf8');
      // No source profile metadata, session DB, runtime, cron jobs or bot state is copied.
      writeFileSync(join(target, 'profile.yaml'), YAML.stringify({ name, description: `Imported Hermes Desktop ${name}`, created_at: new Date().toISOString() }), 'utf8');
      log.push(`imported ${name}: configuration, persona, skills, memory and model authentication`);
    } else log.push(`kept existing import ${name}`);
    if (!roster.profiles.some((p) => p.name === name)) roster.profiles.push({ name, description: `Hermes Desktop ${name}`, tier: 'os-brain', docker_network: true, egress_proxy: true, desktop_source: name === 'hermes-default' ? 'default' : name });
  }
  writeFileSync(rosterPath, YAML.stringify(roster), 'utf8');
  writeFileSync(join(repoRoot, 'infra/profiles/office-roster.json'), JSON.stringify(roster.profiles.map((p) => ({ name: p.name, tier: p.tier })), null, 2) + '\n');
  return log;
}
