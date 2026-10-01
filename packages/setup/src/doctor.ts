import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { profileDir } from './apply.js';
import type { CheckResult } from './check.js';
import type { Exec } from './exec.js';
import { parseInstallDir, parseLock } from './hermesHome.js';
import { DEFAULT_TIER_MODELS, parseEnv, type ProfileSpec, type TierModels } from './profiles.js';
import { checkRouter } from './router.js';

export const FORBIDDEN_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'DEEPSEEK_API_KEY',
  'XAI_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
  'NOUS_API_KEY',
  'OPENAI_BASE_URL',
];

export interface DoctorConfig {
  home: string;
  roster: ProfileSpec[];
  lockText: string;
  routerBaseUrl: string;
  routerKey: string;
  tierModels?: TierModels;
}

export interface DoctorDeps {
  exec: Exec;
  fetchFn: typeof fetch;
}

const readText = (path: string): string => (existsSync(path) ? readFileSync(path, 'utf8') : '');

export async function checkHermesPin(lockText: string, exec: Exec): Promise<CheckResult> {
  const { commit } = parseLock(lockText);
  let v: Awaited<ReturnType<Exec>>;
  try {
    v = await exec('hermes', ['--version'], { timeoutMs: 60_000 });
  } catch (err) {
    return { name: 'hermes-pin', ok: false, detail: `hermes not runnable: ${(err as Error).message}` };
  }
  if (v.code !== 0) {
    return { name: 'hermes-pin', ok: false, detail: `hermes --version failed: ${(v.stderr || v.stdout).trim()}` };
  }
  let installDir: string;
  try {
    installDir = parseInstallDir(v.stdout);
  } catch (err) {
    return { name: 'hermes-pin', ok: false, detail: (err as Error).message };
  }
  let r: Awaited<ReturnType<Exec>>;
  try {
    r = await exec('git', ['-C', installDir, 'rev-parse', 'HEAD']);
  } catch (err) {
    return { name: 'hermes-pin', ok: false, detail: `git not runnable: ${(err as Error).message}` };
  }
  const head = r.stdout.trim();
  if (r.code !== 0) return { name: 'hermes-pin', ok: false, detail: `git rev-parse failed: ${r.stderr.trim()}` };
  return head === commit
    ? { name: 'hermes-pin', ok: true, detail: `pinned at ${commit.slice(0, 12)} (${installDir})` }
    : { name: 'hermes-pin', ok: false, detail: `HEAD ${head.slice(0, 12)} != lock ${commit.slice(0, 12)}` };
}

export function checkEnvFile(path: string, label: string): CheckResult {
  const env = parseEnv(readText(path));
  const leaked = FORBIDDEN_ENV_KEYS.filter((k) => (env[k] ?? '').length > 0);
  return {
    name: `${label}:no-direct-keys`,
    ok: leaked.length === 0,
    detail: leaked.length ? `remove: ${leaked.join(', ')}` : 'no direct provider keys',
  };
}

export function checkProfile(
  home: string,
  spec: ProfileSpec,
  routerBaseUrl: string,
  routerKey: string,
  tierModels: TierModels = DEFAULT_TIER_MODELS,
): CheckResult[] {
  const dir = profileDir(home, spec.name);
  const label = `profile:${spec.name}`;
  if (!existsSync(dir)) return [{ name: label, ok: false, detail: `missing ${dir}` }];

  let cfg: Record<string, Record<string, unknown> | undefined>;
  try {
    cfg = (YAML.parse(readText(join(dir, 'config.yaml'))) ?? {}) as Record<string, Record<string, unknown> | undefined>;
  } catch (err) {
    return [{ name: `${label}:config`, ok: false, detail: `config.yaml is not valid YAML: ${(err as Error).message}` }];
  }
  const model = cfg.model ?? {};
  const modelOk = model.provider === 'custom' && model.base_url === routerBaseUrl && model.default === tierModels[spec.tier];
  const env = parseEnv(readText(join(dir, '.env')));
  const results: CheckResult[] = [
    { name: `${label}:model`, ok: modelOk, detail: modelOk ? `${spec.tier} -> ${tierModels[spec.tier]} via ${routerBaseUrl}` : `model=${JSON.stringify(model)}` },
    checkEnvFile(join(dir, '.env'), label),
    {
      name: `${label}:router-key`,
      ok: env.OPENAI_API_KEY === routerKey,
      detail: env.OPENAI_API_KEY === routerKey ? 'OPENAI_API_KEY is the 9Router key' : 'OPENAI_API_KEY is not the 9Router key',
    },
    { name: `${label}:soul`, ok: existsSync(join(dir, 'SOUL.md')), detail: existsSync(join(dir, 'SOUL.md')) ? 'SOUL.md present' : 'SOUL.md missing' },
  ];
  return results;
}

