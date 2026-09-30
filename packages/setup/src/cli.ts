import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyProfiles } from './apply.js';
import { realExec } from './exec.js';
import { resolveHermesHome } from './hermesHome.js';
import { loadRoster } from './profiles.js';

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
    default:
      console.error('Usage: pnpm aos <apply-profiles>');
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
