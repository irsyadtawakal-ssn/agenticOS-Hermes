# M2 — Bridge & Core: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat aktivitas kelima agent terlihat dan terukur: plugin Hermes `os-bridge` mengirim event (sesi, LLM, tool) ke **OS Core** (Node + Fastify + SQLite) yang menyimpan event log, memproyeksikan state tiap agent, membaca kanban Hermes, menghitung biaya dari database 9Router per agent & per kartu, dan menyiarkan semuanya lewat WebSocket — ditambah dua perbaikan awal M2: file hasil worker tersimpan di workspace kartu, dan config dispatcher berpindah ke root config.

**Architecture:** Hermes tetap upstream. `os-bridge` (Python stdlib, satu file `__init__.py`) dipasang per profile oleh `pnpm aos apply-profiles`, membaca `config.json` di foldernya sendiri (URL Core + token), mengantre event secara non-blocking, mengirim batch ke `POST /v1/events`, dan menulis ke spool file bila Core mati. OS Core (`apps/core`) bind `127.0.0.1:7400`, menyimpan ke `D:\agentic-os\core\core.db`, membaca `kanban.db` Hermes dan `data.sqlite` 9Router **read-only**, dan tidak pernah menyimpan API key. M2 belum punya policy/approval (itu M3).

**Tech Stack:** TypeScript (Node ≥ 22.13, pnpm 11), Fastify 5 + `@fastify/websocket`, `zod`, `better-sqlite3`, Vitest; Python stdlib + pytest untuk plugin; Hermes Agent v0.21.5; 9Router 0.5.86.

**Spec:** [`docs/PRD-Agentic-OS.md`](../../PRD-Agentic-OS.md) (§4.4, §5.3, §5.4, §6, §13-M2) · fakta mesin: [`docs/runbook.md`](../../runbook.md) · temuan & ruling M1: `.superpowers/sdd/2026-09-30-m1-fondasi/progress.md`

## Global Constraints

- Semua constraint M1 tetap berlaku (Windows 11 native, Hermes tidak di-fork, trailer commit, dokumen Bahasa Indonesia, kode bahasa Inggris).
- `HERMES_HOME` Agentic OS = `D:\agentic-os\hermes-home` (`AOS_HERMES_HOME`). **Jangan pernah** menulis ke `%LOCALAPPDATA%\hermes` (instalasi Hermes milik owner).
- OS Core bind **hanya** `127.0.0.1`, port default `7400`. DB Core: `D:\agentic-os\core\core.db`.
- `kanban.db` Hermes dan `%APPDATA%\9router\db\data.sqlite` dibuka **read-only**; Core tidak pernah menulis ke keduanya.
- Kolom `apiKey` 9Router **tidak pernah** disimpan, di-log, atau dikirim; hanya dipakai di memori untuk memetakan ke profile.
- Event mengikuti skema PRD §6.1: `{id, ts (epoch ms), type, profile, session_id, task_id, mode, payload}`; payload tanpa isi pesan user/asisten/hasil tool, argumen tool hanya `args_preview` ≤ 200 karakter yang sudah diredaksi.
- `os-bridge` **tidak pernah memblokir atau melempar exception** ke Hermes; tanpa policy di M2 (selalu `return None`).
- Plugin Python hanya memakai stdlib (berjalan di Python 3.14 milik Hermes, dites dengan `py -3`).
- Deviasi dari PRD yang disengaja: `better-sqlite3` + SQL biasa, bukan Drizzle (YAGNI untuk 4 tabel).
- Commit diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Perintah verifikasi: `pnpm -r test`, `pnpm -r typecheck`, `py -3 -m pytest packages -q`.
- Langkah bertanda **[mesin]** menyentuh Hermes/9Router/Docker nyata — dikerjakan controller (atau owner bila disebut), **bukan** implementer subagent.

## Fakta yang sudah diverifikasi (dasar plan ini)

| Topik | Fakta |
|---|---|
| Hook Hermes | keyword-only. `on_session_start{session_id, model, platform}`, `on_session_end{session_id, task_id, completed, failed, interrupted, turn_exit_reason, model, platform}`, `pre_llm_call{session_id, task_id, turn_id, model, platform, …}`, `post_llm_call{…}` (**tanpa token usage**), `pre_tool_call{tool_name, args, task_id, session_id, tool_call_id, turn_id}`, `post_tool_call{… result, duration_ms, status, error_type, error_message}`. pre/post_llm sekali per giliran percakapan. |
| Plugin | dimuat dari `<HERMES_HOME>\profiles\<profile>\plugins\<nama>\`; aktifkan `hermes -p <profile> plugins enable <nama>`. |
| Worker kanban | env `HERMES_KANBAN_TASK=t_<id>`; dispatcher men-spawn proses `hermes -p <assignee> chat -q …` dengan cwd = workspace kartu. |
| Sandbox Docker | `container_persistent: true` → container per profile & dipakai lintas proses (`docker_persist_across_processes` default `true`) → kartu ke-2 dst. menulis ke workspace kartu ke-1. `container_persistent: false` → Hermes menolak mount cwd asal proses (`cwd_source: "process"`, `tools/terminal_tool.py::_resolve_task_host_cwd`) → file hilang. |
| Dispatcher | berjalan di host gateway dengan **root** `config.yaml` milik `HERMES_HOME` (saat ini tidak ada → default Hermes). |
| `usageHistory` 9Router | `id` (int naik), `timestamp` (ISO string), `provider`, `model` (model asli, mis. `gemini-3.8-flash-medium`), `apiKey` (35 char), `promptTokens`, `completionTokens`, `cost` (USD), `status`. |
| `kanban.db` | `tasks(id, title, assignee, status, created_at, started_at, completed_at, workspace_kind, workspace_path…)`, `task_runs(id, task_id, profile, status, started_at, ended_at, outcome…)` — waktu dalam **epoch detik**; WAL, aman read-only. |

## File Structure

```
packages/setup/src/
  profiles.ts        # MODIFY: terminal persist flags (T1), buildRootOverlay + kanban per-profile (T2), routerKeysFromEnv (T5)
  apply.ts           # MODIFY: root config/env (T2), plugin install + per-profile key + bridge config (T5)
  doctor.ts          # MODIFY: root/gateway checks (T2), plugin & per-profile key checks (T5), core health (T11)
  cli.ts             # MODIFY: wiring (T2, T5, T11)
packages/hermes-os-bridge/
  os-bridge/plugin.yaml, os-bridge/__init__.py   # T3 (event model), T4 (transport + hooks)
  test_os_bridge.py
apps/core/                                       # T6–T11
  package.json, tsconfig.json
  src/config.ts      # env → CoreConfig
  src/db.ts          # open + migrate core.db
  src/events.ts      # zod schema + ingest
  src/state.ts       # event → agent state projection
  src/kanban.ts      # read-only kanban.db reader + diff
  src/costs.ts       # 9Router usage sync, task attribution, summaries
  src/hub.ts         # WebSocket broadcast hub
  src/server.ts      # Fastify routes + auth
  src/main.ts        # wiring + timers + listen
  test/*.test.ts
infra/windows/
  set-local-secrets.ps1      # T5: per-profile router keys + tokens → .env.local (tanpa lewat chat)
  install-core-startup.ps1   # T11: launcher Startup untuk OS Core
```

---

### Task 1: File hasil worker tersimpan di workspace kartu

**Files:**
- Modify: `packages/setup/src/profiles.ts` (objek `terminal` di `buildOverlay`)
- Test: `packages/setup/test/profiles.test.ts`

**Interfaces:**
- Produces: setiap profile mendapat `terminal.container_persistent: true` dan `terminal.docker_persist_across_processes: false` (menggantikan R26 `container_persistent: false`).

- [ ] **Step 1: Ubah test yang ada (failing)**

Di `packages/setup/test/profiles.test.ts`, test `"sandboxes the terminal in docker with network only when allowed"` — ganti ekspektasi `terminal` menjadi persis:
```ts
    expect(buildOverlay(roster[1], roster, BASE).terminal).toEqual({
      backend: 'docker',
      container_persistent: true,
      docker_persist_across_processes: false,
      docker_network: false,
      docker_mount_cwd_to_workspace: true,
      container_cpu: 1,
      container_memory: 2048,
    });
    expect(buildOverlay(roster[3], roster, BASE).terminal).toEqual({
      backend: 'docker',
      container_persistent: true,
      docker_persist_across_processes: false,
      docker_network: true,
      docker_mount_cwd_to_workspace: true,
      container_cpu: 2,
      container_memory: 4096,
    });
    expect(buildOverlay(roster[0], roster, BASE).terminal).toMatchObject({
      container_persistent: true,
      docker_persist_across_processes: false,
      docker_mount_cwd_to_workspace: false,
    });
```
(Hapus asersi `container_persistent: false` yang lama di test ini.)

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm -F @aos/setup exec vitest run test/profiles.test.ts`
Expected: FAIL — `container_persistent` bernilai `false` dan `docker_persist_across_processes` tidak ada.

- [ ] **Step 3: Implementasi**

Di `buildOverlay`, objek `terminal` menjadi:
```ts
    terminal: {
      backend: 'docker',
      container_persistent: true,
      docker_persist_across_processes: false,
      docker_network: spec.dockerNetwork,
      docker_mount_cwd_to_workspace: !spec.gateway,
      container_cpu: isDev ? 2 : 1,
      container_memory: isDev ? 4096 : 2048,
    },
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `pnpm -F @aos/setup test` lalu `pnpm -F @aos/setup typecheck`
Expected: semua PASS, typecheck bersih.

- [ ] **Step 5: Commit**

```bash
git add packages/setup
git commit -m "fix(setup): per-process docker containers so each card mounts its own workspace" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6 [mesin]: Verifikasi dua kartu berturut-turut**

```powershell
pnpm aos apply-profiles
docker ps -a --filter "name=hermes-" --format "{{.Names}}" | ForEach-Object { docker rm -f $_ }
$env:HERMES_HOME = "D:\agentic-os\hermes-home"; hermes gateway stop
Start-Process wscript.exe -ArgumentList "`"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Hermes_Gateway_787a7c01.vbs`""
# tunggu log gateway berisi "kanban dispatcher: embedded"
pnpm aos smoke-chief
pnpm aos smoke-chief
Get-ChildItem D:\agentic-os\hermes-home\workspaces | Sort-Object LastWriteTime -Descending | Select-Object -First 2 | ForEach-Object { "$($_.Name): $((Get-ChildItem $_.FullName).Name -join ',')" }
docker ps -a --filter "name=hermes-" --format "{{.Names}} {{.Status}}"
```
Expected: kedua workspace terbaru masing-masing berisi `notes.md` miliknya sendiri (isi berbeda waktu). Catat jumlah container `hermes-*` yang tersisa.
- **Jika workspace masih kosong:** buka `D:\agentic-os\hermes-home\profiles\researcher\logs\agent.log` sekitar waktu run, cari `Mounting configured host cwd` dan `Creating new docker environment`; catat di ledger. Fallback yang sudah diketahui aman: kembali ke `container_persistent: false` (R26) — hasil kerja tetap tersedia lewat ringkasan `kanban_complete`. Jangan pakai `docker_persist_across_processes: true`.
- **Jika container menumpuk** (> 1 per profile setelah beberapa kartu dan berstatus Exited): catat; reaper Hermes (`docker_orphan_reaper`) diharapkan membersihkannya — cek lagi di Task 12.

---

### Task 2: Config dispatcher di root + doctor cek root & gateway

**Files:**
- Modify: `packages/setup/src/profiles.ts`, `packages/setup/src/apply.ts`, `packages/setup/src/doctor.ts`, `packages/setup/src/cli.ts`
- Test: `packages/setup/test/profiles.test.ts`, `packages/setup/test/apply.test.ts`, `packages/setup/test/doctor.test.ts`

**Interfaces:**
- Consumes: `ProfileSpec`, `TierModels`, `DEFAULT_TIER_MODELS`, `deepMerge`, `mergeEnv`, `parseEnv` (profiles.ts); `Exec` (exec.ts); `CheckResult` (check.ts).
- Produces:
  - `buildRootOverlay(roster: ProfileSpec[], routerBaseUrl: string, tierModels?: TierModels): Record<string, unknown>`
  - `buildOverlay(...)` tidak lagi menulis config dispatcher ke profile gateway; **semua** profile mendapat `kanban: { dispatch_in_gateway: false }` dan tidak ada `cron`.
  - `applyProfiles` juga menulis `<home>\config.yaml` (merge + backup) dan `<home>\.env` (`OPENAI_API_KEY`, `HERMES_TIMEZONE`). Log tambahan: `'configured root (dispatcher + cron)'`.
  - `checkRootConfig(home: string, routerBaseUrl: string, tierModels?: TierModels): CheckResult[]` → baris `root:model`, `root:dispatcher`, `root:cron-catch-up` (atau satu baris `root:config` bila YAML rusak/tidak ada).
  - `checkGatewayRunning(exec: Exec): Promise<CheckResult>` → baris `gateway-running`.
  - `checkProfile` tidak lagi menghasilkan baris `profile:<gateway>:dispatcher`.
  - `runDoctor` = pin + root-env + root config + gateway + profiles + router.

- [ ] **Step 1: Tulis/ubah test (failing)**

`packages/setup/test/profiles.test.ts` — ganti test `"enables the dispatcher and cron catch-up only on the gateway profile"` dengan:
```ts
  it('keeps dispatcher and cron settings out of every profile', () => {
    for (const spec of roster) {
      const o = buildOverlay(spec, roster, BASE);
      expect(o.kanban).toEqual({ dispatch_in_gateway: false });
      expect(o.cron).toBeUndefined();
    }
  });
```
dan tambahkan:
```ts
describe('buildRootOverlay', () => {
  const roster = loadRoster(ROSTER);
  it('routes the root profile through 9Router and owns the dispatcher and cron settings', () => {
    expect(buildRootOverlay(roster, BASE)).toEqual({
      model: { provider: 'custom', base_url: BASE, default: 'os-worker', key_env: 'OPENAI_API_KEY' },
      auxiliary: { compression: { model: 'os-worker', base_url: BASE } },
      kanban: {
        dispatch_in_gateway: true,
        dispatch_interval_seconds: 60,
        dispatch_profiles: ['chief', 'researcher', 'secretary', 'dev'],
        max_in_progress: 2,
        failure_limit: 2,
      },
      cron: { catch_up_missed: true },
    });
  });
  it('uses the mapped worker model', () => {
    const map = { 'os-brain': 'B', 'os-worker': 'W', 'os-private': 'P' };
    const o = buildRootOverlay(roster, BASE, map) as { model: { default: string }; auxiliary: { compression: { model: string } } };
    expect(o.model.default).toBe('W');
    expect(o.auxiliary.compression.model).toBe('W');
  });
});
```
(Tambahkan `buildRootOverlay` ke import dari `../src/profiles.js`.)

`packages/setup/test/apply.test.ts` — di test `"creates a missing profile via the hermes CLI and writes config, env and SOUL.md"`, ganti asersi `expect(cfg.kanban.dispatch_in_gateway).toBe(true);` menjadi `expect(cfg.kanban).toEqual({ dispatch_in_gateway: false });`, ganti ekspektasi `log` menjadi `['created profile chief', 'configured profile chief (tier os-brain)', 'configured root (dispatcher + cron)']`, lalu tambahkan:
```ts
    const root = YAML.parse(readFileSync(join(home, 'config.yaml'), 'utf8'));
    expect(root.kanban.dispatch_in_gateway).toBe(true);
    expect(root.cron).toEqual({ catch_up_missed: true });
    expect(readFileSync(join(home, '.env'), 'utf8')).toBe('OPENAI_API_KEY=rk-123\nHERMES_TIMEZONE=Asia/Jakarta\n');
```
Pada test `"reuses an existing profile and keeps unrelated env keys"` ganti asersi log (jika ada) agar konsisten; test ini tidak memeriksa log.

`packages/setup/test/doctor.test.ts`:
- Di `healthyHome()`, setelah loop profile tambahkan:
```ts
  writeFileSync(join(home, 'config.yaml'), YAML.stringify(buildRootOverlay(roster, BASE)));
```
  (import `buildRootOverlay`.)
- Ubah ekspektasi test `'passes for a correctly applied profile'` menjadi 4 baris (tanpa `profile:chief:dispatcher`):
```ts
    expect(results.map((r) => [r.name, r.ok])).toEqual([
      ['profile:chief:model', true],
      ['profile:chief:no-direct-keys', true],
      ['profile:chief:router-key', true],
      ['profile:chief:soul', true],
    ]);
```
- Tambahkan:
```ts
describe('checkRootConfig', () => {
  it('passes for the applied root overlay', () => {
    const home = healthyHome();
    expect(checkRootConfig(home, BASE).map((r) => [r.name, r.ok])).toEqual([
      ['root:model', true],
      ['root:dispatcher', true],
      ['root:cron-catch-up', true],
    ]);
  });
  it('reports a missing root config as one failing row', () => {
    const home = mkdtempSync(join(tmpdir(), 'aos-doc-'));
    expect(checkRootConfig(home, BASE)).toEqual([
      { name: 'root:config', ok: false, detail: `missing ${join(home, 'config.yaml')}` },
    ]);
  });
  it('flags dispatcher limits that are not applied', () => {
    const home = healthyHome();
    writeFileSync(join(home, 'config.yaml'), YAML.stringify({ ...buildRootOverlay(roster, BASE), kanban: { dispatch_in_gateway: true } }));
    expect(checkRootConfig(home, BASE).find((r) => r.name === 'root:dispatcher')?.ok).toBe(false);
  });
});

describe('checkGatewayRunning', () => {
  it('passes when hermes reports a running gateway process', async () => {
    const exec: Exec = async () => ({ code: 0, stdout: '✓ Gateway process running (PID: 1)\n', stderr: '' });
    expect((await checkGatewayRunning(exec)).ok).toBe(true);
  });
  it('fails when the gateway is not running or hermes cannot run', async () => {
    const down: Exec = async () => ({ code: 1, stdout: '✗ Gateway is not running\n', stderr: '' });
    const broken: Exec = async () => { throw new Error('ENOENT'); };
    expect((await checkGatewayRunning(down)).ok).toBe(false);
    expect(await checkGatewayRunning(broken)).toMatchObject({ ok: false, detail: expect.stringMatching(/hermes not runnable/) });
  });
});
```
  (import `checkRootConfig`, `checkGatewayRunning`.)
- Pada test `runDoctor`, bungkus exec yang sudah dipakai test itu agar juga menjawab `hermes gateway status`:
```ts
    const baseExec = /* exec yang sudah dipakai test runDoctor saat ini */;
    const exec: Exec = async (cmd, args, opts) =>
      cmd === 'hermes' && args[0] === 'gateway' ? { code: 0, stdout: 'Gateway process running (PID: 1)\n', stderr: '' } : baseExec(cmd, args, opts);
