import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyProfiles } from './apply.js';
import { formatResults } from './check.js';
import { realExec } from './exec.js';
import { resolveHermesHome } from './hermesHome.js';
import { loadRoster, routerKeysFromEnv, tierModelsFromEnv } from './profiles.js';
import { runDoctor } from './doctor.js';
import { officeLoginUrl, officePublicUrl, openInBrowser } from './office.js';
import { smokeKanban, smokeChief } from './smoke.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const envFile = join(repoRoot, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const tierModels = tierModelsFromEnv(process.env);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

async function main(cmd: string | undefined): Promise<number> {
  const roster = loadRoster(readFileSync(join(repoRoot, 'infra/profiles/roster.yaml'), 'utf8'));
  const routerKeys = routerKeysFromEnv(process.env, roster);
  const coreUrl = process.env.AOS_CORE_URL ?? 'http://127.0.0.1:7400';
  const pluginSources = {
    'os-bridge': join(repoRoot, 'packages/hermes-os-bridge/os-bridge'),
    'aos-office-tools': join(repoRoot, 'packages/hermes-office-tools/aos-office-tools'),
  };
  const rawRouterUrl = (process.env.AOS_ROUTER_URL ?? 'http://127.0.0.1:20128/v1').replace(/\/+$/, '');
  const routerBaseUrl = rawRouterUrl.endsWith('/v1') ? rawRouterUrl : `${rawRouterUrl}/v1`;
  const useHermesHome = (): string => {
    const home = resolveHermesHome({ env: process.env, exists: existsSync });
    process.env.HERMES_HOME = home;
    console.log(`HERMES_HOME=${home}`);
    return home;
  };

  switch (cmd) {
    case 'apply-profiles': {
      const log = await applyProfiles({
        home: useHermesHome(),
        roster,
        templatesDir: join(repoRoot, 'infra/profiles/soul'),
        routerBaseUrl,
        routerKey: required('AOS_ROUTER_KEY'),
        timezone: process.env.AOS_TIMEZONE ?? 'Asia/Jakarta',
        exec: realExec,
        stamp: new Date().toISOString().replace(/[:.]/g, '-'),
        tierModels,
        routerKeys,
        pluginSources,
        bridge: { coreUrl, token: required('AOS_BRIDGE_TOKEN') },
        policyTemplate: readFileSync(join(repoRoot, 'infra/policy/policy.json'), 'utf8'),
        workspacesRoot: process.env.AOS_WORKSPACES_ROOT?.trim() || undefined,
        approver: { coreUrl, token: required('AOS_APPROVER_TOKEN') },
        scriptsRoot: join(repoRoot, 'packages/hermes-cron-scripts'),
      });
      for (const line of log) console.log(line);
      return 0;
    }
    case 'doctor': {
      const results = await runDoctor(
        {
          home: useHermesHome(),
          roster,
          lockText: readFileSync(join(repoRoot, 'infra/hermes.lock'), 'utf8'),
          routerBaseUrl,
          routerKey: required('AOS_ROUTER_KEY'),
          tierModels,
          routerKeys,
          coreUrl,
        },
        { exec: realExec, fetchFn: fetch },
      );
      console.log(formatResults(results));
      return results.every((r) => r.ok) ? 0 : 1;
    }
    case 'smoke-kanban': {
      useHermesHome();
      const result = await smokeKanban(realExec);
      console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.taskId} -> ${result.status}`);
      return result.ok ? 0 : 1;
    }
    case 'smoke-chief': {
      useHermesHome();
      const result = await smokeChief(realExec);
      console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.taskId} -> ${result.status}`);
      return result.ok ? 0 : 1;
    }
    case 'office': {
      await openInBrowser(officeLoginUrl(coreUrl, required('AOS_UI_TOKEN')), realExec);
      console.log(`Office dibuka di browser: ${officePublicUrl(coreUrl)}`);
      return 0;
    }
    case 'backup': {
      const res = await fetch(`${coreUrl}/v1/backup`, { method: 'POST', headers: { authorization: `Bearer ${required('AOS_UI_TOKEN')}` } });
      const body = (await res.json()) as { file?: string; files?: number; failed?: string[]; error?: string };
      if (!res.ok) {
        console.error(`Backup gagal: ${body.error ?? res.status}`);
        return 1;
      }
      console.log(`Backup: ${body.file} (${body.files} file, ${body.failed?.length ?? 0} gagal)`);
      return 0;
    }
    default:
      console.error('Usage: pnpm aos <apply-profiles|doctor|smoke-kanban|smoke-chief|office|backup|dogfood-report>');
      return 2;
  }
}

main(process.argv[2]).then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
