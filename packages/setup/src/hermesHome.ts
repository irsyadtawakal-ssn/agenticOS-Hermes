import { join } from 'node:path';

export interface HomeProbe {
  env: NodeJS.ProcessEnv;
  exists: (p: string) => boolean;
}

export function hermesHomeCandidates(env: NodeJS.ProcessEnv): string[] {
  const candidates: string[] = [];
  if (env.AOS_HERMES_HOME) candidates.push(env.AOS_HERMES_HOME);
  if (env.HERMES_HOME) candidates.push(env.HERMES_HOME);
  if (env.LOCALAPPDATA) candidates.push(join(env.LOCALAPPDATA, 'hermes'));
  if (env.USERPROFILE) candidates.push(join(env.USERPROFILE, '.hermes'));
  if (env.HOME) candidates.push(join(env.HOME, '.hermes'));
  return [...new Set(candidates)];
}

function explicitOverride(env: NodeJS.ProcessEnv): string | undefined {
  for (const name of ['AOS_HERMES_HOME', 'HERMES_HOME'] as const) {
    const value = env[name];
    if (!value) continue;
    if (value.includes('%')) throw new Error(`${name} contains an unexpanded variable: ${value} — write the full path`);
    return value;
  }
  return undefined;
}

export function resolveHermesHome({ env, exists }: HomeProbe): string {
  const override = explicitOverride(env);
  if (override) return override;
  const candidates = hermesHomeCandidates(env);
  const found = candidates.find((dir) => exists(join(dir, 'config.yaml')) || exists(join(dir, 'profiles')));
  if (!found) throw new Error(`HERMES_HOME not found. Checked: ${candidates.join(', ')}`);
  return found;
}

export function hermesSourceDir(home: string): string {
  return join(home, 'hermes-agent');
}

export function parseLock(text: string): { commit: string } {
  const match = /^commit=([0-9a-f]{7,40})\s*$/m.exec(text);
  if (!match) throw new Error('infra/hermes.lock must contain a line commit=<git sha>');
  return { commit: match[1] };
}