```
  lalu tambahkan asersi `expect(results.map((r) => r.name)).toContain('gateway-running');` dan `expect(results.map((r) => r.name)).toContain('root:dispatcher');`.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm -F @aos/setup test`
Expected: FAIL — `buildRootOverlay`, `checkRootConfig`, `checkGatewayRunning` belum ada; asersi kanban lama berbeda.

- [ ] **Step 3: Implementasi `profiles.ts`**

Di `buildOverlay`: ganti blok `kanban: spec.gateway ? {...} : {...}` dengan `kanban: { dispatch_in_gateway: false },` dan **hapus** `if (spec.gateway) overlay.cron = { catch_up_missed: true };`. Tambahkan:
```ts
export function buildRootOverlay(roster: ProfileSpec[], routerBaseUrl: string, tierModels: TierModels = DEFAULT_TIER_MODELS): Obj {
  return {
    model: { provider: 'custom', base_url: routerBaseUrl, default: tierModels['os-worker'], key_env: 'OPENAI_API_KEY' },
    auxiliary: { compression: { model: tierModels['os-worker'], base_url: routerBaseUrl } },
    kanban: {
      dispatch_in_gateway: true,
      dispatch_interval_seconds: 60,
      dispatch_profiles: roster.map((p) => p.name),
      max_in_progress: 2,
      failure_limit: 2,
    },
    cron: { catch_up_missed: true },
  };
}
```

- [ ] **Step 4: Implementasi `apply.ts`**

Ekstrak penulisan config+env ke helper dan pakai untuk root setelah loop profile:
```ts
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
```
Gunakan `writeConfig(configPath, buildOverlay(spec, o.roster, o.routerBaseUrl, o.tierModels ?? DEFAULT_TIER_MODELS), o.stamp)` dan `writeEnv(envPath, { OPENAI_API_KEY: o.routerKey, HERMES_TIMEZONE: o.timezone }, o.stamp)` di dalam loop (perilaku sama seperti sekarang). Setelah loop:
```ts
  mkdirSync(o.home, { recursive: true });
  writeConfig(join(o.home, 'config.yaml'), buildRootOverlay(o.roster, o.routerBaseUrl, o.tierModels ?? DEFAULT_TIER_MODELS), o.stamp);
  writeEnv(join(o.home, '.env'), { OPENAI_API_KEY: o.routerKey, HERMES_TIMEZONE: o.timezone }, o.stamp);
  log.push('configured root (dispatcher + cron)');
```
(import `buildRootOverlay`.)

- [ ] **Step 5: Implementasi `doctor.ts`**

Hapus blok `if (spec.gateway) { … dispatcher … }` dari `checkProfile`. Tambahkan:
```ts
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
```
Di `runDoctor` (setelah `root-env`):
```ts
    ...checkRootConfig(cfg.home, cfg.routerBaseUrl, cfg.tierModels),
    await checkGatewayRunning(deps.exec),
```
(import `DEFAULT_TIER_MODELS`, `type TierModels` dari profiles.js bila belum.)

- [ ] **Step 6: Jalankan, pastikan lulus**

Run: `pnpm -F @aos/setup test` dan `pnpm -F @aos/setup typecheck`
Expected: PASS, typecheck bersih.

- [ ] **Step 7: Commit**

```bash
git add packages/setup
git commit -m "fix(setup): dispatcher and cron settings live in the root config; doctor checks root and gateway" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8 [mesin]: Terapkan & verifikasi**

```powershell
pnpm aos apply-profiles
$env:HERMES_HOME = "D:\agentic-os\hermes-home"; hermes gateway stop
Start-Process wscript.exe -ArgumentList "`"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Hermes_Gateway_787a7c01.vbs`""
# tunggu "kanban dispatcher: embedded in gateway (interval=60.0s)" di D:\agentic-os\hermes-home\logs\gateway.log
pnpm aos doctor
```
Expected: semua `[OK]`, termasuk `root:model`, `root:dispatcher`, `root:cron-catch-up`, `gateway-running`. Telegram `chief` tetap terhubung (`telegram connected (profile: chief)` di log).

---

### Task 3: `os-bridge` — model event (murni, tanpa jaringan)

**Files:**
- Create: `packages/hermes-os-bridge/os-bridge/plugin.yaml`, `packages/hermes-os-bridge/os-bridge/__init__.py`
- Test: `packages/hermes-os-bridge/test_os_bridge.py`

**Interfaces:**
- Produces (di `__init__.py`): `tool_category(name: str) -> str` (`read|write|run|other`); `redact(text: str) -> str`; `preview(value, limit=200) -> str`; `profile_name(plugin_file: str) -> str`; `build_event(hook: str, kwargs: dict, profile: str, env: dict | None = None, ts_ms: int | None = None) -> dict | None`. Task 4 menambahkan transport & `register(ctx)` ke file yang sama.

- [ ] **Step 1: Tulis test yang gagal**

`packages/hermes-os-bridge/test_os_bridge.py`:
```python
import importlib.util
import json
from pathlib import Path

PLUGIN = Path(__file__).parent / "os-bridge" / "__init__.py"


def load():
    spec = importlib.util.spec_from_file_location("aos_os_bridge", PLUGIN)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_tool_categories():
    mod = load()
    assert mod.tool_category("web_search") == "read"
    assert mod.tool_category("write_file") == "write"
    assert mod.tool_category("office_create_task") == "write"
    assert mod.tool_category("terminal") == "run"
    assert mod.tool_category("something_new") == "other"


def test_redact_masks_known_secret_shapes():
    mod = load()
    text = (
        "key sk-9df0123456789abcdef and ghp_abcdefghijklmnopqrstuvwxyz0123 "
        "Bearer abcdefghijklmnop1234 tok 1234567890:AAHabcdefghijklmnopqrstuvwxyz012345 "
        "hex 0123456789abcdef0123456789abcdef"
    )
    out = mod.redact(text)
    for secret in ("sk-9df0123456789abcdef", "ghp_abcdefghijklmnopqrstuvwxyz0123", "abcdefghijklmnop1234",
                   "AAHabcdefghijklmnopqrstuvwxyz012345", "0123456789abcdef0123456789abcdef"):
        assert secret not in out
    assert "Bearer [REDACTED]" in out


def test_preview_serialises_redacts_and_truncates():
    mod = load()
    assert mod.preview({"q": "http/3"}) == '{"q": "http/3"}'
    assert "[REDACTED]" in mod.preview({"token": "sk-abcdefghijklmnop"})
    long = mod.preview("x" * 500, limit=50)
    assert len(long) == 50 and long.endswith("…")


def test_profile_name_from_plugin_location():
    mod = load()
    path = r"D:\agentic-os\hermes-home\profiles\researcher\plugins\os-bridge\__init__.py"
    assert mod.profile_name(path) == "researcher"
    assert mod.profile_name("/tmp/elsewhere/__init__.py") == "unknown"


def test_build_event_tool_started_in_kanban_mode():
    mod = load()
    ev = mod.build_event(
        "pre_tool_call",
        {"tool_name": "web_search", "args": {"query": "http/3"}, "session_id": "s1", "tool_call_id": "c1"},
        "researcher",
        env={"HERMES_KANBAN_TASK": "t_abc"},
        ts_ms=1790000000000,
    )
    assert ev["type"] == "tool.started"
    assert ev["profile"] == "researcher" and ev["session_id"] == "s1"
    assert ev["task_id"] == "t_abc" and ev["mode"] == "kanban" and ev["ts"] == 1790000000000
    assert ev["payload"] == {"tool": "web_search", "category": "read", "tool_call_id": "c1", "args_preview": '{"query": "http/3"}'}
    assert len(ev["id"]) == 32


def test_build_event_modes_and_privacy():
    mod = load()
    start = mod.build_event("on_session_start", {"session_id": "s", "model": "COMBO-SS", "platform": "cli"}, "chief", env={})
    assert start["type"] == "session.started" and start["mode"] == "cli" and start["task_id"] is None
    assert start["payload"] == {"model": "COMBO-SS", "platform": "cli"}
    llm = mod.build_event("post_llm_call", {"session_id": "s", "turn_id": "t1", "user_message": "SECRET", "assistant_response": "SECRET"}, "chief", env={})
    assert llm["type"] == "llm.finished" and "SECRET" not in json.dumps(llm)
    done = mod.build_event("post_tool_call", {"tool_name": "terminal", "result": "SECRET", "duration_ms": 12, "status": "ok", "error_type": None, "tool_call_id": "c"}, "dev", env={})
    assert done["payload"] == {"tool": "terminal", "category": "run", "tool_call_id": "c", "duration_ms": 12, "status": "ok", "error_type": None}
    assert "SECRET" not in json.dumps(done)
    end = mod.build_event("on_session_end", {"session_id": "s", "completed": True, "failed": False, "interrupted": False, "turn_exit_reason": "done"}, "chief", env={})
    assert end["type"] == "session.ended" and end["payload"]["completed"] is True
    assert end["mode"] == "interactive"
    assert mod.build_event("pre_auxiliary_call", {}, "chief", env={}) is None
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `py -3 -m pytest packages/hermes-os-bridge -q`
Expected: FAIL — `FileNotFoundError` untuk `os-bridge/__init__.py`.

- [ ] **Step 3: Implementasi**

`packages/hermes-os-bridge/os-bridge/plugin.yaml`:
```yaml
name: os-bridge
version: "0.1.0"
description: Agentic OS - forwards session, LLM and tool lifecycle events to OS Core. Never blocks, never raises.
```

`packages/hermes-os-bridge/os-bridge/__init__.py`:
```python
"""Agentic OS bridge: forwards Hermes lifecycle and tool events to OS Core.

Never blocks a tool, never raises into Hermes, never forwards message/result content.
"""
import json
import os
import re
import time
import uuid
from pathlib import Path

