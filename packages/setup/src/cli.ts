import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { applyProfiles } from './apply.js';
import { formatResults } from './check.js';
import { realExec } from './exec.js';
import { resolveHermesHome } from './hermesHome.js';
import { loadRoster, routerKeysFromEnv, tierModelsFromEnv } from './profiles.js';
import { runDoctor } from './doctor.js';
import { officeLoginUrl, officePublicUrl, openInBrowser } from './office.js';
import { smokeKanban, smokeChief } from './smoke.js';
import { importDesktop } from './desktopImport.js';

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
    case 'import-desktop': {
      const source = process.argv[3] ?? join(process.env.LOCALAPPDATA ?? '', 'hermes');
      for (const line of importDesktop(source, useHermesHome(), repoRoot)) console.log(line);
      return main('apply-profiles');
    }
    case 'apply-profiles': {
      writeFileSync(join(repoRoot, 'infra/profiles/office-roster.json'), JSON.stringify(roster.map((p) => ({ name: p.name, tier: p.tier })), null, 2) + '\n');
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
    case 'dogfood-report': {
      const days = Number(process.argv[3] ?? 14);
      const res = await fetch(`${coreUrl}/v1/dogfood?days=${days}`, { headers: { authorization: `Bearer ${required('AOS_UI_TOKEN')}` } });
      if (!res.ok) {
        console.error(`Laporan gagal: HTTP ${res.status}`);
        return 1;
      }
      const r = (await res.json()) as {
        from: string;
        to: string;
        briefing: { onDays: number; delivered: number; rate: number | null; perDay: Array<{ day: string; morningOn: boolean; delivered: boolean; late: boolean }> };
        security: { checked: number; violations: number };
        approvals: { decided: number; medianMinutes: number | null };
        adoption: { activeDays: number };
        gate: { enoughData: boolean; briefingOk: boolean | null; securityOk: boolean };
      };
      const pct = r.briefing.rate === null ? '-' : `${Math.round(r.briefing.rate * 100)}%`;
      console.log(`Dogfooding ${r.from} … ${r.to}`);
      for (const d of r.briefing.perDay) {
        const mark = !d.morningOn ? '·  PC mati pagi' : d.delivered ? (d.late ? '✓  terlambat' : '✓') : '✗  tidak terkirim';
        console.log(`  ${d.day}  ${mark}`);
      }
      console.log(`Briefing: ${r.briefing.delivered}/${r.briefing.onDays} hari PC menyala (${pct}; gate ≥ 95%)`);
      console.log(`Keamanan: ${r.security.violations} pelanggaran dari ${r.security.checked} keputusan (gate = 0)`);
      console.log(
        `Approval: ${r.approvals.decided} diputuskan, median ${r.approvals.medianMinutes === null ? '-' : `${r.approvals.medianMinutes.toFixed(1)} menit`} (target < 15)`,
      );
      console.log(`Adopsi: ${r.adoption.activeDays} hari dipakai (Telegram/kantor)`);
      const verdict = !r.gate.enoughData
        ? 'BELUM CUKUP DATA (perlu 14 hari PC menyala)'
        : r.gate.briefingOk && r.gate.securityOk
          ? 'GATE F1 LULUS'
          : 'GATE F1 BELUM LULUS';
      console.log(verdict);
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
