import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyProfiles } from './apply.js';
import { formatResults } from './check.js';
import { realExec } from './exec.js';
import { resolveHermesHome } from './hermesHome.js';
import { loadRoster } from './profiles.js';
import { runDoctor } from './doctor.js';
import { smokeKanban, smokeChief } from './smoke.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const envFile = join(repoRoot, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} in .env.local`);
  return value;
}

async function main(cmd: string | undefined): Promise<number> {
  const roster = loadRoster(readFileSync(join(repoRoot, 'infra/profiles/roster.yaml'), 'utf8'));
  const routerBaseUrl = process.env.AOS_ROUTER_URL ?? 'http://127.0.0.1:20128/v1';
  const hermesHome = (): string => resolveHermesHome({ env: process.env, exists: existsSync });

  switch (cmd) {
    case 'apply-profiles': {
      const log = await applyProfiles({
        home: hermesHome(),
        roster,
        templatesDir: join(repoRoot, 'infra/profiles/soul'),
        routerBaseUrl,
        routerKey: required('AOS_ROUTER_KEY'),
        timezone: process.env.AOS_TIMEZONE ?? 'Asia/Jakarta',
        exec: realExec,
        stamp: new Date().toISOString().replace(/[:.]/g, '-'),
      });
      for (const line of log) console.log(line);
      return 0;
    }
    case 'doctor': {
      const results = await runDoctor(
        {
          home: hermesHome(),
          roster,
          lockText: readFileSync(join(repoRoot, 'infra/hermes.lock'), 'utf8'),
          routerBaseUrl,
          routerKey: required('AOS_ROUTER_KEY'),
        },
        { exec: realExec, fetchFn: fetch },
      );
      console.log(formatResults(results));
      return results.every((r) => r.ok) ? 0 : 1;
    }
    case 'smoke-kanban': {
      const result = await smokeKanban(realExec);
      console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.taskId} -> ${result.status}`);
      return result.ok ? 0 : 1;
    }
    case 'smoke-chief': {
      const result = await smokeChief(realExec);
      console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.taskId} -> ${result.status}`);
      return result.ok ? 0 : 1;
    }
    default:
      console.error('Usage: pnpm aos <apply-profiles|doctor|smoke-kanban|smoke-chief>');
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