READ_TOOLS = {
    "web_search", "web_extract", "read_file", "search_files", "session_search", "vision_analyze",
    "skills_list", "skill_view", "kanban_show", "kanban_list", "kanban_attachments", "office_list_tasks",
    "browser_snapshot", "browser_get_images", "browser_vision", "browser_console",
}
WRITE_TOOLS = {
    "write_file", "patch", "memory", "todo_list", "skill_manage", "cronjob_manage", "office_create_task",
    "kanban_complete", "kanban_block", "kanban_comment", "kanban_create", "kanban_link", "kanban_unblock",
    "kanban_attach", "kanban_attach_url", "kanban_heartbeat", "kanban_request_review", "kanban_request_changes",
}
RUN_TOOLS = {
    "terminal", "process_manage", "execute_code", "computer_use", "delegate_task",
    "browser_navigate", "browser_click", "browser_type", "browser_scroll", "browser_back",
    "browser_press", "browser_exec", "browser_cdp", "browser_dialog",
}

_SECRET_PATTERNS = [
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]{16,}"), r"\1[REDACTED]"),
    (re.compile(r"sk-[A-Za-z0-9_\-]{8,}"), "[REDACTED]"),
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"), "[REDACTED]"),
    (re.compile(r"xox[abprs]-[A-Za-z0-9\-]{10,}"), "[REDACTED]"),
    (re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"), "[REDACTED]"),
    (re.compile(r"\b\d{6,}:[A-Za-z0-9_\-]{30,}"), "[REDACTED]"),
    (re.compile(r"\b[a-fA-F0-9]{32,}\b"), "[REDACTED]"),
]


def tool_category(name):
    if name in READ_TOOLS:
        return "read"
    if name in WRITE_TOOLS:
        return "write"
    if name in RUN_TOOLS:
        return "run"
    return "other"


def redact(text):
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def preview(value, limit=200):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    text = redact(text)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def profile_name(plugin_file):
    parts = Path(plugin_file).parts
    if len(parts) >= 4 and parts[-3].lower() == "plugins":
        return parts[-4]
    return "unknown"


def _payload(hook, kwargs):
    name = kwargs.get("tool_name") or "?"
    if hook == "on_session_start":
        return "session.started", {"model": kwargs.get("model"), "platform": kwargs.get("platform")}
    if hook == "on_session_end":
        keys = ("completed", "failed", "interrupted", "turn_exit_reason")
        return "session.ended", {k: kwargs.get(k) for k in keys}
    if hook == "pre_llm_call":
        return "llm.started", {"turn_id": kwargs.get("turn_id"), "model": kwargs.get("model")}
    if hook == "post_llm_call":
        return "llm.finished", {"turn_id": kwargs.get("turn_id")}
    if hook == "pre_tool_call":
        return "tool.started", {
            "tool": name,
            "category": tool_category(name),
            "tool_call_id": kwargs.get("tool_call_id"),
            "args_preview": preview(kwargs.get("args") or {}),
        }
    if hook == "post_tool_call":
        return "tool.finished", {
            "tool": name,
            "category": tool_category(name),
            "tool_call_id": kwargs.get("tool_call_id"),
            "duration_ms": kwargs.get("duration_ms"),
            "status": kwargs.get("status"),
            "error_type": kwargs.get("error_type"),
        }
    return None


def build_event(hook, kwargs, profile, env=None, ts_ms=None):
    built = _payload(hook, kwargs)
    if built is None:
        return None
    event_type, payload = built
    env = os.environ if env is None else env
    task_id = env.get("HERMES_KANBAN_TASK") or None
    platform = kwargs.get("platform")
    mode = "kanban" if task_id else (str(platform) if platform else "interactive")
    return {
        "id": uuid.uuid4().hex,
        "ts": int(time.time() * 1000) if ts_ms is None else ts_ms,
        "type": event_type,
        "profile": profile,
        "session_id": kwargs.get("session_id"),
        "task_id": task_id,
        "mode": mode,
        "payload": payload,
    }
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `py -3 -m pytest packages/hermes-os-bridge -q`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add packages/hermes-os-bridge
git commit -m "feat(bridge): os-bridge event model with redaction and tool categories" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `os-bridge` — transport non-blocking, spool, dan registrasi hook

**Files:**
- Modify: `packages/hermes-os-bridge/os-bridge/__init__.py`
- Test: `packages/hermes-os-bridge/test_os_bridge.py`

**Interfaces:**
- Consumes: `build_event`, `profile_name` (Task 3).
- Produces: `class Transport(url: str, token: str, spool_path: Path, send=None, batch_size: int = 50)` dengan `enqueue(event)`, `flush_once() -> int`, `start()`; `load_settings(plugin_dir: Path, env=None) -> dict` (`core_url`, `token`, `spool`); `HOOKS` (6 nama); `register(ctx)`. Endpoint: `POST <core_url>/v1/events`, header `x-aos-bridge-token`, body JSON array of events. Config file: `<plugin_dir>/config.json` `{"core_url": "...", "token": "..."}` (ditulis `apply-profiles` di Task 5); env `AOS_CORE_URL` / `AOS_BRIDGE_TOKEN` override.

- [ ] **Step 1: Tambahkan test yang gagal**

Tambahkan ke `packages/hermes-os-bridge/test_os_bridge.py`:
```python
def _ev(mod, n):
    return mod.build_event("on_session_start", {"session_id": f"s{n}", "platform": "cli"}, "chief", env={}, ts_ms=n)


def test_transport_sends_batches(tmp_path):
    mod = load()
    sent = []
    t = mod.Transport("http://x", "tok", tmp_path / "spool.jsonl", send=lambda evs: sent.append(list(evs)) or True)
    t.enqueue(_ev(mod, 1))
    t.enqueue(_ev(mod, 2))
    assert t.flush_once() == 2
    assert [e["ts"] for e in sent[0]] == [1, 2]
    assert t.flush_once() == 0


def test_transport_spools_on_failure_and_replays(tmp_path):
    mod = load()
    spool = tmp_path / "spool.jsonl"
    ok = {"value": False}
    sent = []
    t = mod.Transport("http://x", "tok", spool, send=lambda evs: (sent.append(list(evs)) or True) if ok["value"] else False)
    t.enqueue(_ev(mod, 1))
    assert t.flush_once() == 0
    assert spool.exists() and len(spool.read_text(encoding="utf-8").splitlines()) == 1
    ok["value"] = True
    t.enqueue(_ev(mod, 2))
    assert t.flush_once() == 2
    assert [e["ts"] for e in sent[-1]] == [1, 2]
    assert not spool.exists() or spool.read_text(encoding="utf-8") == ""


def test_transport_never_raises(tmp_path):
    mod = load()

    def boom(_events):
        raise RuntimeError("network down")

    t = mod.Transport("http://x", "tok", tmp_path / "spool.jsonl", send=boom)
    t.enqueue(_ev(mod, 1))
    assert t.flush_once() == 0


def test_load_settings_prefers_env_then_config_file(tmp_path):
    mod = load()
    (tmp_path / "config.json").write_text('{"core_url": "http://127.0.0.1:7400", "token": "file-tok"}', encoding="utf-8")
    s = mod.load_settings(tmp_path, env={})
    assert s["core_url"] == "http://127.0.0.1:7400" and s["token"] == "file-tok"
    assert s["spool"] == tmp_path / "spool.jsonl"
    s2 = mod.load_settings(tmp_path, env={"AOS_CORE_URL": "http://other", "AOS_BRIDGE_TOKEN": "env-tok"})
    assert s2["core_url"] == "http://other" and s2["token"] == "env-tok"
    s3 = mod.load_settings(tmp_path / "missing", env={})
    assert s3["core_url"] == "http://127.0.0.1:7400" and s3["token"] == ""


def test_register_wires_six_hooks_that_never_raise(tmp_path, monkeypatch):
    mod = load()
    queued = []

    class FakeTransport:
        def enqueue(self, event):
            queued.append(event)

    monkeypatch.setattr(mod, "_transport", lambda: FakeTransport())
    hooks = {}

    class Ctx:
        def register_hook(self, name, fn):
            hooks[name] = fn

    mod.register(Ctx())
    assert sorted(hooks) == sorted(mod.HOOKS)
    assert hooks["pre_tool_call"](tool_name="terminal", args={"command": "ls"}, session_id="s") is None
    assert queued and queued[0]["type"] == "tool.started"

    def broken():
        raise RuntimeError("boom")

    monkeypatch.setattr(mod, "_transport", broken)
    assert hooks["on_session_end"](session_id="s") is None
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `py -3 -m pytest packages/hermes-os-bridge -q`
Expected: FAIL — `Transport`, `load_settings`, `HOOKS`, `register` belum ada.

- [ ] **Step 3: Implementasi (tambahkan ke akhir `__init__.py`; tambahkan `import atexit, queue, threading, urllib.request` di bagian import)**

```python
DEFAULT_CORE_URL = "http://127.0.0.1:7400"
HOOKS = ["on_session_start", "on_session_end", "pre_llm_call", "post_llm_call", "pre_tool_call", "post_tool_call"]
_MAX_SPOOL_BYTES = 5 * 1024 * 1024


class Transport:
    def __init__(self, url, token, spool_path, send=None, batch_size=50):
        self._url = url.rstrip("/") + "/v1/events"
        self._token = token
        self._spool = Path(spool_path)
        self._send = send or self._http_send
        self._batch_size = batch_size
        self._queue = queue.Queue(maxsize=5000)
        self._lock = threading.Lock()
        self._thread = None

    def enqueue(self, event):
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            pass

    def _http_send(self, events):
        body = json.dumps(events, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            self._url, data=body, method="POST",
            headers={"content-type": "application/json", "x-aos-bridge-token": self._token},
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            return 200 <= resp.status < 300

    def _read_spool(self):
        try:
            if not self._spool.exists():
                return []
            return [json.loads(line) for line in self._spool.read_text(encoding="utf-8").splitlines() if line.strip()]
        except Exception:
            return []

    def _append_spool(self, events):
        try:
            if self._spool.exists() and self._spool.stat().st_size > _MAX_SPOOL_BYTES:
                return
            self._spool.parent.mkdir(parents=True, exist_ok=True)
            with self._spool.open("a", encoding="utf-8") as f:
                for event in events:
                    f.write(json.dumps(event, ensure_ascii=False) + "\n")
        except Exception:
            pass

    def _clear_spool(self):
        try:
            self._spool.write_text("", encoding="utf-8")
        except Exception:
            pass

    def flush_once(self):
        with self._lock:
            batch = []
            while len(batch) < self._batch_size:
                try:
                    batch.append(self._queue.get_nowait())
                except queue.Empty:
                    break
            spooled = self._read_spool()
            events = spooled + batch
            if not events:
                return 0
            try:
                delivered = bool(self._send(events))
            except Exception:
                delivered = False
            if delivered:
                if spooled:
                    self._clear_spool()
                return len(events)
            if batch:
                self._append_spool(batch)
            return 0

    def start(self):
        if self._thread is not None:
            return

        def loop():
            while True:
                time.sleep(0.5)
                self.flush_once()

        self._thread = threading.Thread(target=loop, name="aos-os-bridge", daemon=True)
        self._thread.start()
        atexit.register(self.flush_once)


def load_settings(plugin_dir, env=None):
    env = os.environ if env is None else env
    plugin_dir = Path(plugin_dir)
    file_cfg = {}
    try:
        file_cfg = json.loads((plugin_dir / "config.json").read_text(encoding="utf-8"))
    except Exception:
        file_cfg = {}
    return {
        "core_url": env.get("AOS_CORE_URL") or file_cfg.get("core_url") or DEFAULT_CORE_URL,
        "token": env.get("AOS_BRIDGE_TOKEN") or file_cfg.get("token") or "",
        "spool": plugin_dir / "spool.jsonl",
    }


_TRANSPORT = None


def _transport():
    global _TRANSPORT
    if _TRANSPORT is None:
        settings = load_settings(Path(__file__).resolve().parent)
        _TRANSPORT = Transport(settings["core_url"], settings["token"], settings["spool"])
        _TRANSPORT.start()
    return _TRANSPORT


def _make_hook(hook, profile):
    def callback(*args, **kwargs):
        try:
            event = build_event(hook, kwargs, profile)
            if event is not None:
                _transport().enqueue(event)
        except Exception:
            pass
        return None

    return callback


def register(ctx):
    profile = profile_name(str(Path(__file__).resolve()))
    for hook in HOOKS:
        try:
            ctx.register_hook(hook, _make_hook(hook, profile))
        except Exception:
            pass
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `py -3 -m pytest packages -q`
Expected: semua lulus (`test_os_bridge.py` 11 test + test plugin lain).

- [ ] **Step 5: Commit**

```bash
git add packages/hermes-os-bridge
git commit -m "feat(bridge): non-blocking transport with spool and hook registration" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `apply-profiles` memasang plugin, key 9Router per profile, dan config bridge

**Files:**
- Modify: `packages/setup/src/profiles.ts`, `packages/setup/src/apply.ts`, `packages/setup/src/doctor.ts`, `packages/setup/src/cli.ts`
- Create: `infra/windows/set-local-secrets.ps1`
- Test: `packages/setup/test/profiles.test.ts`, `packages/setup/test/apply.test.ts`, `packages/setup/test/doctor.test.ts`

**Interfaces:**
- Consumes: plugin source dirs `packages/hermes-os-bridge/os-bridge` (Task 3–4) dan `packages/hermes-office-tools/aos-office-tools` (M1).
- Produces:
  - `routerKeysFromEnv(env: NodeJS.ProcessEnv, roster: ProfileSpec[]): Record<string, string>` — `AOS_ROUTER_KEY_<NAMA_UPPER>` yang terisi.
  - `pluginsFor(spec: ProfileSpec): string[]` → `['os-bridge']` + `'aos-office-tools'` untuk profile gateway.
  - `ApplyOptions` bertambah `routerKeys?: Record<string, string>`, `pluginSources?: Record<string, string>` (nama plugin → folder sumber), `bridge?: { coreUrl: string; token: string }`.
  - Untuk tiap profile: `.env` `OPENAI_API_KEY = routerKeys[name] ?? routerKey`; salin `plugin.yaml` + `__init__.py` tiap plugin ke `<profile>\plugins\<nama>\`; untuk `os-bridge` tulis `config.json` `{core_url, token}`; jalankan `hermes -p <profile> plugins enable <nama>` (gagal → throw). Log: `installed plugins <a,b> for <profile>`.
  - `DoctorConfig` bertambah `routerKeys?: Record<string, string>`; `checkProfile(home, spec, routerBaseUrl, routerKey, tierModels?, routerKeys?)` memakai key per profile; baris baru `profile:<name>:plugins` (file plugin ada + `config.json` os-bridge punya `core_url` & token tidak kosong; detail tidak pernah memuat token).
  - CLI membaca `AOS_ROUTER_KEY_*`, `AOS_CORE_URL` (default `http://127.0.0.1:7400`), `AOS_BRIDGE_TOKEN` (wajib untuk `apply-profiles`).

- [ ] **Step 1: Tulis test yang gagal**

`profiles.test.ts`:
```ts
describe('routerKeysFromEnv / pluginsFor', () => {
  const roster = loadRoster(ROSTER);
  it('reads per-profile router keys by upper-cased profile name', () => {
    expect(routerKeysFromEnv({ AOS_ROUTER_KEY_CHIEF: ' kc ', AOS_ROUTER_KEY_DEV: '', OTHER: 'x' }, roster)).toEqual({ chief: 'kc' });
  });
  it('gives every profile os-bridge and the gateway profile the office tools', () => {
    expect(pluginsFor(roster[0])).toEqual(['os-bridge', 'aos-office-tools']);
    expect(pluginsFor(roster[1])).toEqual(['os-bridge']);
  });
});
```

`apply.test.ts` — tambahkan helper dan test:
```ts
function pluginSources(): Record<string, string> {
  const root = mkdtempSync(join(tmpdir(), 'aos-plugsrc-'));
  for (const name of ['os-bridge', 'aos-office-tools']) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, 'plugin.yaml'), `name: ${name}\n`);
    writeFileSync(join(root, name, '__init__.py'), `# ${name}\n`);
    mkdirSync(join(root, name, '__pycache__'), { recursive: true });
  }
  return { 'os-bridge': join(root, 'os-bridge'), 'aos-office-tools': join(root, 'aos-office-tools') };
}

  it('installs and enables plugins, writes bridge config and per-profile keys', async () => {
    const { home, calls, opts } = setup();
    await applyProfiles({
      ...opts,
      routerKeys: { chief: 'rk-chief' },
      pluginSources: pluginSources(),
      bridge: { coreUrl: 'http://127.0.0.1:7400', token: 'bt' },
    });
    const dir = profileDir(home, 'chief');
    expect(readFileSync(join(dir, '.env'), 'utf8')).toContain('OPENAI_API_KEY=rk-chief\n');
    expect(readFileSync(join(dir, 'plugins', 'os-bridge', '__init__.py'), 'utf8')).toBe('# os-bridge\n');
    expect(existsSync(join(dir, 'plugins', 'os-bridge', '__pycache__'))).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, 'plugins', 'os-bridge', 'config.json'), 'utf8'))).toEqual({ core_url: 'http://127.0.0.1:7400', token: 'bt' });
    expect(existsSync(join(dir, 'plugins', 'aos-office-tools', 'plugin.yaml'))).toBe(true);
    expect(calls).toContainEqual(['hermes', '-p', 'chief', 'plugins', 'enable', 'os-bridge']);
    expect(calls).toContainEqual(['hermes', '-p', 'chief', 'plugins', 'enable', 'aos-office-tools']);
  });

  it('throws when enabling a plugin fails', async () => {
    const { opts } = setup();
    const exec: Exec = async (cmd, args) => (args.includes('enable') ? { code: 1, stdout: '', stderr: 'nope' } : opts.exec(cmd, args));
    await expect(
      applyProfiles({ ...opts, exec, pluginSources: pluginSources(), bridge: { coreUrl: 'u', token: 't' } }),
    ).rejects.toThrow(/plugins enable os-bridge failed: nope/);
  });