export function checkRootConfig(home: string, routerBaseUrl: string, tierModels: TierModels = DEFAULT_TIER_MODELS): CheckResult[] {
  const path = join(home, 'config.yaml');
  if (!existsSync(path)) return [{ name: 'root:config', ok: false, detail: `missing ${path}` }];
  let cfg: Record<string, Record<string, unknown> | undefined>;
  try {
    cfg = (YAML.parse(readFileSync(path, 'utf8')) ?? {}) as Record<string, Record<string, unknown> | undefined>;
  } catch (err) {
    return [{ name: 'root:config', ok: false, detail: `config.yaml is not valid YAML: ${(err as Error).message.split('\n')[0]}` }];
  }
  const model = cfg.model ?? {};
  const kanban = cfg.kanban ?? {};
  const cron = cfg.cron ?? {};
  const modelOk = model.provider === 'custom' && model.base_url === routerBaseUrl && model.default === tierModels['os-worker'];
  const dispatcherOk = kanban.dispatch_in_gateway === true && kanban.max_in_progress === 2 && kanban.failure_limit === 2;
  return [
    { name: 'root:model', ok: modelOk, detail: modelOk ? `${tierModels['os-worker']} via ${routerBaseUrl}` : `model=${JSON.stringify(model)}` },
    { name: 'root:dispatcher', ok: dispatcherOk, detail: dispatcherOk ? 'dispatch_in_gateway, max_in_progress=2, failure_limit=2' : `kanban=${JSON.stringify(kanban)}` },
    { name: 'root:cron-catch-up', ok: cron.catch_up_missed === true, detail: `cron.catch_up_missed=${String(cron.catch_up_missed)}` },
  ];
}

export async function checkGatewayRunning(exec: Exec): Promise<CheckResult> {
  try {
    const r = await exec('hermes', ['gateway', 'status'], { timeoutMs: 60_000 });
    const ok = /Gateway process running/.test(r.stdout + r.stderr);
    return { name: 'gateway-running', ok, detail: ok ? 'host gateway process running' : 'gateway not running - start Hermes_Gateway_787a7c01.vbs' };
  } catch (err) {
    return { name: 'gateway-running', ok: false, detail: `hermes not runnable: ${(err as Error).message}` };
  }
}

export async function runDoctor(cfg: DoctorConfig, deps: DoctorDeps): Promise<CheckResult[]> {
  const tierModels = cfg.tierModels ?? DEFAULT_TIER_MODELS;
  return [
    await checkHermesPin(cfg.lockText, deps.exec),
    checkEnvFile(join(cfg.home, '.env'), 'root-env'),
    ...checkRootConfig(cfg.home, cfg.routerBaseUrl, cfg.tierModels),
    await checkGatewayRunning(deps.exec),
    ...cfg.roster.flatMap((spec) => checkProfile(cfg.home, spec, cfg.routerBaseUrl, cfg.routerKey, tierModels)),
    ...(await checkRouter(cfg.routerBaseUrl, cfg.routerKey, deps.fetchFn, Object.values(tierModels))),
  ];
}