```
(Fake `exec` di `setup()` saat ini selalu membuat folder profile untuk `args[2]`; ubah agar hanya bertindak saat `args[0] === 'profile'`, dan untuk perintah lain cukup `return { code: 0, stdout: '', stderr: '' }` sambil tetap mencatat `calls`. Sesuaikan ekspektasi `calls` di test pertama menjadi `expect(calls[0]).toEqual(['hermes', 'profile', 'create', 'chief', '--description', 'Boss'])`.)

`doctor.test.ts` — di `healthyHome()`, untuk tiap profile buat plugin yang diharapkan:
```ts
    for (const plugin of pluginsFor(spec)) {
      mkdirSync(join(dir, 'plugins', plugin), { recursive: true });
      writeFileSync(join(dir, 'plugins', plugin, '__init__.py'), '#\n');
    }
    writeFileSync(join(dir, 'plugins', 'os-bridge', 'config.json'), JSON.stringify({ core_url: 'http://127.0.0.1:7400', token: 'bt' }));
```
Ubah ekspektasi `'passes for a correctly applied profile'` menjadi 5 baris (tambahkan `['profile:chief:plugins', true]` di akhir). Tambahkan:
```ts
  it('uses the per-profile router key when one is configured', () => {
    const home = healthyHome();
    writeFileSync(join(profileDir(home, 'chief'), '.env'), 'OPENAI_API_KEY=rk-chief\n');
    const byName = Object.fromEntries(checkProfile(home, roster[0], BASE, 'rk', undefined, { chief: 'rk-chief' }).map((r) => [r.name, r]));
    expect(byName['profile:chief:router-key'].ok).toBe(true);
  });
  it('flags a missing plugin and an empty bridge token without printing it', () => {
    const home = healthyHome();
    writeFileSync(join(profileDir(home, 'chief'), 'plugins', 'os-bridge', 'config.json'), JSON.stringify({ core_url: 'u', token: '' }));
    rmSync(join(profileDir(home, 'chief'), 'plugins', 'aos-office-tools'), { recursive: true });
    const row = checkProfile(home, roster[0], BASE, 'rk').find((r) => r.name === 'profile:chief:plugins');
    expect(row).toMatchObject({ ok: false });
    expect(row?.detail).toMatch(/aos-office-tools/);
    expect(row?.detail).toMatch(/bridge token/);
  });
```
(import `rmSync`, `pluginsFor`.)

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm -F @aos/setup test`
Expected: FAIL — `routerKeysFromEnv`, `pluginsFor`, opsi `pluginSources`/`bridge`/`routerKeys` belum ada.

- [ ] **Step 3: Implementasi `profiles.ts`**

```ts
export function routerKeysFromEnv(env: NodeJS.ProcessEnv, roster: ProfileSpec[]): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const spec of roster) {
    const value = env[`AOS_ROUTER_KEY_${spec.name.toUpperCase()}`]?.trim();
    if (value) keys[spec.name] = value;
  }
  return keys;
}

export function pluginsFor(spec: ProfileSpec): string[] {
  return spec.gateway ? ['os-bridge', 'aos-office-tools'] : ['os-bridge'];
}
```

- [ ] **Step 4: Implementasi `apply.ts`**

Tambahkan ke `ApplyOptions`:
```ts
  routerKeys?: Record<string, string>;
  pluginSources?: Record<string, string>;
  bridge?: { coreUrl: string; token: string };
```
Tambahkan helper:
```ts
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
```
Di loop profile: ganti `OPENAI_API_KEY: o.routerKey` menjadi `OPENAI_API_KEY: o.routerKeys?.[spec.name] ?? o.routerKey`; setelah menulis SOUL.md:
```ts
    const installed = await installPlugins(o, spec, dir);
    if (installed) log.push(installed);
```
(import `pluginsFor`.)

- [ ] **Step 5: Implementasi `doctor.ts`**

Tambahkan `routerKeys?: Record<string, string>` ke `DoctorConfig`. Ubah signature `checkProfile(home, spec, routerBaseUrl, routerKey, tierModels = DEFAULT_TIER_MODELS, routerKeys: Record<string, string> = {})`; baris router-key memakai `const expectedKey = routerKeys[spec.name] ?? routerKey;`. Tambahkan di akhir hasil `checkProfile` (sebelum `return`):
```ts
  const pluginProblems: string[] = [];
  for (const plugin of pluginsFor(spec)) {
    if (!existsSync(join(dir, 'plugins', plugin, '__init__.py'))) pluginProblems.push(`missing ${plugin}`);
  }
  try {
    const bridgeCfg = JSON.parse(readText(join(dir, 'plugins', 'os-bridge', 'config.json')) || '{}') as { core_url?: string; token?: string };
    if (!bridgeCfg.core_url) pluginProblems.push('bridge core_url missing');
    if (!bridgeCfg.token) pluginProblems.push('bridge token missing');
  } catch {
    pluginProblems.push('bridge config.json unreadable');
  }
  results.push({
    name: `${label}:plugins`,
    ok: pluginProblems.length === 0,
    detail: pluginProblems.length ? pluginProblems.join('; ') : `${pluginsFor(spec).join(', ')} installed`,
  });
```
`runDoctor` meneruskan `cfg.routerKeys` ke `checkProfile`. (import `pluginsFor`.)

- [ ] **Step 6: Implementasi `cli.ts`**

Setelah `tierModels`:
```ts
const routerKeys = routerKeysFromEnv(process.env, roster);
const coreUrl = process.env.AOS_CORE_URL ?? 'http://127.0.0.1:7400';
const pluginSources = {
  'os-bridge': join(repoRoot, 'packages/hermes-os-bridge/os-bridge'),
  'aos-office-tools': join(repoRoot, 'packages/hermes-office-tools/aos-office-tools'),
};
```
(Jika `roster` saat ini dimuat di dalam `main`, letakkan baris ini di dalam `main` setelah `roster`.) Di `apply-profiles` tambahkan `routerKeys, pluginSources, bridge: { coreUrl, token: required('AOS_BRIDGE_TOKEN') }`; di `doctor` tambahkan `routerKeys`. (import `routerKeysFromEnv`.)

- [ ] **Step 7: Skrip rahasia lokal**

`infra/windows/set-local-secrets.ps1`:
```powershell
# Mengisi key 9Router per profile + token Agentic OS ke .env.local tanpa menampilkan nilainya.
param([string]$EnvFile = (Join-Path $PSScriptRoot "..\..\.env.local"))
$ErrorActionPreference = "Stop"
$EnvFile = [IO.Path]::GetFullPath($EnvFile)

function Set-EnvLine([string]$Name, [string]$Value) {
  $lines = if (Test-Path $EnvFile) { [IO.File]::ReadAllLines($EnvFile) } else { @() }
  $found = $false
  $out = foreach ($l in $lines) { if ($l -match "^$Name=") { $found = $true; "$Name=$Value" } else { $l } }
  if (-not $found) { $out = @($out) + "$Name=$Value" }
  [IO.File]::WriteAllLines($EnvFile, [string[]]$out)
}

function New-Token {
  $b = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ($b | ForEach-Object { $_.ToString("x2") }) -join ""
}

foreach ($p in "CHIEF", "RESEARCHER", "SECRETARY", "CONTENT", "DEV") {
  $s = Read-Host "API key 9Router 'aos-$($p.ToLower())' (Enter = lewati)" -AsSecureString
  $v = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
  if ($v) { Set-EnvLine "AOS_ROUTER_KEY_$p" $v }
}
foreach ($t in "AOS_BRIDGE_TOKEN", "AOS_UI_TOKEN") {
  $has = (Test-Path $EnvFile) -and (Select-String -Path $EnvFile -Pattern "^$t=.+" -Quiet)
  if (-not $has) { Set-EnvLine $t (New-Token) }
}
if (-not (Select-String -Path $EnvFile -Pattern "^AOS_CORE_URL=" -Quiet)) { Set-EnvLine "AOS_CORE_URL" "http://127.0.0.1:7400" }
Write-Output "OK: $EnvFile diperbarui (nilai tidak ditampilkan)."
```
Tambahkan ke `.env.local.example`:
```ini
# M2: key 9Router per profile (opsional, untuk biaya per agent) + token bridge/UI — isi via infra/windows/set-local-secrets.ps1
# AOS_ROUTER_KEY_CHIEF=
# AOS_ROUTER_KEY_RESEARCHER=
# AOS_ROUTER_KEY_SECRETARY=
# AOS_ROUTER_KEY_CONTENT=
# AOS_ROUTER_KEY_DEV=
# AOS_CORE_URL=http://127.0.0.1:7400
# AOS_BRIDGE_TOKEN=
# AOS_UI_TOKEN=
```

- [ ] **Step 8: Jalankan test**

Run: `pnpm -F @aos/setup test` dan `pnpm -F @aos/setup typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/setup infra/windows/set-local-secrets.ps1 .env.local.example
git commit -m "feat(setup): apply-profiles installs os-bridge/office plugins with per-profile router keys" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10 [mesin, owner]: Key per profile & token**

Owner, di dashboard 9Router → Endpoint → **Create Key** lima kali: `aos-chief`, `aos-researcher`, `aos-secretary`, `aos-content`, `aos-dev`. Lalu di PowerShell owner:
```powershell
powershell -ExecutionPolicy Bypass -File "D:\MIT\CLAUDE CODE PROJECT\agentic OS\infra\windows\set-local-secrets.ps1"
```
(Tempel tiap key di prompt — tidak tampil di layar, tidak lewat chat.)

- [ ] **Step 11 [mesin]: Terapkan**

```powershell
pnpm aos apply-profiles
$env:HERMES_HOME = "D:\agentic-os\hermes-home"; hermes gateway stop
Start-Process wscript.exe -ArgumentList "`"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Hermes_Gateway_787a7c01.vbs`""
pnpm aos doctor
```
Expected: semua `[OK]` (termasuk `profile:*:plugins`, `profile:*:router-key`). Core belum jalan — bridge menulis ke `spool.jsonl` per profile (normal sampai Task 11).

---

### Task 6: OS Core — scaffold, config, dan database

**Files:**
- Create: `apps/core/package.json`, `apps/core/tsconfig.json`, `apps/core/src/config.ts`, `apps/core/src/db.ts`
- Modify: `pnpm-workspace.yaml` (allowBuilds `better-sqlite3`)
- Test: `apps/core/test/config.test.ts`, `apps/core/test/db.test.ts`

**Interfaces:**
- Produces:
  - `PROFILES = ['chief', 'researcher', 'secretary', 'content', 'dev'] as const`
  - `interface CoreConfig { host: '127.0.0.1'; port: number; dbPath: string; bridgeToken: string; uiToken: string; hermesHome: string; kanbanDbPath: string; routerDbPath: string; routerKeyProfiles: Map<string, string> }`
  - `loadCoreConfig(env: NodeJS.ProcessEnv): CoreConfig`
  - `type Db = Database.Database` (better-sqlite3); `openCoreDb(path: string): Db` (buat folder, WAL, migrate); `migrate(db: Db): void`
  - Tabel: `events`, `agent_state`, `llm_usage`, `cursors` (skema di Step 3).

- [ ] **Step 1: Scaffold paket**

`apps/core/package.json`:
```json
{
  "name": "@aos/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "start": "tsx src/main.ts"
  }
}
```
`apps/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```
Di `pnpm-workspace.yaml`, tambahkan `better-sqlite3: true` di bawah `allowBuilds:`.
```powershell
pnpm -F @aos/core add fastify @fastify/websocket zod better-sqlite3
pnpm -F @aos/core add -D vitest typescript tsx ws @types/node @types/better-sqlite3 @types/ws
```
Expected: instalasi sukses; `node -e "require('better-sqlite3')"` dijalankan dari `apps/core` tidak error. **Jika** build native `better-sqlite3` gagal (tidak ada prebuilt untuk Node ini), laporkan BLOCKED beserta log error — jangan mengganti library tanpa ruling.

- [ ] **Step 2: Tulis test yang gagal**

`apps/core/test/config.test.ts`:
```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCoreConfig } from '../src/config.js';

const BASE_ENV = {
  AOS_HERMES_HOME: 'D:\\agentic-os\\hermes-home',
  AOS_BRIDGE_TOKEN: 'bt',
  AOS_UI_TOKEN: 'ut',
  APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
};

describe('loadCoreConfig', () => {
  it('derives paths and always binds to localhost', () => {
    const c = loadCoreConfig(BASE_ENV);
    expect(c.host).toBe('127.0.0.1');
    expect(c.port).toBe(7400);
    expect(c.kanbanDbPath).toBe(join('D:\\agentic-os\\hermes-home', 'kanban.db'));
    expect(c.dbPath).toBe(join('D:\\agentic-os\\hermes-home', '..', 'core', 'core.db'));
    expect(c.routerDbPath).toBe(join('C:\\Users\\me\\AppData\\Roaming', '9router', 'db', 'data.sqlite'));
  });

  it('maps router keys to profiles without exposing them elsewhere', () => {
    const c = loadCoreConfig({ ...BASE_ENV, AOS_ROUTER_KEY: 'shared-k', AOS_ROUTER_KEY_CHIEF: 'chief-k', AOS_CORE_PORT: '7411' });
    expect(c.port).toBe(7411);
    expect(c.routerKeyProfiles.get('chief-k')).toBe('chief');
    expect(c.routerKeyProfiles.get('shared-k')).toBe('shared');
  });

  it('requires the home and both tokens', () => {
    expect(() => loadCoreConfig({ ...BASE_ENV, AOS_BRIDGE_TOKEN: '' })).toThrow(/AOS_BRIDGE_TOKEN/);
    expect(() => loadCoreConfig({ ...BASE_ENV, AOS_UI_TOKEN: undefined })).toThrow(/AOS_UI_TOKEN/);
    expect(() => loadCoreConfig({ ...BASE_ENV, AOS_HERMES_HOME: '' })).toThrow(/AOS_HERMES_HOME/);
  });
});
```
`apps/core/test/db.test.ts`:
```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrate, openCoreDb } from '../src/db.js';

describe('openCoreDb', () => {
  it('creates the folder and all tables, idempotently', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'aos-core-')), 'nested', 'core.db');
    const db = openCoreDb(path);
    migrate(db);
    const names = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as Array<{ name: string }>).map((r) => r.name);
    expect(names).toEqual(expect.arrayContaining(['agent_state', 'cursors', 'events', 'llm_usage']));
    db.close();
  });
});
```

- [ ] **Step 3: Implementasi**

`apps/core/src/config.ts`:
```ts
import { join } from 'node:path';

export const PROFILES = ['chief', 'researcher', 'secretary', 'content', 'dev'] as const;

export interface CoreConfig {
  host: '127.0.0.1';
  port: number;
  dbPath: string;
  bridgeToken: string;
  uiToken: string;
  hermesHome: string;
  kanbanDbPath: string;
  routerDbPath: string;
  routerKeyProfiles: Map<string, string>;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} (set it in .env.local)`);
  return value;
}

export function loadCoreConfig(env: NodeJS.ProcessEnv): CoreConfig {
  const hermesHome = required(env, 'AOS_HERMES_HOME');
  const routerKeyProfiles = new Map<string, string>();
  const shared = env.AOS_ROUTER_KEY?.trim();
  if (shared) routerKeyProfiles.set(shared, 'shared');
  for (const profile of PROFILES) {
    const key = env[`AOS_ROUTER_KEY_${profile.toUpperCase()}`]?.trim();
    if (key) routerKeyProfiles.set(key, profile);
  }
  return {
    host: '127.0.0.1',
    port: Number(env.AOS_CORE_PORT ?? 7400),
    dbPath: env.AOS_CORE_DB?.trim() || join(hermesHome, '..', 'core', 'core.db'),
    bridgeToken: required(env, 'AOS_BRIDGE_TOKEN'),
    uiToken: required(env, 'AOS_UI_TOKEN'),
    hermesHome,
    kanbanDbPath: join(hermesHome, 'kanban.db'),
    routerDbPath: env.AOS_ROUTER_DB?.trim() || join(env.APPDATA ?? '', '9router', 'db', 'data.sqlite'),
    routerKeyProfiles,
  };
}
```
`apps/core/src/db.ts`:
```ts
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  profile TEXT NOT NULL,
  session_id TEXT,
  task_id TEXT,
  mode TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_profile_ts ON events(profile, ts);
CREATE INDEX IF NOT EXISTS idx_events_task_ts ON events(task_id, ts);
CREATE TABLE IF NOT EXISTS agent_state (
  profile TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  task_id TEXT,
  session_id TEXT,
  detail TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS llm_usage (
  router_id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,
  provider TEXT,
  model TEXT,
  profile TEXT NOT NULL,
  task_id TEXT,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  status TEXT
);
CREATE INDEX IF NOT EXISTS idx_usage_ts ON llm_usage(ts);
CREATE TABLE IF NOT EXISTS cursors (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
`;

export function migrate(db: Db): void {
  db.exec(SCHEMA);
}

export function openCoreDb(path: string): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `pnpm -F @aos/core test` dan `pnpm -F @aos/core typecheck`
Expected: 4 test PASS, typecheck bersih.

- [ ] **Step 5: Commit**

```bash
git add apps/core pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(core): scaffold OS Core with config and SQLite schema" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: OS Core — ingest event & proyeksi state agent

**Files:**
- Create: `apps/core/src/events.ts`, `apps/core/src/state.ts`
- Test: `apps/core/test/events.test.ts`, `apps/core/test/state.test.ts`

**Interfaces:**
- Consumes: `Db`, `openCoreDb` (Task 6), `PROFILES`.
- Produces:
  - `EVENT_TYPES` (6 tipe), `EventSchema` (zod), `type AosEvent`
  - `ingestEvents(db: Db, raw: unknown): { accepted: AosEvent[]; inserted: number; duplicates: number; rejected: number }` — `raw` harus array (≤ 500) else throw `Error('events must be an array of at most 500 items')`; `accepted` = event yang baru tersimpan (urutan input); memanggil `projectState` untuk tiap event baru.
  - `type AgentStateName = 'idle' | 'thinking' | 'typing' | 'reading' | 'running' | 'offline'`
  - `interface AgentState { profile: string; state: AgentStateName; task_id: string | null; session_id: string | null; detail: string | null; updated_at: number | null }`
  - `nextState(ev: AosEvent): { state: AgentStateName; detail: string | null }`
  - `projectState(db: Db, ev: AosEvent): void` (upsert, tidak menimpa state yang lebih baru)
  - `listAgentStates(db: Db): AgentState[]` — selalu berisi kelima `PROFILES` (urut sesuai `PROFILES`), profile tanpa data = `offline`, ditambah profile lain yang tercatat.

- [ ] **Step 1: Tulis test yang gagal**

`apps/core/test/state.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { openCoreDb } from '../src/db.js';
import type { AosEvent } from '../src/events.js';
import { listAgentStates, nextState, projectState } from '../src/state.js';

function ev(type: AosEvent['type'], payload: Record<string, unknown>, ts = 1, profile = 'researcher'): AosEvent {
  return { id: `e${ts}${type}`, ts, type, profile, session_id: 's', task_id: 't_1', mode: 'kanban', payload };
}

describe('nextState', () => {
  it('maps events to the PRD animation states', () => {
    expect(nextState(ev('llm.started', { model: 'COMBO-SS' }))).toEqual({ state: 'thinking', detail: 'COMBO-SS' });
    expect(nextState(ev('tool.started', { tool: 'web_search', category: 'read' })).state).toBe('reading');
    expect(nextState(ev('tool.started', { tool: 'write_file', category: 'write' })).state).toBe('typing');
    expect(nextState(ev('tool.started', { tool: 'terminal', category: 'run' })).state).toBe('running');
    expect(nextState(ev('tool.started', { tool: 'x', category: 'other' })).state).toBe('thinking');
    expect(nextState(ev('tool.finished', { tool: 'terminal' })).state).toBe('thinking');
    expect(nextState(ev('llm.finished', {})).state).toBe('idle');
    expect(nextState(ev('session.started', {})).state).toBe('idle');
    expect(nextState(ev('session.ended', {})).state).toBe('idle');
  });
});

describe('projectState / listAgentStates', () => {
  it('keeps the newest state per profile and lists all profiles', () => {
    const db = openCoreDb(':memory:');
    projectState(db, ev('tool.started', { tool: 'terminal', category: 'run' }, 20));
    projectState(db, ev('llm.started', { model: 'm' }, 10));
    const states = listAgentStates(db);
    expect(states.map((s) => s.profile)).toEqual(['chief', 'researcher', 'secretary', 'content', 'dev']);
    expect(states[1]).toEqual({ profile: 'researcher', state: 'running', task_id: 't_1', session_id: 's', detail: 'terminal', updated_at: 20 });
    expect(states[0]).toEqual({ profile: 'chief', state: 'offline', task_id: null, session_id: null, detail: null, updated_at: null });
  });
});
```
`apps/core/test/events.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { openCoreDb } from '../src/db.js';
import { ingestEvents } from '../src/events.js';
import { listAgentStates } from '../src/state.js';

const good = {
  id: 'a'.repeat(32),
  ts: 1790000000000,
  type: 'tool.started',
  profile: 'researcher',
  session_id: 's1',
  task_id: 't_1',
  mode: 'kanban',
  payload: { tool: 'web_search', category: 'read', args_preview: '{}' },
};

describe('ingestEvents', () => {
  it('stores valid events once and projects state', () => {
    const db = openCoreDb(':memory:');
    const first = ingestEvents(db, [good, { ...good, id: 'b'.repeat(32), type: 'nope' }]);
    expect(first).toMatchObject({ inserted: 1, duplicates: 0, rejected: 1 });
    expect(first.accepted.map((e) => e.id)).toEqual([good.id]);
    const again = ingestEvents(db, [good]);
    expect(again).toMatchObject({ inserted: 0, duplicates: 1, rejected: 0, accepted: [] });
    const row = db.prepare('SELECT payload FROM events WHERE id = ?').get(good.id) as { payload: string };
    expect(JSON.parse(row.payload)).toEqual(good.payload);
    expect(listAgentStates(db)[1].state).toBe('reading');
  });

  it('accepts null session/task ids and rejects non-arrays or huge batches', () => {
    const db = openCoreDb(':memory:');
    expect(ingestEvents(db, [{ ...good, id: 'c'.repeat(32), session_id: null, task_id: null }]).inserted).toBe(1);
    expect(() => ingestEvents(db, { not: 'array' })).toThrow(/array/);
    expect(() => ingestEvents(db, new Array(501).fill(good))).toThrow(/500/);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm -F @aos/core test`
Expected: FAIL — modul `events.js`/`state.js` belum ada.

- [ ] **Step 3: Implementasi**

`apps/core/src/events.ts`:
```ts
import { z } from 'zod';
import type { Db } from './db.js';
import { projectState } from './state.js';

export const EVENT_TYPES = ['session.started', 'session.ended', 'llm.started', 'llm.finished', 'tool.started', 'tool.finished'] as const;

export const EventSchema = z.object({
  id: z.string().min(8).max(64),
  ts: z.number().int().nonnegative(),
  type: z.enum(EVENT_TYPES),
  profile: z.string().min(1).max(64),
  session_id: z.string().max(128).nullable().optional(),
  task_id: z.string().max(64).nullable().optional(),
  mode: z.string().min(1).max(32),
  payload: z.record(z.string(), z.unknown()),
});

export type AosEvent = z.infer<typeof EventSchema>;

export function ingestEvents(db: Db, raw: unknown): { accepted: AosEvent[]; inserted: number; duplicates: number; rejected: number } {
  if (!Array.isArray(raw) || raw.length > 500) throw new Error('events must be an array of at most 500 items');
  const insert = db.prepare(
    'INSERT OR IGNORE INTO events (id, ts, type, profile, session_id, task_id, mode, payload) VALUES (@id, @ts, @type, @profile, @session_id, @task_id, @mode, @payload)',
  );
  const result = { accepted: [] as AosEvent[], inserted: 0, duplicates: 0, rejected: 0 };
  db.transaction(() => {
    for (const item of raw) {
      const parsed = EventSchema.safeParse(item);
      if (!parsed.success) {
        result.rejected += 1;
        continue;
      }
      const ev = parsed.data;
      const info = insert.run({
        id: ev.id,
        ts: ev.ts,
        type: ev.type,
        profile: ev.profile,
        session_id: ev.session_id ?? null,
        task_id: ev.task_id ?? null,
        mode: ev.mode,
        payload: JSON.stringify(ev.payload),
      });
      if (info.changes === 1) {
        result.inserted += 1;
        result.accepted.push(ev);
        projectState(db, ev);
      } else {
        result.duplicates += 1;
      }
    }
  })();
  return result;
}
```
`apps/core/src/state.ts`:
```ts
import { PROFILES } from './config.js';
import type { Db } from './db.js';
import type { AosEvent } from './events.js';

export type AgentStateName = 'idle' | 'thinking' | 'typing' | 'reading' | 'running' | 'offline';

export interface AgentState {
  profile: string;
  state: AgentStateName;
  task_id: string | null;
  session_id: string | null;
  detail: string | null;
  updated_at: number | null;
}

const CATEGORY_STATE: Record<string, AgentStateName> = { read: 'reading', write: 'typing', run: 'running' };

export function nextState(ev: AosEvent): { state: AgentStateName; detail: string | null } {
  const p = ev.payload as Record<string, unknown>;
  switch (ev.type) {
    case 'llm.started':
      return { state: 'thinking', detail: typeof p.model === 'string' ? p.model : null };
    case 'tool.started':
      return { state: CATEGORY_STATE[String(p.category)] ?? 'thinking', detail: typeof p.tool === 'string' ? p.tool : null };
    case 'tool.finished':
      return { state: 'thinking', detail: typeof p.tool === 'string' ? p.tool : null };
    default:
      return { state: 'idle', detail: null };
  }
}

export function projectState(db: Db, ev: AosEvent): void {
  const next = nextState(ev);
  db.prepare(
    `INSERT INTO agent_state (profile, state, task_id, session_id, detail, updated_at)
     VALUES (@profile, @state, @task_id, @session_id, @detail, @ts)
     ON CONFLICT(profile) DO UPDATE SET state = excluded.state, task_id = excluded.task_id,
       session_id = excluded.session_id, detail = excluded.detail, updated_at = excluded.updated_at
     WHERE excluded.updated_at >= agent_state.updated_at`,
  ).run({ profile: ev.profile, state: next.state, task_id: ev.task_id ?? null, session_id: ev.session_id ?? null, detail: next.detail, ts: ev.ts });
}

export function listAgentStates(db: Db): AgentState[] {
  const rows = db.prepare('SELECT profile, state, task_id, session_id, detail, updated_at FROM agent_state').all() as AgentState[];
  const byProfile = new Map(rows.map((r) => [r.profile, r]));
  const known: AgentState[] = PROFILES.map(
    (profile) => byProfile.get(profile) ?? { profile, state: 'offline', task_id: null, session_id: null, detail: null, updated_at: null },
  );
  const extra = rows.filter((r) => !(PROFILES as readonly string[]).includes(r.profile));
  return [...known, ...extra];
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `pnpm -F @aos/core test` dan `pnpm -F @aos/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/core
git commit -m "feat(core): event ingest with validation and agent state projection" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: OS Core — pembaca kanban read-only

**Files:**
- Create: `apps/core/src/kanban.ts`
- Test: `apps/core/test/kanban.test.ts`

**Interfaces:**
- Produces:
  - `interface KanbanTask { id: string; title: string; assignee: string | null; status: string; created_at: number; started_at: number | null; completed_at: number | null; workspace_kind: string | null; workspace_path: string | null }` (epoch detik, sesuai Hermes)
  - `interface KanbanRun { id: number; task_id: string; profile: string | null; status: string; started_at: number | null; ended_at: number | null; outcome: string | null }`
  - `interface KanbanSnapshot { tasks: KanbanTask[]; runs: KanbanRun[] }`
  - `readKanban(path: string): KanbanSnapshot` — file tidak ada → `{tasks: [], runs: []}`; buka `readonly` + `fileMustExist`, tutup setelah baca; maksimal 500 task terbaru (`created_at DESC`) dan 2000 run terbaru (`id DESC`).
  - `interface KanbanChange { id: string; change: 'added' | 'removed' | 'status'; status?: string; previous?: string }`
  - `diffTasks(prev: KanbanTask[], next: KanbanTask[]): KanbanChange[]`

- [ ] **Step 1: Tulis test yang gagal**

`apps/core/test/kanban.test.ts`:
```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { diffTasks, readKanban, type KanbanTask } from '../src/kanban.js';

function fakeKanban(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'aos-kb-')), 'kanban.db');
  const db = new Database(path);
  db.exec(`CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, body TEXT, assignee TEXT, status TEXT, priority INTEGER,
             created_by TEXT, created_at INTEGER, started_at INTEGER, completed_at INTEGER, workspace_kind TEXT, workspace_path TEXT);
           CREATE TABLE task_runs (id INTEGER PRIMARY KEY, task_id TEXT, profile TEXT, step_key TEXT, status TEXT,
             started_at INTEGER, ended_at INTEGER, outcome TEXT);`);
  db.prepare("INSERT INTO tasks VALUES ('t_1','Riset','b','researcher','done',0,'user',100,110,150,'dir','D:\\w\\1')").run();
  db.prepare("INSERT INTO tasks VALUES ('t_2','Draft','b','content','ready',0,'user',200,NULL,NULL,'scratch',NULL)").run();
  db.prepare("INSERT INTO task_runs VALUES (1,'t_1','researcher',NULL,'done',110,150,'completed')").run();
  db.close();
  return path;
}

describe('readKanban', () => {
  it('reads tasks newest first and runs', () => {
    const snap = readKanban(fakeKanban());
    expect(snap.tasks.map((t) => t.id)).toEqual(['t_2', 't_1']);
    expect(snap.tasks[1]).toEqual({
      id: 't_1', title: 'Riset', assignee: 'researcher', status: 'done', created_at: 100, started_at: 110,
      completed_at: 150, workspace_kind: 'dir', workspace_path: 'D:\\w\\1',
    });
    expect(snap.runs).toEqual([{ id: 1, task_id: 't_1', profile: 'researcher', status: 'done', started_at: 110, ended_at: 150, outcome: 'completed' }]);
  });
  it('returns an empty snapshot when the board does not exist', () => {
    expect(readKanban(join(tmpdir(), 'no-such-aos-kanban.db'))).toEqual({ tasks: [], runs: [] });
  });
});

describe('diffTasks', () => {
  const t = (id: string, status: string): KanbanTask => ({
    id, title: id, assignee: null, status, created_at: 1, started_at: null, completed_at: null, workspace_kind: null, workspace_path: null,
  });
  it('reports added, removed and status changes', () => {
    expect(diffTasks([t('a', 'ready'), t('b', 'ready')], [t('a', 'running'), t('c', 'todo')])).toEqual([
      { id: 'a', change: 'status', status: 'running', previous: 'ready' },
      { id: 'c', change: 'added', status: 'todo' },
      { id: 'b', change: 'removed', previous: 'ready' },
    ]);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm -F @aos/core exec vitest run test/kanban.test.ts`
Expected: FAIL — modul `kanban.js` belum ada.

- [ ] **Step 3: Implementasi**

`apps/core/src/kanban.ts`:
```ts
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';

export interface KanbanTask {
  id: string;
  title: string;
  assignee: string | null;
  status: string;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  workspace_kind: string | null;
  workspace_path: string | null;
}

export interface KanbanRun {
  id: number;
  task_id: string;
  profile: string | null;
  status: string;
  started_at: number | null;
  ended_at: number | null;
  outcome: string | null;
}

export interface KanbanSnapshot {
  tasks: KanbanTask[];
  runs: KanbanRun[];
}

export interface KanbanChange {
  id: string;
  change: 'added' | 'removed' | 'status';
  status?: string;
  previous?: string;
}

export function readKanban(path: string): KanbanSnapshot {
  if (!existsSync(path)) return { tasks: [], runs: [] };
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const tasks = db
      .prepare(
        `SELECT id, title, assignee, status, created_at, started_at, completed_at, workspace_kind, workspace_path
         FROM tasks ORDER BY created_at DESC LIMIT 500`,
      )
      .all() as KanbanTask[];
    const runs = db
      .prepare('SELECT id, task_id, profile, status, started_at, ended_at, outcome FROM task_runs ORDER BY id DESC LIMIT 2000')
      .all() as KanbanRun[];
    return { tasks, runs };
  } finally {
    db.close();
  }
}

export function diffTasks(prev: KanbanTask[], next: KanbanTask[]): KanbanChange[] {
  const before = new Map(prev.map((t) => [t.id, t]));
  const after = new Map(next.map((t) => [t.id, t]));
  const changes: KanbanChange[] = [];
  for (const task of next) {
    const old = before.get(task.id);
    if (!old) changes.push({ id: task.id, change: 'added', status: task.status });
    else if (old.status !== task.status) changes.push({ id: task.id, change: 'status', status: task.status, previous: old.status });
  }
  for (const task of prev) {
    if (!after.has(task.id)) changes.push({ id: task.id, change: 'removed', previous: task.status });
  }
  return changes;
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `pnpm -F @aos/core test` dan `pnpm -F @aos/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/core
git commit -m "feat(core): read-only Hermes kanban reader with task diffs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: OS Core — sinkronisasi usage 9Router, atribusi kartu, ringkasan biaya

**Files:**
- Create: `apps/core/src/costs.ts`
- Test: `apps/core/test/costs.test.ts`

**Interfaces:**
- Consumes: `Db` (Task 6), `KanbanRun` (Task 8).
- Produces:
  - `attributeTask(profile: string, tsMs: number, runs: KanbanRun[]): string | null` — run milik `profile` yang mencakup `floor(tsMs/1000)` (`started_at ≤ t ≤ (ended_at ?? ∞)`); tepat satu → `task_id`, selain itu `null`.
  - `syncUsage(db: Db, routerDbPath: string, keyProfiles: Map<string, string>, runs: KanbanRun[], limit?: number): number` — baca `usageHistory` dengan `id > cursor` (cursor `router_usage_id`), simpan baris yang key-nya dikenal ke `llm_usage` (tanpa apiKey), majukan cursor ke id terbesar yang dibaca (dikenal atau tidak); kembalikan jumlah baris tersimpan. Router DB tidak ada → 0.
  - `interface CostTotals { calls: number; prompt_tokens: number; completion_tokens: number; cost_usd: number }`
  - `interface CostSummary { since: number; until: number; total: CostTotals; byProfile: Array<CostTotals & { profile: string }>; byModel: Array<CostTotals & { model: string }>; byTask: Array<CostTotals & { task_id: string }> }`
  - `costSummary(db: Db, sinceMs: number, untilMs: number): CostSummary`

- [ ] **Step 1: Tulis test yang gagal**

`apps/core/test/costs.test.ts`:
```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { attributeTask, costSummary, syncUsage } from '../src/costs.js';
import { openCoreDb } from '../src/db.js';
import type { KanbanRun } from '../src/kanban.js';

function fakeRouter(rows: Array<[number, string, string, string, number, number, number]>): string {
  const path = join(mkdtempSync(join(tmpdir(), 'aos-9r-')), 'data.sqlite');
  const db = new Database(path);
  db.exec(`CREATE TABLE usageHistory (id INTEGER PRIMARY KEY, timestamp TEXT, provider TEXT, model TEXT, connectionId TEXT,
           apiKey TEXT, endpoint TEXT, promptTokens INTEGER, completionTokens INTEGER, cost REAL, status TEXT, tokens TEXT, meta TEXT)`);
  const ins = db.prepare("INSERT INTO usageHistory VALUES (?, ?, 'antigravity', ?, 'c', ?, '/v1/chat/completions', ?, ?, ?, 'ok', '{}', '{}')");
  for (const [id, ts, model, key, p, c, cost] of rows) ins.run(id, ts, model, key, p, c, cost);
  db.close();
  return path;
}

const runs: KanbanRun[] = [
  { id: 1, task_id: 't_a', profile: 'researcher', status: 'done', started_at: 1790000000, ended_at: 1790000100, outcome: 'completed' },
  { id: 2, task_id: 't_b', profile: 'researcher', status: 'running', started_at: 1790000200, ended_at: null, outcome: null },
];

describe('attributeTask', () => {
  it('finds the single run of that profile covering the timestamp', () => {
    expect(attributeTask('researcher', 1790000050_000, runs)).toBe('t_a');
    expect(attributeTask('researcher', 1790000300_000, runs)).toBe('t_b');
    expect(attributeTask('researcher', 1790000150_000, runs)).toBeNull();
    expect(attributeTask('chief', 1790000050_000, runs)).toBeNull();
  });
  it('returns null when two runs of the profile overlap', () => {
    const overlap = [...runs, { ...runs[0], id: 3, task_id: 't_c' }];
    expect(attributeTask('researcher', 1790000050_000, overlap)).toBeNull();
  });
});

const at = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString();

describe('syncUsage + costSummary', () => {
  it('stores known-key rows without the key, advances the cursor, and summarises', () => {
    const router = fakeRouter([
      [1, at(1790000050), 'gemini-3.8-flash', 'k-research', 100, 10, 0.01],
      [2, at(1790000060), 'gemini-3.8-flash', 'k-unknown', 999, 999, 9],
      [3, at(1790000500), 'claude-sonnet-4-6', 'k-chief', 50, 5, 0.02],
    ]);
    const db = openCoreDb(':memory:');
    const keys = new Map([['k-research', 'researcher'], ['k-chief', 'chief']]);
    expect(syncUsage(db, router, keys, runs)).toBe(2);
    expect(syncUsage(db, router, keys, runs)).toBe(0);
    const stored = db.prepare('SELECT * FROM llm_usage ORDER BY router_id').all() as Array<Record<string, unknown>>;
    expect(stored.map((r) => [r.router_id, r.profile, r.task_id])).toEqual([[1, 'researcher', 't_a'], [3, 'chief', null]]);
    expect(JSON.stringify(stored)).not.toContain('k-research');
    const summary = costSummary(db, 0, Date.parse('2027-01-01T00:00:00Z'));
    expect(summary.total).toEqual({ calls: 2, prompt_tokens: 150, completion_tokens: 15, cost_usd: 0.03 });
    expect(summary.byProfile).toEqual([
      { profile: 'chief', calls: 1, prompt_tokens: 50, completion_tokens: 5, cost_usd: 0.02 },
      { profile: 'researcher', calls: 1, prompt_tokens: 100, completion_tokens: 10, cost_usd: 0.01 },
    ]);
    expect(summary.byTask).toEqual([{ task_id: 't_a', calls: 1, prompt_tokens: 100, completion_tokens: 10, cost_usd: 0.01 }]);
    expect(summary.byModel.map((m) => m.model)).toEqual(['claude-sonnet-4-6', 'gemini-3.8-flash']);
  });

  it('returns 0 when the router database is missing', () => {
    expect(syncUsage(openCoreDb(':memory:'), join(tmpdir(), 'no-such-9router.sqlite'), new Map(), [])).toBe(0);
  });
});
```
(Baris 1 jatuh di jendela run `t_a` milik researcher → `t_a`; baris 2 key tidak dikenal → dilewati tapi cursor tetap maju; baris 3 milik chief yang tidak punya run → `task_id` `null`.)

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm -F @aos/core exec vitest run test/costs.test.ts`
Expected: FAIL — modul `costs.js` belum ada.

- [ ] **Step 3: Implementasi**

`apps/core/src/costs.ts`:
```ts
import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import type { Db } from './db.js';
import type { KanbanRun } from './kanban.js';

export interface CostTotals {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
}

export interface CostSummary {
  since: number;
  until: number;
  total: CostTotals;
  byProfile: Array<CostTotals & { profile: string }>;
  byModel: Array<CostTotals & { model: string }>;
  byTask: Array<CostTotals & { task_id: string }>;
}

interface UsageRow {
  id: number;
  timestamp: string;
  provider: string | null;
  model: string | null;
  apiKey: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  cost: number | null;
  status: string | null;
}

const CURSOR = 'router_usage_id';

export function attributeTask(profile: string, tsMs: number, runs: KanbanRun[]): string | null {
  const t = Math.floor(tsMs / 1000);
  const matches = runs.filter(
    (r) => r.profile === profile && r.started_at !== null && r.started_at <= t && (r.ended_at === null || t <= r.ended_at),
  );
  return matches.length === 1 ? matches[0].task_id : null;
}

export function syncUsage(db: Db, routerDbPath: string, keyProfiles: Map<string, string>, runs: KanbanRun[], limit = 2000): number {
  if (!existsSync(routerDbPath)) return 0;
  const cursorRow = db.prepare('SELECT value FROM cursors WHERE name = ?').get(CURSOR) as { value: number } | undefined;
  const cursor = cursorRow?.value ?? 0;
  const router = new Database(routerDbPath, { readonly: true, fileMustExist: true });
  let rows: UsageRow[];
  try {
    rows = router
      .prepare(
        `SELECT id, timestamp, provider, model, apiKey, promptTokens, completionTokens, cost, status
         FROM usageHistory WHERE id > ? ORDER BY id LIMIT ?`,
      )
      .all(cursor, limit) as UsageRow[];
  } finally {
    router.close();
  }
  if (rows.length === 0) return 0;
  const insert = db.prepare(
    `INSERT OR IGNORE INTO llm_usage (router_id, ts, provider, model, profile, task_id, prompt_tokens, completion_tokens, cost_usd, status)
     VALUES (@router_id, @ts, @provider, @model, @profile, @task_id, @prompt_tokens, @completion_tokens, @cost_usd, @status)`,
  );
  let stored = 0;
  db.transaction(() => {
    for (const row of rows) {
      const profile = row.apiKey ? keyProfiles.get(row.apiKey) : undefined;
      if (!profile) continue;
      const ts = Date.parse(row.timestamp);
      const info = insert.run({
        router_id: row.id,
        ts: Number.isNaN(ts) ? 0 : ts,
        provider: row.provider,
        model: row.model,
        profile,
        task_id: Number.isNaN(ts) ? null : attributeTask(profile, ts, runs),
        prompt_tokens: row.promptTokens ?? 0,
        completion_tokens: row.completionTokens ?? 0,
        cost_usd: row.cost ?? 0,
        status: row.status,
      });
      stored += info.changes;
    }
    db.prepare('INSERT INTO cursors (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value').run(
      CURSOR,
      rows[rows.length - 1].id,
    );
  })();
  return stored;
}

const TOTALS = `COUNT(*) AS calls, COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
  COALESCE(SUM(completion_tokens), 0) AS completion_tokens, ROUND(COALESCE(SUM(cost_usd), 0), 6) AS cost_usd`;

export function costSummary(db: Db, sinceMs: number, untilMs: number): CostSummary {
  const where = 'WHERE ts >= @since AND ts < @until';
  const params = { since: sinceMs, until: untilMs };
  return {
    since: sinceMs,
    until: untilMs,
    total: db.prepare(`SELECT ${TOTALS} FROM llm_usage ${where}`).get(params) as CostTotals,
    byProfile: db.prepare(`SELECT profile, ${TOTALS} FROM llm_usage ${where} GROUP BY profile ORDER BY profile`).all(params) as CostSummary['byProfile'],
    byModel: db.prepare(`SELECT model, ${TOTALS} FROM llm_usage ${where} GROUP BY model ORDER BY model`).all(params) as CostSummary['byModel'],
    byTask: db
      .prepare(`SELECT task_id, ${TOTALS} FROM llm_usage ${where} AND task_id IS NOT NULL GROUP BY task_id ORDER BY task_id`)
      .all(params) as CostSummary['byTask'],
  };
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `pnpm -F @aos/core test` dan `pnpm -F @aos/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/core
git commit -m "feat(core): sync 9Router usage by key, attribute cost to cards, summarise" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: OS Core — server HTTP/WebSocket dan autentikasi

**Files:**
- Create: `apps/core/src/hub.ts`, `apps/core/src/server.ts`
- Test: `apps/core/test/hub.test.ts`, `apps/core/test/server.test.ts`

**Interfaces:**
- Consumes: `Db`, `ingestEvents`, `listAgentStates`, `costSummary`, `KanbanSnapshot`.
- Produces:
  - `interface Hub { publish(topic: string, data: unknown): void; subscribe(send: (message: string) => void): () => void; size(): number }`; `createHub(): Hub` — pesan = `JSON.stringify({ topic, data })`; subscriber yang melempar error dibuang.
  - `interface ServerDeps { db: Db; bridgeToken: string; uiToken: string; hub: Hub; kanban: () => KanbanSnapshot; now?: () => number }`
  - `buildServer(deps: ServerDeps): Promise<FastifyInstance>` dengan rute:
    - `GET /v1/health` (tanpa auth) → `{ ok: true }`
    - `POST /v1/events` (header `x-aos-bridge-token`) → `{ inserted, duplicates, rejected }`; 401 bila token salah; 400 bila body bukan array/terlalu besar; publish `events` (array event baru) dan `agents` (`listAgentStates`) bila ada yang baru.
    - `GET /v1/agents`, `GET /v1/kanban` (`{tasks}`), `GET /v1/costs?since=&until=` (default 24 jam terakhir) — auth UI.
    - `GET /v1/stream` (WebSocket) — auth UI.
  - Auth UI: header `Authorization: Bearer <token>` **atau** query `?token=<token>`; perbandingan constant-time.

- [ ] **Step 1: Tulis test yang gagal**

`apps/core/test/hub.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createHub } from '../src/hub.js';

describe('createHub', () => {
  it('fans out messages, unsubscribes, and drops failing subscribers', () => {
    const hub = createHub();
    const got: string[] = [];
    const off = hub.subscribe((m) => got.push(m));
    hub.subscribe(() => {
      throw new Error('closed');
    });
    hub.publish('agents', [1]);
    expect(got).toEqual([JSON.stringify({ topic: 'agents', data: [1] })]);
    expect(hub.size()).toBe(1);
    off();
    hub.publish('agents', [2]);
    expect(got).toHaveLength(1);
    expect(hub.size()).toBe(0);
  });
});
```
`apps/core/test/server.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { openCoreDb } from '../src/db.js';
import { createHub } from '../src/hub.js';
import { buildServer } from '../src/server.js';

const event = {
  id: 'f'.repeat(32), ts: 1790000000000, type: 'tool.started', profile: 'dev', session_id: 's', task_id: null,
  mode: 'cli', payload: { tool: 'terminal', category: 'run' },
};

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function make() {
  const hub = createHub();
  app = await buildServer({
    db: openCoreDb(':memory:'),
    bridgeToken: 'bt',
    uiToken: 'ut',
    hub,
    kanban: () => ({ tasks: [{ id: 't_1', title: 'x', assignee: 'researcher', status: 'ready', created_at: 1, started_at: null, completed_at: null, workspace_kind: null, workspace_path: null }], runs: [] }),
    now: () => 1790000000000,
  });
  return { app, hub };
}

describe('buildServer', () => {
  it('serves health without auth', async () => {
    const { app } = await make();
    expect((await app.inject({ method: 'GET', url: '/v1/health' })).json()).toEqual({ ok: true });
  });

  it('accepts bridge events only with the bridge token and publishes them', async () => {
    const { app, hub } = await make();
    const seen: string[] = [];
    hub.subscribe((m) => seen.push(m));
    const bad = await app.inject({ method: 'POST', url: '/v1/events', payload: [event], headers: { 'x-aos-bridge-token': 'nope' } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({ method: 'POST', url: '/v1/events', payload: [event], headers: { 'x-aos-bridge-token': 'bt' } });
    expect(ok.json()).toEqual({ inserted: 1, duplicates: 0, rejected: 0 });
    expect(seen.map((m) => JSON.parse(m).topic)).toEqual(['events', 'agents']);
    const notArray = await app.inject({ method: 'POST', url: '/v1/events', payload: { x: 1 }, headers: { 'x-aos-bridge-token': 'bt' } });
    expect(notArray.statusCode).toBe(400);
  });

  it('protects UI routes with bearer or query token', async () => {
    const { app } = await make();
    expect((await app.inject({ method: 'GET', url: '/v1/agents' })).statusCode).toBe(401);
    const agents = await app.inject({ method: 'GET', url: '/v1/agents', headers: { authorization: 'Bearer ut' } });
    expect(agents.statusCode).toBe(200);
    expect(agents.json().map((a: { profile: string }) => a.profile)).toContain('dev');
    expect((await app.inject({ method: 'GET', url: '/v1/kanban?token=ut' })).json().tasks[0].id).toBe('t_1');
    const costs = await app.inject({ method: 'GET', url: '/v1/costs?token=ut' });
    expect(costs.json()).toMatchObject({ since: 1790000000000 - 86_400_000, until: 1790000000000, total: { calls: 0 } });
  });

  it('streams hub messages to authorised websocket clients', async () => {
    const { app, hub } = await make();
    await app.ready();
    const ws = await app.injectWS('/v1/stream?token=ut');
    const message = new Promise<string>((resolve) => ws.on('message', (data) => resolve(String(data))));
    hub.publish('kanban', [{ id: 't_1', change: 'added' }]);
    expect(JSON.parse(await message)).toEqual({ topic: 'kanban', data: [{ id: 't_1', change: 'added' }] });
    ws.terminate();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm -F @aos/core test`
Expected: FAIL — `hub.js`/`server.js` belum ada.

- [ ] **Step 3: Implementasi**

`apps/core/src/hub.ts`:
```ts
export interface Hub {
  publish(topic: string, data: unknown): void;
  subscribe(send: (message: string) => void): () => void;
  size(): number;
}

export function createHub(): Hub {
  const subscribers = new Set<(message: string) => void>();
  return {
    publish(topic, data) {
      const message = JSON.stringify({ topic, data });
      for (const send of [...subscribers]) {
        try {
          send(message);
        } catch {
          subscribers.delete(send);
        }
      }
    },
    subscribe(send) {
      subscribers.add(send);
      return () => subscribers.delete(send);
    },
    size: () => subscribers.size,
  };
}
```
`apps/core/src/server.ts`:
```ts
import { timingSafeEqual } from 'node:crypto';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { costSummary } from './costs.js';
import type { Db } from './db.js';
import { ingestEvents } from './events.js';
import type { Hub } from './hub.js';
import type { KanbanSnapshot } from './kanban.js';
import { listAgentStates } from './state.js';

export interface ServerDeps {
  db: Db;
  bridgeToken: string;
  uiToken: string;
  hub: Hub;
  kanban: () => KanbanSnapshot;
  now?: () => number;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function uiToken(req: FastifyRequest): string {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const query = req.query as Record<string, unknown> | undefined;
  return typeof query?.token === 'string' ? query.token : '';
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const now = deps.now ?? Date.now;
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024 });
  await app.register(websocket);

  const requireUi = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!safeEqual(uiToken(req), deps.uiToken)) return reply.code(401).send({ error: 'unauthorized' });
  };

  app.get('/v1/health', async () => ({ ok: true }));

  app.post('/v1/events', async (req, reply) => {
    const token = req.headers['x-aos-bridge-token'];
    if (typeof token !== 'string' || !safeEqual(token, deps.bridgeToken)) return reply.code(401).send({ error: 'unauthorized' });
    try {
      const result = ingestEvents(deps.db, req.body);
      if (result.accepted.length > 0) {
        deps.hub.publish('events', result.accepted);
        deps.hub.publish('agents', listAgentStates(deps.db));
      }
      return { inserted: result.inserted, duplicates: result.duplicates, rejected: result.rejected };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get('/v1/agents', { preHandler: requireUi }, async () => listAgentStates(deps.db));
  app.get('/v1/kanban', { preHandler: requireUi }, async () => ({ tasks: deps.kanban().tasks }));
  app.get('/v1/costs', { preHandler: requireUi }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const until = q.until ? Number(q.until) : now();
    const since = q.since ? Number(q.since) : until - 86_400_000;
    return costSummary(deps.db, since, until);
  });

  app.get('/v1/stream', { websocket: true, preHandler: requireUi }, (socket) => {
    const off = deps.hub.subscribe((message) => socket.send(message));
    socket.on('close', off);
  });

  return app;
}
```
(Jika versi `@fastify/websocket` yang terpasang memakai signature handler `(connection, req)` dengan `connection.socket`, sesuaikan: `const socket = connection.socket ?? connection`. Laporkan di report versi yang terpasang.)

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `pnpm -F @aos/core test` dan `pnpm -F @aos/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/core
git commit -m "feat(core): authenticated HTTP API and websocket stream" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: OS Core — entry point, timer, autostart, dan cek `doctor`

**Files:**
- Create: `apps/core/src/main.ts`, `infra/windows/install-core-startup.ps1`
- Modify: `packages/setup/src/doctor.ts`, `packages/setup/src/cli.ts`
- Test: `packages/setup/test/doctor.test.ts`

**Interfaces:**
- Consumes: semua modul Core (Task 6–10).
- Produces:
  - `main.ts`: muat `.env.local` repo, `loadCoreConfig`, `openCoreDb`, `readKanban` tiap 2 detik (publish `kanban` bila ada perubahan), `syncUsage` tiap 30 detik (publish `costs` bila ada baris baru), `listen({ host: '127.0.0.1', port })`; error timer di-log ke stderr tanpa menghentikan proses; tidak pernah mencetak token/key.
  - `checkCore(coreUrl: string, fetchFn?: typeof fetch): Promise<CheckResult>` → baris `core-health`; `DoctorConfig.coreUrl?: string` (default `http://127.0.0.1:7400`) dan `runDoctor` menambahkannya.

- [ ] **Step 1: Test `checkCore` (failing)**

Tambahkan ke `packages/setup/test/doctor.test.ts`:
```ts
describe('checkCore', () => {
  it('passes when /v1/health returns ok', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as unknown as typeof fetch;
    expect(await checkCore('http://127.0.0.1:7400', fetchFn)).toEqual({ name: 'core-health', ok: true, detail: 'GET http://127.0.0.1:7400/v1/health -> 200' });
  });
  it('fails without throwing when Core is down', async () => {
    const fetchFn = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    expect(await checkCore('http://127.0.0.1:7400', fetchFn)).toMatchObject({ ok: false, detail: expect.stringMatching(/ECONNREFUSED/) });
  });
});
```
Pada test `runDoctor`, fake `fetchFn` harus menjawab URL yang berakhiran `/v1/health` dengan `{ ok: true }` (200); tambahkan `expect(results.map((r) => r.name)).toContain('core-health');`.

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm -F @aos/setup test`
Expected: FAIL — `checkCore` belum ada.

- [ ] **Step 3: Implementasi `checkCore`**

Di `doctor.ts`:
```ts
export async function checkCore(coreUrl: string, fetchFn: typeof fetch = fetch): Promise<CheckResult> {
  const url = `${coreUrl.replace(/\/+$/, '')}/v1/health`;
  try {
    const res = await fetchFn(url);
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean };
    const ok = res.ok && body.ok === true;
    return { name: 'core-health', ok, detail: `GET ${url} -> ${res.status}` };
  } catch (err) {
    return { name: 'core-health', ok: false, detail: `${url}: ${(err as Error).message}` };
  }
}
```
`DoctorConfig` + `coreUrl?: string`; di akhir `runDoctor` tambahkan `await checkCore(cfg.coreUrl ?? 'http://127.0.0.1:7400', deps.fetchFn)`. Di `cli.ts` case `doctor`, teruskan `coreUrl`.

- [ ] **Step 4: Jalankan test setup**

Run: `pnpm -F @aos/setup test` dan `pnpm -F @aos/setup typecheck`
Expected: PASS.

- [ ] **Step 5: Implementasi `apps/core/src/main.ts`**

```ts
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadCoreConfig } from './config.js';
import { syncUsage } from './costs.js';
import { openCoreDb } from './db.js';
import { createHub } from './hub.js';
import { diffTasks, readKanban, type KanbanSnapshot } from './kanban.js';
import { buildServer } from './server.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const envFile = join(repoRoot, '.env.local');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const config = loadCoreConfig(process.env);
const db = openCoreDb(config.dbPath);
const hub = createHub();
let snapshot: KanbanSnapshot = { tasks: [], runs: [] };

function safely(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.error(`[aos-core] ${label} failed: ${(err as Error).message}`);
  }
}

function refreshKanban(): void {
  const next = readKanban(config.kanbanDbPath);
  const changes = diffTasks(snapshot.tasks, next.tasks);
  snapshot = next;
  if (changes.length > 0) hub.publish('kanban', changes);
}

function refreshCosts(): void {
  const stored = syncUsage(db, config.routerDbPath, config.routerKeyProfiles, snapshot.runs);
  if (stored > 0) hub.publish('costs', { stored });
}

safely('kanban', refreshKanban);
safely('costs', refreshCosts);
setInterval(() => safely('kanban', refreshKanban), 2_000);
setInterval(() => safely('costs', refreshCosts), 30_000);

const app = await buildServer({ db, bridgeToken: config.bridgeToken, uiToken: config.uiToken, hub, kanban: () => snapshot });
await app.listen({ host: config.host, port: config.port });
console.log(`[aos-core] listening on http://${config.host}:${config.port} (db ${config.dbPath})`);
```
Run: `pnpm -F @aos/core typecheck` → bersih.

- [ ] **Step 6: Skrip autostart**

`infra/windows/install-core-startup.ps1`:
```powershell
# Memasang launcher Startup (tanpa admin) yang menjalankan OS Core saat login.
param([string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path)
$ErrorActionPreference = "Stop"
$startup = [Environment]::GetFolderPath("Startup")
$target = Join-Path $startup "AgenticOS_Core.vbs"
$logDir = "D:\agentic-os\core"
New-Item -ItemType Directory -Force $logDir | Out-Null
$cmd = "cmd /c cd /d `"`"$RepoRoot`"`" && pnpm -F @aos/core start >> `"`"$logDir\core.log`"`" 2>&1"
$vbs = @"
Set sh = CreateObject("WScript.Shell")
sh.Run "$cmd", 0, False
"@
Set-Content -Path $target -Value $vbs -Encoding ASCII
Write-Output "Installed $target"
```

- [ ] **Step 7: Commit**

```bash
git add apps/core/src/main.ts infra/windows/install-core-startup.ps1 packages/setup
git commit -m "feat(core): entry point with kanban/cost timers, startup launcher, doctor core check" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8 [mesin]: Jalankan Core & pasang autostart (izin owner)**

Minta konfirmasi owner sebelum memasang launcher Startup (konfigurasi persisten). Lalu:
```powershell
powershell -ExecutionPolicy Bypass -File "D:\MIT\CLAUDE CODE PROJECT\agentic OS\infra\windows\install-core-startup.ps1"
Start-Process wscript.exe -ArgumentList "`"$([Environment]::GetFolderPath('Startup'))\AgenticOS_Core.vbs`""
# tunggu "[aos-core] listening" di D:\agentic-os\core\core.log
Get-NetTCPConnection -LocalPort 7400 -State Listen | Select-Object LocalAddress
pnpm aos doctor
```
Expected: `LocalAddress` = `127.0.0.1`; `doctor` semua `[OK]` termasuk `core-health`.

---

### Task 12 [mesin]: Verifikasi end-to-end M2 & dokumentasi

**Files:**
- Modify: `docs/runbook.md`, `docs/PRD-Agentic-OS.md`

**Interfaces:**
- Consumes: semua task sebelumnya berjalan di mesin.

Semua perintah PowerShell dari root repo; muat token UI dulu:
```powershell
$ui = (Select-String -Path .env.local -Pattern '^AOS_UI_TOKEN=(.+)$').Matches[0].Groups[1].Value
$h = @{ Authorization = "Bearer $ui" }
$env:HERMES_HOME = "D:\agentic-os\hermes-home"
```

- [ ] **Step 1: Mode interaktif (CLI)**

```powershell
Set-Location D:\agentic-os\scratch
hermes -p researcher chat -q "Cari di web apa itu QUIC, jawab 1 kalimat."
Set-Location "D:\MIT\CLAUDE CODE PROJECT\agentic OS"
Invoke-RestMethod http://127.0.0.1:7400/v1/agents -Headers $h | Format-Table profile, state, detail, updated_at
```
Expected: baris `researcher` punya `updated_at` baru; di `core.db` ada event `session.started` → `llm.started` → `tool.started(web_search)` → … → `session.ended` dengan `mode` = nilai platform CLI. Cek:
```powershell
node -e "const D=require('./apps/core/node_modules/better-sqlite3');const db=new D('D:/agentic-os/core/core.db',{readonly:true});console.table(db.prepare('select type,profile,mode,task_id from events order by ts desc limit 10').all())"
```

- [ ] **Step 2: Mode kanban + biaya per kartu**

```powershell
pnpm aos smoke-kanban
Start-Sleep -Seconds 35
Invoke-RestMethod "http://127.0.0.1:7400/v1/costs" -Headers $h | ConvertTo-Json -Depth 4
```
Expected: event dengan `mode = kanban` dan `task_id` kartu smoke; `byProfile` memuat `researcher`; `byTask` memuat id kartu smoke (bila key per profile terpasang di Task 5 Step 10 — bila owner melewatinya, catat bahwa biaya tercatat sebagai `shared`).

- [ ] **Step 3: Mode cron (menutup item terbuka "penanda konteks cron")**

```powershell
hermes -p chief cron run c7efc0721f0e
node -e "const D=require('./apps/core/node_modules/better-sqlite3');const db=new D('D:/agentic-os/core/core.db',{readonly:true});console.table(db.prepare(\"select type,mode,json_extract(payload,'$.platform') platform from events where profile='chief' order by ts desc limit 6\").all())"
```
Expected: event `session.started` dari run cron; catat nilai `mode`/`platform` yang muncul sebagai **penanda konteks cron** di runbook (V6) dan PRD §5.3.2.

- [ ] **Step 4: Spool saat Core mati**

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'src/main.ts' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Set-Location D:\agentic-os\scratch; hermes -p secretary chat -q "Balas hanya: ok"; Set-Location "D:\MIT\CLAUDE CODE PROJECT\agentic OS"
Get-Item D:\agentic-os\hermes-home\profiles\secretary\plugins\os-bridge\spool.jsonl | Select-Object Length
Start-Process wscript.exe -ArgumentList "`"$([Environment]::GetFolderPath('Startup'))\AgenticOS_Core.vbs`""
```
Expected: `spool.jsonl` berisi event saat Core mati; setelah Core hidup dan sesi `secretary` berikutnya berjalan (bridge mengirim ulang pada flush berikutnya), event tersebut muncul di `core.db` dan `spool.jsonl` kosong. (Spool dikirim ulang oleh proses bridge berikutnya — jalankan satu chat `secretary` lagi untuk memicunya.)

- [ ] **Step 5: WebSocket**

```powershell
node -e "const W=require('./apps/core/node_modules/ws');const w=new W('ws://127.0.0.1:7400/v1/stream?token='+process.argv[1]);w.on('message',m=>{console.log(String(m).slice(0,160));});setTimeout(()=>process.exit(0),60000)" $ui
```
Sambil itu jalankan `pnpm aos smoke-kanban` di terminal lain. Expected: muncul pesan topik `events`, `agents`, dan `kanban`.

- [ ] **Step 6: Cek container & hasil kartu (lanjutan Task 1)**

```powershell
docker ps -a --filter "name=hermes-" --format "{{.Names}} {{.Status}}"
```
Catat apakah container menumpuk; workspace kartu terbaru berisi file hasil.

- [ ] **Step 7: Perbarui dokumentasi**

`docs/runbook.md`:
- §1: V6 — isi penanda konteks cron yang diamati; V8 — catat atribusi biaya per profile (key per profile) & per kartu (jendela waktu `task_runs`).
- §2 diagram: tambah `os-bridge → OS Core (127.0.0.1:7400) → core.db`, `kanban.db`/`data.sqlite` read-only.
- §3: prosedur Core (start/stop, log `D:\agentic-os\core\core.log`, `AgenticOS_Core.vbs`, endpoint & token UI, `set-local-secrets.ps1`, spool bridge).
- §4: hapus keterbatasan yang sudah selesai (file worker, dispatcher di root, atribusi biaya per profile) bila terverifikasi; tambahkan keterbatasan baru yang ditemukan.
- §5: tambah tabel "Bukti exit M2" (event 3 mode, `/v1/agents`, `/v1/costs` per profile & kartu, spool, WebSocket).

`docs/PRD-Agentic-OS.md`: §13 tandai M2 selesai; §5.3.2 penanda cron; §5.4 catat deviasi `better-sqlite3` (bukan Drizzle) dan endpoint final; §16 perbarui item terbuka.

- [ ] **Step 8: Commit**

```bash
git add docs/runbook.md docs/PRD-Agentic-OS.md
git commit -m "docs: record M2 verification (bridge, core, costs) in runbook and PRD" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-Review (dilakukan saat menulis plan)

**Cakupan spec (PRD §13-M2 + item awal M2):**
- os-bridge (event lifecycle/tool, non-blocking, spool, redaksi, tanpa policy) → T3, T4; pemasangan per profile → T5.
- Core ingest + event store + state projector → T6, T7; kanban-reader read-only → T8; ledger biaya + rekonsiliasi 9Router (`usageHistory`) + atribusi per profile/kartu → T5 (key per profile), T9; WS fan-out + API `/v1/agents`, `/v1/kanban`, `/v1/costs`, `/v1/health` → T10; wiring & autostart → T11.
- Exit M2 ("event semua mode masuk Core; state & biaya per kartu terlihat") → T12 Step 1–3.
- Item awal M2: file worker persisten → T1 (+ verifikasi T12 Step 6); dispatcher di root + doctor root/gateway → T2.
- Di luar M2 (sengaja): approval/policy/Ops bot/circuit breaker (M3), UI (M4–M5), modul `catchup`/`health` Core yang lebih lengkap (M6).

**Placeholder:** tidak ada "TBD". Satu-satunya ketidakpastian eksternal (signature handler `@fastify/websocket`, build native `better-sqlite3`, hasil mount Docker di T1) punya instruksi eksplisit apa yang dilakukan bila berbeda.

**Konsistensi tipe:** `TierModels`/`DEFAULT_TIER_MODELS` (M1) dipakai T2; `pluginsFor`, `routerKeysFromEnv` didefinisikan T5 dan dipakai di apply/doctor/cli T5; `KanbanRun` (T8) dipakai `attributeTask`/`syncUsage` (T9); `AosEvent` (T7) dipakai `state.ts`; `Hub`/`createHub` (T10) dipakai `main.ts` (T11); nama topik WS konsisten: `events`, `agents`, `kanban`, `costs`; header bridge `x-aos-bridge-token` sama di T4 dan T10; `config.json` bridge (`core_url`, `token`) sama di T4 dan T5.
