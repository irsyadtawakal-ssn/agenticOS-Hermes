# M5a — Pixel Office: Dock, HUD & Laci Kanban Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kantor pixel bukan lagi sekadar tontonan. Owner bisa mengklik karakter untuk membuka dock (kartu aktif, log tool live, info agent), memutuskan approval dari HUD (Approve / Deny / Deny+instruksi), melihat biaya hari ini dan kesehatan sistem, menyeret kartu antar kolom di laci kanban, membuat kartu, dan memakai shortcut. Semua bersumber dari OS Core.

**Architecture:**
- **Kerangka.** `AosShell` (React) membungkus `App` vendor (patch P6): kanvas di kiri, dock kanan yang bisa ditutup, HUD di bawah, dan laci kanban yang bergeser naik.
- **State.** Satu store kecil (`useSyncExternalStore`) diisi dari dua sumber:
  - Ketukan topik WebSocket yang sudah dibuka `HermesTransport` (`events`, `approvals`, `kanban`, `costs`, `health`).
  - REST Core.
  - Klik karakter (pesan `focusAgent` yang sudah dikirim UI vendor) membuka dock agent itu.
- **Logika murni** (reducer, aturan perpindahan kartu, ringkasan biaya, peta shortcut) dipisah agar teruji di vitest.
- **Core** menambah:
  - Kesehatan komponen (`/v1/health/components` + topik `health`).
  - Aksi kanban lewat CLI resmi (`/v1/kanban/:id/move`, `POST /v1/kanban`).
  - Biaya harian (`/v1/costs/daily`).
  - Event terbaru per agent (`/v1/events`).
- Chat (`hermes serve`) **bukan** bagian M5a; tab Chat berisi petunjuk sampai M5b.

**Tech Stack:**
- `apps/office`: React 19 + Tailwind 4. Skala spacing 1 unit = 1px; font FS Pixel; token warna `bg`, `bg-dark`, `border`, `accent`, `text`, `text-muted`, `btn-bg`, `danger`, `warning`, `status-*`; kelas `.pixel-panel`; komponen `Button`/`Modal` vendor.
- Core: Fastify 5 (tanpa dependency baru).

**Spec:** `docs/PRD-Agentic-OS.md`:
- §5.5.2 (layout layar)
- §5.5.4 (dock)
- §5.5.5 (HUD & laci)
- §5.5.6 (shortcut & aksesibilitas)
- §5.4 (Core)
- §2.3 (US-06, US-07, US-08, US-09, US-11)

Fakta terpasang ada di `docs/runbook.md` (M1–M4).

## Global Constraints

- **Vendor.** Patch tambahan hanya P6 (`main.tsx` merender `AosShell`) dan P7 (`index.css` menambah `@source "../../../../src";`). Keduanya dicatat di `apps/office/vendor/pixel-agents/NOTICE.md`.
- **Token.** Kantor tetap tanpa token di JavaScript: cookie `aos_ui` (prod) atau proxy Vite (dev). Keputusan approval dari kantor memakai `POST /v1/approvals/:id/decision` dengan `by: "office"`. Rute owner sudah menerima token UI lewat cookie.
- **Mutasi kanban** HANYA lewat CLI resmi `hermes kanban …` (ADR-02), dijalankan Core dengan `HERMES_HOME` Agentic OS (`createHermesRunner`, M3).

| Pindah ke | Dari | Perintah |
|---|---|---|
| `ready` | `blocked` | `unblock --reason "<catatan>" <id>` |
| `ready` | `todo` | `promote <id> <catatan>` |
| `blocked` | `todo` / `ready` / `running` | `block <id> <catatan>` |
| `archived` | status apa pun selain `archived` | `archive <id>` |
| lainnya | — | ditolak 409 dengan pesan Bahasa Indonesia |

- **Pembuatan kartu dari kantor** meniru `office_create_task`: workspace permanen `dir:<HERMES_HOME>\workspaces\<stamp>-<slug>`, assignee ∈ 5 profile, judul ≤ 80 karakter.
- **Bahasa.** Teks UI Bahasa Indonesia; kode, identifier, dan commit Bahasa Inggris.
- **Aksesibilitas (§5.5.6).**
  - Setiap info kanvas punya padanan teks di dock/HUD.
  - Tombol punya label teks.
  - Shortcut tidak aktif saat fokus ada di input/textarea.
  - Animasi baru menghormati `prefers-reduced-motion`.
- **Commit:** trailer PERSIS `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan pakai heredoc untuk file kode (pakai Edit/Write).
- **Test:**
  - `pnpm -r test`, `pnpm -r typecheck`, `pnpm office:build`, `py -3 -m pytest packages tests/redteam -q`.
  - Komponen React diuji lewat logika murninya; verifikasi visual di Task 7.
- **Langkah mesin** (restart Core, kartu uji) atas izin owner. Restart Core HANYA lewat `explorer.exe "<shell:startup>\AgenticOS_Core.vbs"`.
- Branch `m5a-office-workspace`. Ledger `.superpowers/sdd/2026-10-02-m5a-office-workspace/progress.md`.

## File Structure

| File | Tanggung jawab |
|---|---|
| `apps/core/src/health.ts` | Probe komponen: core, gateway (host record), 9Router, Docker, serve (opsional), Ollama (opsional) |
| `apps/core/src/kanbanActions.ts` | `planMove` (status → argumen CLI), `planCreate` (judul/assignee/body → argumen CLI + workspace) |
| `apps/core/src/costs.ts` | + `dailyCosts(db, days, now, timeZone)` |
| `apps/core/src/events.ts` | + `recentEvents(db, profile, limit)` |
| `apps/core/src/server.ts`, `main.ts`, `config.ts` | Rute baru, `runHermes`/`probeHealth`/`timeZone`/`workspacesRoot` di deps, timer health |
| `apps/office/src/shell/model.ts` | Logika murni: aturan pindah kartu, reducer aktivitas & kanban, ringkasan biaya, peta shortcut, tier agent |
| `apps/office/src/shell/api.ts` | Klien REST Core (same-origin) |
| `apps/office/src/shell/store.ts` | Store + hook `useShell()`; disambungkan ke ketukan topik `HermesTransport` |
| `apps/office/src/shell/{AosShell,Hud,ApprovalsPanel,CostPanel,Dock,KanbanDrawer}.tsx` | UI |
| `apps/office/src/hermes/transport.ts` | + `onCoreTopic(handler)`, `onFocus(handler)`, `select(id)` |

---

### Task 1: Core — kesehatan komponen, biaya harian, event terbaru

**Files:**
- Create: `apps/core/src/health.ts`
- Modify: `apps/core/src/costs.ts`, `apps/core/src/events.ts`, `apps/core/src/config.ts` (`timeZone`, `workspacesRoot`, `gatewayLockDir`, `routerBaseUrl`), `apps/core/src/server.ts`, `apps/core/src/main.ts`
- Test: `apps/core/test/health.test.ts`, `apps/core/test/costs.test.ts` (tambah), `apps/core/test/server.test.ts` (tambah)

**Interfaces:**
- Produces:
  - `interface HealthComponent { id: 'core'|'gateway'|'router'|'docker'|'serve'|'ollama'; label: string; status: 'ok'|'down'|'absent'; detail: string }`.
  - `interface HealthDeps { readFile(path): string|null; pidAlive(pid): boolean; fetchFn: typeof fetch; runDocker(): Promise<{code:number; stdout:string}>; hermesHome: string; lockDir: string; routerBaseUrl: string; servePort: number|null }`.
  - `probeHealth(deps) -> Promise<HealthComponent[]>` (urutan tetap: core, gateway, router, docker, serve, ollama).
  - `dailyCosts(db, days, now, timeZone) -> Array<{day: 'YYYY-MM-DD', cost_usd: number, calls: number}>` (hari tanpa data = 0, urut menaik, termasuk hari ini).
  - `recentEvents(db, profile, limit) -> AosEvent[]` (terbaru dulu, `limit` ≤ 200).
  - `CoreConfig` + `timeZone` (`AOS_TIMEZONE`, default `Asia/Jakarta`), `workspacesRoot` (`AOS_WORKSPACES_ROOT` atau `<hermesHome>\workspaces`), `gatewayLockDir` (`HERMES_GATEWAY_LOCK_DIR` atau `<USERPROFILE>\.local\state\hermes\gateway-locks`), `routerBaseUrl` (`AOS_ROUTER_URL` dinormalkan ke `…/v1`, default `http://127.0.0.1:20128/v1`), `servePort` (`AOS_SERVE_PORT` → angka, atau `null` sampai M5b).
- Rute (UI auth):
  - `GET /v1/health/components` → `HealthComponent[]`.
  - `GET /v1/costs/daily?days=7` (1–31).
  - `GET /v1/events?profile=&limit=`.
  - Hub topik `health` (data = `HealthComponent[]`) dipublikasikan `main.ts` tiap 30 dtk bila berubah.

**Aturan probe:**

| Komponen | Cek | `ok` | `down` | `absent` |
|---|---|---|---|---|
| `core` | — | selalu ("berjalan") | — | — |
| `gateway` | baca `<lockDir>\host-gateway.json` | `home` sama dengan `hermesHome` (case-insensitive) dan `pidAlive(pid)` | file tidak ada, home lain, atau pid mati | — |
| `router` | `GET <routerBaseUrl>/models` (timeout 3 dtk) | HTTP 200 | lainnya | — |
| `docker` | `runDocker()` (`docker version --format {{.Server.Version}}`, timeout 5 dtk) | code 0 (detail = versi) | lainnya | — |
| `serve` | `servePort === null` → absent ("dipasang di M5b"); selain itu `GET http://127.0.0.1:<port>/` (timeout 2 dtk) | status apa pun < 500 | gagal | `servePort === null` |
| `ollama` | `GET http://127.0.0.1:11434/api/version` (timeout 2 dtk) | 200 | — | gagal ("tidak dipasang (opsional)") |

- [ ] **Step 1: Write the failing tests**

`apps/core/test/health.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type HealthDeps, probeHealth } from '../src/health.js';

const record = JSON.stringify({ role: 'gateway', home: 'D:\\agentic-os\\hermes-home', pid: 20840 });

function deps(over: Partial<HealthDeps> = {}): HealthDeps {
  return {
    readFile: (p) => (p.endsWith('host-gateway.json') ? record : null),
    pidAlive: () => true,
    fetchFn: (async (url: string) => {
      if (url.includes('20128')) return new Response('{}', { status: 200 });
      if (url.includes('11434')) throw new Error('refused');
      return new Response('', { status: 404 });
    }) as unknown as typeof fetch,
    runDocker: async () => ({ code: 0, stdout: '29.3.1\n' }),
    hermesHome: 'd:\\AGENTIC-OS\\hermes-home',
    lockDir: 'C:\\locks',
    routerBaseUrl: 'http://127.0.0.1:20128/v1',
    servePort: null,
    ...over,
  };
}

describe('probeHealth', () => {
  it('reports every component in a fixed order', async () => {
    const result = await probeHealth(deps());
    expect(result.map((c) => [c.id, c.status])).toEqual([
      ['core', 'ok'], ['gateway', 'ok'], ['router', 'ok'], ['docker', 'ok'], ['serve', 'absent'], ['ollama', 'absent'],
    ]);
    expect(result.find((c) => c.id === 'docker')?.detail).toBe('Docker 29.3.1');
  });

  it('marks the gateway down for a dead pid, a foreign home or a missing record', async () => {
    expect((await probeHealth(deps({ pidAlive: () => false })))[1].status).toBe('down');
    const foreign = JSON.stringify({ role: 'gateway', home: 'C:\\other', pid: 1 });
    expect((await probeHealth(deps({ readFile: () => foreign })))[1].status).toBe('down');
    expect((await probeHealth(deps({ readFile: () => null })))[1].status).toBe('down');
    expect((await probeHealth(deps({ readFile: () => '{broken' })))[1].status).toBe('down');
  });

  it('marks router and docker down when they fail, and probes serve once configured', async () => {
    const failing = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
    const r = await probeHealth(deps({ fetchFn: failing, runDocker: async () => ({ code: 1, stdout: '' }), servePort: 9129 }));
    expect(r.map((c) => [c.id, c.status])).toEqual([
      ['core', 'ok'], ['gateway', 'ok'], ['router', 'down'], ['docker', 'down'], ['serve', 'down'], ['ollama', 'absent'],
    ]);
    const up = await probeHealth(deps({ servePort: 9129 }));
    expect(up.find((c) => c.id === 'serve')?.status).toBe('ok');
  });
});
```

Tambahkan ke `apps/core/test/costs.test.ts` (import `dailyCosts` dan helper yang ada untuk mengisi `llm_usage`; jika file test belum punya helper, sisipkan baris lewat `db.prepare('INSERT INTO llm_usage …')`):

```ts
describe('dailyCosts', () => {
  it('buckets cost per local day and fills empty days', () => {
    const db = openCoreDb(':memory:');
    const insert = db.prepare(
      `INSERT INTO llm_usage (router_id, ts, provider, model, profile, task_id, prompt_tokens, completion_tokens, cost_usd, status)
       VALUES (?, ?, 'p', 'm', 'shared', NULL, 1, 1, ?, 'ok')`,
    );
    // 2026-10-01 23:30 WIB = 16:30Z; 2026-10-02 00:30 WIB = 2026-10-01 17:30Z
    insert.run(1, Date.parse('2026-10-01T16:30:00Z'), 0.5);
    insert.run(2, Date.parse('2026-10-01T17:30:00Z'), 0.25);
    insert.run(3, Date.parse('2026-10-02T03:00:00Z'), 0.25);
    const now = Date.parse('2026-10-02T05:00:00Z');
    expect(dailyCosts(db, 3, now, 'Asia/Jakarta')).toEqual([
      { day: '2026-09-30', cost_usd: 0, calls: 0 },
      { day: '2026-10-01', cost_usd: 0.5, calls: 1 },
      { day: '2026-10-02', cost_usd: 0.5, calls: 2 },
    ]);
  });
});
```

Tambahkan ke `apps/core/test/server.test.ts` (perluas `makeWith` agar menerima `probeHealth`, `timeZone`, `runHermes`, `workspacesRoot` lewat `extra`):

```ts
describe('workspace routes (M5a)', () => {
  it('serves health components, daily costs and recent events behind the UI token', async () => {
    const { app, db } = await makeWith({
      probeHealth: async () => [{ id: 'core', label: 'OS Core', status: 'ok', detail: 'berjalan' }],
      timeZone: 'Asia/Jakarta',
    });
    expect((await app.inject({ method: 'GET', url: '/v1/health/components' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/v1/health/components?token=ut' })).json()).toEqual([
      { id: 'core', label: 'OS Core', status: 'ok', detail: 'berjalan' },
    ]);
    const daily = await app.inject({ method: 'GET', url: '/v1/costs/daily?days=2&token=ut' });
    expect(daily.json()).toHaveLength(2);
    expect((await app.inject({ method: 'GET', url: '/v1/costs/daily?days=99&token=ut' })).statusCode).toBe(400);
    await app.inject({ method: 'POST', url: '/v1/events', payload: [event], headers: { 'x-aos-bridge-token': 'bt' } });
    const recent = await app.inject({ method: 'GET', url: '/v1/events?profile=dev&limit=5&token=ut' });
    expect(recent.json().map((e: { id: string }) => e.id)).toEqual([event.id]);
    expect((await app.inject({ method: 'GET', url: '/v1/events?token=ut' })).statusCode).toBe(400);
    void db;
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F @aos/core test`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/core/src/health.ts`:

```ts
import { join } from 'node:path';

export type HealthId = 'core' | 'gateway' | 'router' | 'docker' | 'serve' | 'ollama';
export type HealthStatus = 'ok' | 'down' | 'absent';

export interface HealthComponent {
  id: HealthId;
  label: string;
  status: HealthStatus;
  detail: string;
}

export interface HealthDeps {
  readFile(path: string): string | null;
  pidAlive(pid: number): boolean;
  fetchFn: typeof fetch;
  runDocker(): Promise<{ code: number; stdout: string }>;
  hermesHome: string;
  lockDir: string;
  routerBaseUrl: string;
  servePort: number | null;
}

async function httpStatus(fetchFn: typeof fetch, url: string, timeoutMs: number): Promise<number | null> {
  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status;
  } catch {
    return null;
  }
}

function gateway(deps: HealthDeps): HealthComponent {
  const base = { id: 'gateway' as const, label: 'Gateway Hermes' };
  const text = deps.readFile(join(deps.lockDir, 'host-gateway.json'));
  if (!text) return { ...base, status: 'down', detail: 'tidak berjalan (host record tidak ada)' };
  try {
    const rec = JSON.parse(text) as { home?: string; pid?: number };
    if ((rec.home ?? '').toLowerCase() !== deps.hermesHome.toLowerCase()) return { ...base, status: 'down', detail: 'gateway Agentic OS tidak berjalan' };
    if (typeof rec.pid !== 'number' || !deps.pidAlive(rec.pid)) return { ...base, status: 'down', detail: 'proses gateway mati' };
    return { ...base, status: 'ok', detail: `PID ${rec.pid}` };
  } catch {
    return { ...base, status: 'down', detail: 'host record rusak' };
  }
}

export async function probeHealth(deps: HealthDeps): Promise<HealthComponent[]> {
  const [router, docker, serve, ollama] = await Promise.all([
    httpStatus(deps.fetchFn, `${deps.routerBaseUrl.replace(/\/+$/, '')}/models`, 3000),
    deps.runDocker().catch(() => ({ code: 1, stdout: '' })),
    deps.servePort === null ? Promise.resolve(null) : httpStatus(deps.fetchFn, `http://127.0.0.1:${deps.servePort}/`, 2000),
    httpStatus(deps.fetchFn, 'http://127.0.0.1:11434/api/version', 2000),
  ]);
  return [
    { id: 'core', label: 'OS Core', status: 'ok', detail: 'berjalan' },
    gateway(deps),
    router === 200
      ? { id: 'router', label: '9Router', status: 'ok', detail: 'terjangkau' }
      : { id: 'router', label: '9Router', status: 'down', detail: router === null ? 'tidak terjangkau' : `HTTP ${router}` },
    docker.code === 0
      ? { id: 'docker', label: 'Docker', status: 'ok', detail: `Docker ${docker.stdout.trim()}` }
      : { id: 'docker', label: 'Docker', status: 'down', detail: 'Docker Desktop tidak berjalan' },
    deps.servePort === null
      ? { id: 'serve', label: 'Hermes serve', status: 'absent', detail: 'dipasang di M5b' }
      : serve !== null && serve < 500
        ? { id: 'serve', label: 'Hermes serve', status: 'ok', detail: `port ${deps.servePort}` }
        : { id: 'serve', label: 'Hermes serve', status: 'down', detail: `port ${deps.servePort} tidak menjawab` },
    ollama === 200
      ? { id: 'ollama', label: 'Ollama', status: 'ok', detail: 'berjalan' }
      : { id: 'ollama', label: 'Ollama', status: 'absent', detail: 'tidak dipasang (opsional)' },
  ];
}
```

`apps/core/src/costs.ts`: tambahkan

```ts
export interface DailyCost {
  day: string;
  cost_usd: number;
  calls: number;
}

export function dailyCosts(db: Db, days: number, now: number, timeZone: string): DailyCost[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayOf = (ms: number) => fmt.format(new Date(ms));
  const buckets = new Map<string, DailyCost>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = dayOf(now - i * 86_400_000);
    buckets.set(day, { day, cost_usd: 0, calls: 0 });
  }
  const rows = db
    .prepare('SELECT ts, cost_usd FROM llm_usage WHERE ts >= ? AND ts <= ?')
    .all(now - (days + 1) * 86_400_000, now) as Array<{ ts: number; cost_usd: number }>;
  for (const row of rows) {
    const bucket = buckets.get(dayOf(row.ts));
    if (!bucket) continue;
    bucket.cost_usd = Math.round((bucket.cost_usd + row.cost_usd) * 1e6) / 1e6;
    bucket.calls += 1;
  }
  return [...buckets.values()];
}
```

`apps/core/src/events.ts`: tambahkan

```ts
export function recentEvents(db: Db, profile: string, limit: number): AosEvent[] {
  const rows = db
    .prepare('SELECT id, ts, type, profile, session_id, task_id, mode, payload FROM events WHERE profile = ? ORDER BY ts DESC LIMIT ?')
    .all(profile, Math.min(Math.max(limit, 1), 200)) as Array<Omit<AosEvent, 'payload'> & { payload: string }>;
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) as Record<string, unknown> }));
}
```

`apps/core/src/config.ts`: tambah field ke `CoreConfig` dan hasil `loadCoreConfig`:

```ts
    timeZone: env.AOS_TIMEZONE?.trim() || 'Asia/Jakarta',
    workspacesRoot: env.AOS_WORKSPACES_ROOT?.trim() || join(hermesHome, 'workspaces'),
    gatewayLockDir: env.HERMES_GATEWAY_LOCK_DIR?.trim() || join(env.USERPROFILE ?? '', '.local', 'state', 'hermes', 'gateway-locks'),
    routerBaseUrl: routerBase(env.AOS_ROUTER_URL),
    servePort: env.AOS_SERVE_PORT?.trim() ? Number(env.AOS_SERVE_PORT) : null,
```

dengan helper:

```ts
function routerBase(raw: string | undefined): string {
  const url = (raw?.trim() || 'http://127.0.0.1:20128/v1').replace(/\/+$/, '');
  return url.endsWith('/v1') ? url : `${url}/v1`;
}
```

Tambahkan test singkat di `config.test.ts`: default `timeZone`, `workspacesRoot`, `routerBaseUrl`, `servePort` `null`; `AOS_SERVE_PORT='9129'` → `9129`; `AOS_ROUTER_URL='http://x:1'` → `http://x:1/v1`.

`apps/core/src/server.ts`:
- `ServerDeps` + `probeHealth?: () => Promise<HealthComponent[]>`, `timeZone?: string`, `runHermes?: RunHermes`, `workspacesRoot?: string`.
- Rute:

```ts
  app.get('/v1/health/components', { preHandler: requireUi }, async () =>
    deps.probeHealth ? deps.probeHealth() : [{ id: 'core', label: 'OS Core', status: 'ok', detail: 'berjalan' }],
  );

  app.get('/v1/costs/daily', { preHandler: requireUi }, async (req, reply) => {
    const days = Number((req.query as Record<string, string | undefined>).days ?? 7);
    if (!Number.isInteger(days) || days < 1 || days > 31) return reply.code(400).send({ error: 'days must be 1-31' });
    return dailyCosts(deps.db, days, now(), deps.timeZone ?? 'Asia/Jakarta');
  });

  app.get('/v1/events', { preHandler: requireUi }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (!q.profile) return reply.code(400).send({ error: 'profile is required' });
    return recentEvents(deps.db, q.profile, Number(q.limit ?? 50) || 50);
  });
```

`apps/core/src/main.ts`:

```ts
const healthDeps: HealthDeps = {
  readFile: (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null),
  pidAlive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
  fetchFn: fetch,
  runDocker: () => new Promise((resolve) => {
    execFile('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 5000, windowsHide: true }, (err, stdout) =>
      resolve({ code: err ? 1 : 0, stdout: String(stdout ?? '') }));
  }),
  hermesHome: config.hermesHome,
  lockDir: config.gatewayLockDir,
  routerBaseUrl: config.routerBaseUrl,
  servePort: config.servePort,
};
let lastHealth = '';
async function refreshHealth(): Promise<void> {
  const components = await probeHealth(healthDeps);
  const key = JSON.stringify(components);
  if (key !== lastHealth) {
    lastHealth = key;
    hub.publish('health', components);
  }
}
background('health', refreshHealth());
setInterval(() => background('health', refreshHealth()), 30_000);
```

Simpan runner `createHermesRunner(...)` ke variabel `runHermes`, lalu pakai di `createReactions` dan `buildServer`. Tambahkan ke `buildServer({...})`: `probeHealth: () => probeHealth(healthDeps)`, `timeZone: config.timeZone`, `runHermes`, `workspacesRoot: config.workspacesRoot`. Import `execFile` dari `node:child_process` dan `readFileSync` dari `node:fs`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm -F @aos/core test` dan `pnpm -F @aos/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/core
git commit -m "feat(core): component health, daily costs and recent agent events for the office HUD" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Core — aksi kanban dari kantor (pindah & buat kartu)

**Files:**
- Create: `apps/core/src/kanbanActions.ts`
- Modify: `apps/core/src/server.ts`
- Test: `apps/core/test/kanbanActions.test.ts`; tambah di `apps/core/test/server.test.ts`

**Interfaces:**
- Produces:
  - `MOVE_TARGETS = ['ready','blocked','archived']`.
  - `planMove(task: {id, status}, to, note) -> {args: string[]} | {error: string}`.
  - `slugify(title)`.
  - `planCreate({title, assignee, body}, workspacesRoot, stamp) -> {args: string[]; workspace: string} | {error}`.
  - `PROFILES` diimpor dari `config.ts`.
- Rute (UI auth):
  - `POST /v1/kanban/:id/move` body `{to, note?}`:
    - 404 bila kartu tidak ada di snapshot.
    - 409 + `{error}` bila tidak diizinkan.
    - 502 + `{error}` bila CLI gagal.
    - Sukses 200 `{ok:true, output}`.
  - `POST /v1/kanban` body `{title, assignee, body?}`: 400 bila tidak valid. Membuat folder workspace (`mkdirSync`, recursive) sebelum CLI; bila CLI gagal, folder dihapus (`rmSync`, hanya bila kosong) dan respons 502. Sukses 200 `{ok:true, output, workspace}`.

- [ ] **Step 1: Write the failing tests** — `apps/core/test/kanbanActions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { planCreate, planMove, slugify } from '../src/kanbanActions.js';

describe('planMove', () => {
  it('maps allowed transitions to the official CLI', () => {
    expect(planMove({ id: 't_1', status: 'blocked' }, 'ready', 'lanjutkan, pakai data Q3')).toEqual({ args: ['kanban', 'unblock', '--reason', 'lanjutkan, pakai data Q3', 't_1'] });
    expect(planMove({ id: 't_1', status: 'blocked' }, 'ready', '')).toEqual({ args: ['kanban', 'unblock', '--reason', 'dilanjutkan owner dari office', 't_1'] });
    expect(planMove({ id: 't_2', status: 'todo' }, 'ready', '')).toEqual({ args: ['kanban', 'promote', 't_2', 'dipromosikan owner dari office'] });
    expect(planMove({ id: 't_3', status: 'running' }, 'blocked', 'tunggu saya')).toEqual({ args: ['kanban', 'block', 't_3', 'tunggu saya'] });
    expect(planMove({ id: 't_4', status: 'done' }, 'archived', '')).toEqual({ args: ['kanban', 'archive', 't_4'] });
  });

  it('refuses unsupported transitions with an Indonesian message', () => {
    expect(planMove({ id: 't_1', status: 'done' }, 'ready', '')).toEqual({ error: 'Kartu berstatus done tidak bisa dipindah ke ready dari office.' });
    expect(planMove({ id: 't_1', status: 'triage' }, 'ready', '')).toMatchObject({ error: expect.stringContaining('triage') });
    expect(planMove({ id: 't_1', status: 'blocked' }, 'blocked', '')).toMatchObject({ error: expect.any(String) });
    expect(planMove({ id: 't_1', status: 'archived' }, 'archived', '')).toMatchObject({ error: expect.any(String) });
    expect(planMove({ id: 't_1', status: 'ready' }, 'running', '')).toMatchObject({ error: expect.any(String) });
  });

  it('keeps notes as data, never flags', () => {
    const plan = planMove({ id: 't_1', status: 'blocked' }, 'ready', '--help') as { args: string[] };
    expect(plan.args).toEqual(['kanban', 'unblock', '--reason', '--help', 't_1']);
  });
});

describe('planCreate', () => {
  it('builds the create command with a permanent workspace', () => {
    const plan = planCreate({ title: 'Riset Kompetitor Postiz!', assignee: 'researcher', body: 'Goal: x' }, 'D:\\ws', '20261002-101500');
    expect(plan).toEqual({
      workspace: 'D:\\ws\\20261002-101500-riset-kompetitor-postiz',
      args: ['kanban', 'create', '--assignee', 'researcher', '--body=Goal: x', '--workspace', 'dir:D:\\ws\\20261002-101500-riset-kompetitor-postiz', '--', 'Riset Kompetitor Postiz!'],
    });
    expect(slugify('  ??? ')).toBe('task');
  });

  it('validates title and assignee', () => {
    expect(planCreate({ title: ' ', assignee: 'dev' }, 'D:\\ws', 's')).toEqual({ error: 'Judul wajib diisi.' });
    expect(planCreate({ title: 'x', assignee: 'hacker' }, 'D:\\ws', 's')).toMatchObject({ error: expect.stringContaining('assignee') });
    const long = planCreate({ title: 'x'.repeat(120), assignee: 'dev' }, 'D:\\ws', 's') as { args: string[] };
    expect(long.args.at(-1)).toHaveLength(80);
  });
});
```

Tambahan `server.test.ts`:

```ts
describe('kanban actions (M5a)', () => {
  const tasks = [
    { id: 't_1', title: 'a', assignee: 'dev', status: 'blocked', created_at: 1, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null },
    { id: 't_2', title: 'b', assignee: 'dev', status: 'done', created_at: 1, started_at: null, completed_at: null, workspace_kind: 'dir', workspace_path: null },
  ];

  it('moves cards through the CLI and reports refusals and CLI failures', async () => {
    const calls: string[][] = [];
    let code = 0;
    const { app } = await makeWith({
      kanban: () => ({ tasks, runs: [] }),
      runHermes: async (args) => (calls.push(args), { code, stdout: code ? '' : 'Unblocked t_1', stderr: code ? 'boom' : '' }),
    });
    const ok = await app.inject({ method: 'POST', url: '/v1/kanban/t_1/move', payload: { to: 'ready', note: 'lanjut' }, headers: { authorization: 'Bearer ut' } });
    expect(ok.json()).toEqual({ ok: true, output: 'Unblocked t_1' });
    expect(calls).toEqual([['kanban', 'unblock', '--reason', 'lanjut', 't_1']]);
    expect((await app.inject({ method: 'POST', url: '/v1/kanban/t_2/move', payload: { to: 'ready' }, headers: { authorization: 'Bearer ut' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: '/v1/kanban/t_9/move', payload: { to: 'ready' }, headers: { authorization: 'Bearer ut' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/v1/kanban/t_1/move', payload: { to: 'ready' } })).statusCode).toBe(401);
    code = 1;
    const failed = await app.inject({ method: 'POST', url: '/v1/kanban/t_1/move', payload: { to: 'ready' }, headers: { authorization: 'Bearer ut' } });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toEqual({ error: 'boom' });
  });

  it('creates cards with a workspace folder and removes it when the CLI fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aos-ws-'));
    let code = 0;
    const { app } = await makeWith({ workspacesRoot: root, runHermes: async () => ({ code, stdout: 'Created t_9', stderr: code ? 'no board' : '' }) });
    const res = await app.inject({ method: 'POST', url: '/v1/kanban', payload: { title: 'Uji kartu', assignee: 'researcher', body: 'Goal: x' }, headers: { authorization: 'Bearer ut' } });
    expect(res.json()).toMatchObject({ ok: true, output: 'Created t_9' });
    expect(existsSync(res.json().workspace)).toBe(true);
    code = 1;
    const bad = await app.inject({ method: 'POST', url: '/v1/kanban', payload: { title: 'Gagal', assignee: 'dev' }, headers: { authorization: 'Bearer ut' } });
    expect(bad.statusCode).toBe(502);
    expect(readdirSync(root)).toHaveLength(1);
    expect((await app.inject({ method: 'POST', url: '/v1/kanban', payload: { title: '', assignee: 'dev' }, headers: { authorization: 'Bearer ut' } })).statusCode).toBe(400);
  });
});
```

Tambah import `existsSync`, `readdirSync` di `server.test.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F @aos/core test`
Expected: FAIL.

- [ ] **Step 3: Implement** `apps/core/src/kanbanActions.ts`:

```ts
import { join } from 'node:path';
import { PROFILES } from './config.js';

export const MOVE_TARGETS = ['ready', 'blocked', 'archived'] as const;
export type MoveTarget = (typeof MOVE_TARGETS)[number];

export type Plan = { args: string[] } | { error: string };

export function planMove(task: { id: string; status: string }, to: string, note: string): Plan {
  const reason = note.trim();
  const refuse = { error: `Kartu berstatus ${task.status} tidak bisa dipindah ke ${to} dari office.` };
  if (task.status === 'triage') return { error: 'Kartu triage perlu diperjelas dulu (minta chief atau pakai `hermes kanban specify`).' };
  if (to === 'ready') {
    if (task.status === 'blocked') return { args: ['kanban', 'unblock', '--reason', reason || 'dilanjutkan owner dari office', task.id] };
    if (task.status === 'todo') return { args: ['kanban', 'promote', task.id, reason || 'dipromosikan owner dari office'] };
    return refuse;
  }
  if (to === 'blocked') {
    if (['todo', 'ready', 'running'].includes(task.status)) return { args: ['kanban', 'block', task.id, reason || 'ditahan owner dari office'] };
    return refuse;
  }
  if (to === 'archived') {
    return task.status === 'archived' ? refuse : { args: ['kanban', 'archive', task.id] };
  }
  return refuse;
}

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'task';
}

export function planCreate(
  input: { title?: unknown; assignee?: unknown; body?: unknown },
  workspacesRoot: string,
  stamp: string,
): { args: string[]; workspace: string } | { error: string } {
  const title = String(input.title ?? '').trim().slice(0, 80);
  if (!title) return { error: 'Judul wajib diisi.' };
  const assignee = String(input.assignee ?? '');
  if (!(PROFILES as readonly string[]).includes(assignee)) return { error: `assignee harus salah satu dari ${PROFILES.join(', ')}.` };
  const workspace = join(workspacesRoot, `${stamp}-${slugify(title)}`);
  const body = String(input.body ?? '');
  return { workspace, args: ['kanban', 'create', '--assignee', assignee, `--body=${body}`, '--workspace', `dir:${workspace}`, '--', title] };
}
```

`server.ts`: tambahkan

```ts
  app.post('/v1/kanban/:id/move', { preHandler: requireUi }, async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = (req.body ?? {}) as { to?: unknown; note?: unknown };
    const task = deps.kanban().tasks.find((t) => t.id === id);
    if (!task) return reply.code(404).send({ error: 'kartu tidak ditemukan' });
    const plan = planMove(task, String(body.to ?? ''), typeof body.note === 'string' ? body.note.slice(0, 500) : '');
    if ('error' in plan) return reply.code(409).send({ error: plan.error });
    if (!deps.runHermes) return reply.code(503).send({ error: 'hermes runner unavailable' });
    const r = await deps.runHermes(plan.args);
    if (r.code !== 0) return reply.code(502).send({ error: (r.stderr || r.stdout).trim().slice(0, 300) });
    return { ok: true, output: r.stdout.trim().slice(0, 500) };
  });

  app.post('/v1/kanban', { preHandler: requireUi }, async (req, reply) => {
    if (!deps.runHermes || !deps.workspacesRoot) return reply.code(503).send({ error: 'hermes runner unavailable' });
    const stamp = new Date(now()).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const plan = planCreate((req.body ?? {}) as Record<string, unknown>, deps.workspacesRoot, stamp);
    if ('error' in plan) return reply.code(400).send({ error: plan.error });
    mkdirSync(plan.workspace, { recursive: true });
    const r = await deps.runHermes(plan.args);
    if (r.code !== 0) {
      try {
        rmdirSync(plan.workspace);
      } catch {
        // folder not empty or already gone: leave it
      }
      return reply.code(502).send({ error: (r.stderr || r.stdout).trim().slice(0, 300) });
    }
    return { ok: true, output: r.stdout.trim().slice(0, 500), workspace: plan.workspace };
  });
```

Import `mkdirSync`, `rmdirSync` dari `node:fs`, `planCreate`/`planMove` dari `./kanbanActions.js`, dan tipe `RunHermes` dari `./hermesCli.js`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm -F @aos/core test` dan `pnpm -F @aos/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/core
git commit -m "feat(core): move and create kanban cards from the office through the official CLI" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Office — model murni, klien API, store, ketukan transport

**Files:**
- Create: `apps/office/src/shell/model.ts`, `apps/office/src/shell/api.ts`, `apps/office/src/shell/store.ts`
- Modify: `apps/office/src/hermes/transport.ts` (`onCoreTopic`, `onFocus`, `select`)
- Test: `apps/office/test/model.test.ts`, `apps/office/test/api.test.ts`, tambah di `apps/office/test/transport.test.ts`

**Interfaces:**
- Produces (`model.ts`):
  - `TIERS: Record<profile, 'os-brain'|'os-worker'|'os-private'>` (cermin `infra/profiles/roster.yaml`).
  - `KANBAN_COLUMNS = ['triage','todo','ready','running','blocked','review','done']`.
  - `canMove(from, to) -> boolean` (cermin `planMove` Core).
  - `applyKanbanChanges(tasks, changes) -> 'refetch'|'same'`.
  - `pushActivity(log, events, max=100) -> ActivityLog`.
  - `activityLine(ev) -> {ts, text, status}|null`.
  - `todayCost(daily) -> number`, `formatUsd(n) -> string`.
  - `sparkline(values, width=7) -> string` (blok Unicode ▁▂▃▄▅▆▇█).
  - `keyAction(e) -> {type:'focus', profile}|{type:'approvals'}|{type:'kanban'}|{type:'close'}|{type:'chat'}|null`.
- Produces (`api.ts`): `getApprovals()`, `decide(id, decision, note?)`, `getKanban()`, `moveCard(id, to, note)`, `createCard(input)`, `getDailyCosts(days)`, `getCosts(sinceMs)`, `getHealth()`, `getEvents(profile, limit)`, `getAgents()`. Semuanya `fetch` same-origin; error → `throw new Error(<pesan Core>)`.
- Produces (`store.ts`):
  - `interface ShellState { selected: string|null; dockTab: 'chat'|'cards'|'activity'|'agent'; drawerOpen: boolean; approvalsOpen: boolean; costsOpen: boolean; approvals: Approval[]; tasks: KanbanTask[]; daily: DailyCost[]; costs: CostSummary|null; health: HealthComponent[]; activity: Record<string, ActivityItem[]>; agents: AgentState[]; toast: string|null }`.
  - `shell.getState()`, `shell.subscribe(fn)`, `useShell(selector)`, dan actions: `select(profile|null)`, `setTab`, `toggleDrawer`, `toggleApprovals`, `toggleCosts`, `refreshAll()`, `onTopic(topic, data)`, `showToast(text)`.
- `HermesTransport` + `onCoreTopic(handler: (topic: string, data: unknown) => void): () => void` (dipanggil untuk setiap frame setelah adapter), `onFocus(handler: (agentId: number) => void): () => void` (dari pesan klien `focusAgent`), `select(agentId)` (mengirim `{type:'agentSelected', id}` ke UI vendor).

- [ ] **Step 1: Write the failing tests**

`apps/office/test/model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { activityLine, applyKanbanChanges, canMove, formatUsd, keyAction, pushActivity, sparkline, TIERS, todayCost } from '../src/shell/model.ts';

describe('model', () => {
  it('mirrors the roster tiers', () => {
    expect(TIERS).toEqual({ chief: 'os-brain', researcher: 'os-worker', secretary: 'os-private', content: 'os-worker', dev: 'os-brain' });
  });

  it('allows exactly the moves Core supports', () => {
    expect(canMove('blocked', 'ready')).toBe(true);
    expect(canMove('todo', 'ready')).toBe(true);
    expect(canMove('running', 'blocked')).toBe(true);
    expect(canMove('done', 'archived')).toBe(true);
    expect(canMove('done', 'ready')).toBe(false);
    expect(canMove('triage', 'ready')).toBe(false);
    expect(canMove('ready', 'running')).toBe(false);
    expect(canMove('blocked', 'blocked')).toBe(false);
  });

  it('asks for a refetch only when the board changed', () => {
    expect(applyKanbanChanges([])).toBe('same');
    expect(applyKanbanChanges([{ id: 't_1', change: 'status', status: 'done', previous: 'running' }])).toBe('refetch');
  });

  it('turns tool events into a capped activity log per profile', () => {
    const ev = (id: string, type: string, payload: Record<string, unknown>) => ({ id, ts: 1, type, profile: 'dev', mode: 'kanban', payload });
    expect(activityLine(ev('a', 'tool.started', { tool: 'terminal', args_preview: '{"command": "ls"}' }))).toEqual({ ts: 1, text: 'Menjalankan ls', status: 'mulai' });
    expect(activityLine(ev('b', 'tool.finished', { tool: 'terminal', status: 'blocked', duration_ms: 12 }))).toEqual({ ts: 1, text: 'terminal selesai (12 ms)', status: 'blocked' });
    expect(activityLine(ev('c', 'llm.started', {}))).toBeNull();
    const log = pushActivity({}, Array.from({ length: 5 }, (_, i) => ev(`e${i}`, 'tool.started', { tool: 'read_file' })), 3);
    expect(log.dev.map((x) => x.id)).toEqual(['e4', 'e3', 'e2']);
  });

  it('summarises costs', () => {
    expect(todayCost([{ day: 'a', cost_usd: 1, calls: 1 }, { day: 'b', cost_usd: 0.257, calls: 3 }])).toBe(0.257);
    expect(todayCost([])).toBe(0);
    expect(formatUsd(1.8449)).toBe('$1.84');
    expect(sparkline([0, 1, 2, 4])).toBe('▁▂▄█');
    expect(sparkline([0, 0])).toBe('▁▁');
  });

  it('maps shortcuts and ignores typing in fields', () => {
    const k = (key: string, extra: Partial<{ ctrlKey: boolean; target: unknown }> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, target: { tagName: 'DIV', isContentEditable: false }, ...extra });
    expect(keyAction(k('1'))).toEqual({ type: 'focus', profile: 'chief' });
    expect(keyAction(k('5'))).toEqual({ type: 'focus', profile: 'dev' });
    expect(keyAction(k('a'))).toEqual({ type: 'approvals' });
    expect(keyAction(k('B'))).toEqual({ type: 'kanban' });
    expect(keyAction(k('Escape'))).toEqual({ type: 'close' });
    expect(keyAction(k('k', { ctrlKey: true }))).toEqual({ type: 'chat' });
    expect(keyAction(k('a', { target: { tagName: 'INPUT', isContentEditable: false } }))).toBeNull();
    expect(keyAction(k('Escape', { target: { tagName: 'TEXTAREA', isContentEditable: false } }))).toEqual({ type: 'close' });
    expect(keyAction(k('x'))).toBeNull();
  });
});
```

`apps/office/test/api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCard, decide, getDailyCosts, moveCard } from '../src/shell/api.ts';

afterEach(() => vi.unstubAllGlobals());

function stub(status: number, body: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  });
  return calls;
}

describe('api', () => {
  it('posts decisions as the office', async () => {
    const calls = stub(200, { id: 'abc234', status: 'denied' });
    await decide('abc234', 'deny', 'jangan');
    expect(calls[0].url).toBe('/v1/approvals/abc234/decision');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ decision: 'deny', note: 'jangan', by: 'office' });
  });

  it('moves and creates cards, surfacing Core errors', async () => {
    stub(409, { error: 'Kartu berstatus done tidak bisa dipindah ke ready dari office.' });
    await expect(moveCard('t_1', 'ready', '')).rejects.toThrow('tidak bisa dipindah');
    const calls = stub(200, { ok: true, output: 'Created t_9', workspace: 'D:\\ws\\x' });
    await expect(createCard({ title: 'x', assignee: 'dev', body: '' })).resolves.toMatchObject({ ok: true });
    expect(calls[0].url).toBe('/v1/kanban');
    stub(200, [{ day: '2026-10-02', cost_usd: 1, calls: 2 }]);
    await expect(getDailyCosts(7)).resolves.toHaveLength(1);
  });
});
```

Tambahan `transport.test.ts`:

```ts
  it('exposes raw Core topics, focus clicks and programmatic selection', () => {
    const { t, got } = setup();
    const topics: string[] = [];
    const focus: number[] = [];
    t.onCoreTopic((topic) => topics.push(topic));
    t.onFocus((id) => focus.push(id));
    t.connect();
    FakeSocket.last!.open();
    FakeSocket.last!.push('health', [{ id: 'core' }]);
    FakeSocket.last!.push('events', []);
    t.send({ type: 'focusAgent', id: 3 });
    t.select(2);
    expect(topics).toEqual(['health', 'events']);
    expect(focus).toEqual([3]);
    expect(got).toContainEqual({ type: 'agentSelected', id: 2 });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F @aos/office test`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/office/src/shell/model.ts`:

```ts
import { activityLabel, PROFILES } from '../hermes/labels.ts';

export type Profile = (typeof PROFILES)[number];

export const TIERS: Record<Profile, 'os-brain' | 'os-worker' | 'os-private'> = {
  chief: 'os-brain',
  researcher: 'os-worker',
  secretary: 'os-private',
  content: 'os-worker',
  dev: 'os-brain',
};

export const KANBAN_COLUMNS = ['triage', 'todo', 'ready', 'running', 'blocked', 'review', 'done'] as const;

// Mirrors apps/core/src/kanbanActions.ts planMove.
export function canMove(from: string, to: string): boolean {
  if (from === 'triage') return false;
  if (to === 'ready') return from === 'blocked' || from === 'todo';
  if (to === 'blocked') return from === 'todo' || from === 'ready' || from === 'running';
  if (to === 'archived') return from !== 'archived';
  return false;
}

export function applyKanbanChanges(changes: unknown[]): 'refetch' | 'same' {
  return changes.length > 0 ? 'refetch' : 'same';
}

export interface CoreEventLike {
  id: string;
  ts: number;
  type: string;
  profile: string;
  mode: string;
  payload: Record<string, unknown>;
}

export interface ActivityItem {
  id: string;
  ts: number;
  text: string;
  status: string;
}

export type ActivityLog = Record<string, ActivityItem[]>;

export function activityLine(ev: CoreEventLike): { ts: number; text: string; status: string } | null {
  const p = ev.payload ?? {};
  const tool = typeof p.tool === 'string' ? p.tool : '?';
  if (ev.type === 'tool.started') return { ts: ev.ts, text: activityLabel(tool, p.args_preview), status: 'mulai' };
  if (ev.type === 'tool.finished') {
    const ms = typeof p.duration_ms === 'number' ? ` (${p.duration_ms} ms)` : '';
    return { ts: ev.ts, text: `${tool} selesai${ms}`, status: typeof p.status === 'string' ? p.status : 'ok' };
  }
  if (ev.type === 'breaker.tripped') return { ts: ev.ts, text: `Circuit breaker: ${String(p.reason ?? '')}`, status: 'breaker' };
  return null;
}

export function pushActivity(log: ActivityLog, events: CoreEventLike[], max = 100): ActivityLog {
  const next: ActivityLog = { ...log };
  for (const ev of events) {
    const line = activityLine(ev);
    if (!line) continue;
    next[ev.profile] = [{ id: ev.id, ...line }, ...(next[ev.profile] ?? [])].slice(0, max);
  }
  return next;
}

export function todayCost(daily: Array<{ cost_usd: number }>): number {
  return daily.length ? daily[daily.length - 1].cost_usd : 0;
}

export function formatUsd(n: number): string {
  return `$${(Math.floor(n * 100) / 100).toFixed(2)}`;
}

const BARS = '▁▂▃▄▅▆▇█';

export function sparkline(values: number[]): string {
  const max = Math.max(...values, 0);
  return values.map((v) => (max === 0 ? BARS[0] : BARS[Math.round((v / max) * (BARS.length - 1))])).join('');
}

export type KeyAction =
  | { type: 'focus'; profile: Profile }
  | { type: 'approvals' }
  | { type: 'kanban' }
  | { type: 'close' }
  | { type: 'chat' };

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: unknown;
}

function typing(target: unknown): boolean {
  const t = target as { tagName?: string; isContentEditable?: boolean } | null;
  return !!t && (t.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(String(t.tagName)));
}

export function keyAction(e: KeyLike): KeyAction | null {
  if (e.key === 'Escape') return { type: 'close' };
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') return { type: 'chat' };
  if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return null;
  const index = ['1', '2', '3', '4', '5'].indexOf(e.key);
  if (index >= 0) return { type: 'focus', profile: PROFILES[index] };
  if (e.key.toLowerCase() === 'a') return { type: 'approvals' };
  if (e.key.toLowerCase() === 'b') return { type: 'kanban' };
  return null;
}
```

`apps/office/src/shell/api.ts`:

```ts
export interface Approval {
  id: string;
  created_at: number;
  profile: string;
  task_id: string | null;
  mode: string;
  rule_id: string;
  tool: string;
  args_preview: string;
  reason: string | null;
  status: string;
}

export interface KanbanTask {
  id: string;
  title: string;
  assignee: string | null;
  status: string;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  workspace_path: string | null;
}

export interface DailyCost {
  day: string;
  cost_usd: number;
  calls: number;
}

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
  byModel: Array<CostTotals & { model: string | null }>;
  byTask: Array<CostTotals & { task_id: string }>;
}

export interface HealthComponent {
  id: string;
  label: string;
  status: 'ok' | 'down' | 'absent';
  detail: string;
}

export interface AgentState {
  profile: string;
  state: string;
  task_id: string | null;
  detail: string | null;
  updated_at: number | null;
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const getApprovals = () => call<Approval[]>('/v1/approvals?status=pending');
export const decide = (id: string, decision: 'approve' | 'deny', note?: string) =>
  call<Approval>(`/v1/approvals/${encodeURIComponent(id)}/decision`, post({ decision, ...(note ? { note } : {}), by: 'office' }));
export const getKanban = () => call<{ tasks: KanbanTask[] }>('/v1/kanban').then((r) => r.tasks);
export const moveCard = (id: string, to: string, note: string) => call<{ ok: true; output: string }>(`/v1/kanban/${encodeURIComponent(id)}/move`, post({ to, note }));
export const createCard = (input: { title: string; assignee: string; body: string }) => call<{ ok: true; output: string; workspace: string }>('/v1/kanban', post(input));
export const getDailyCosts = (days: number) => call<DailyCost[]>(`/v1/costs/daily?days=${days}`);
export const getCosts = (sinceMs: number) => call<CostSummary>(`/v1/costs?since=${sinceMs}`);
export const getHealth = () => call<HealthComponent[]>('/v1/health/components');
export const getEvents = (profile: string, limit = 50) => call<Array<Record<string, unknown>>>(`/v1/events?profile=${encodeURIComponent(profile)}&limit=${limit}`);
export const getAgents = () => call<AgentState[]>('/v1/agents');
```

`apps/office/src/shell/store.ts`:

```ts
import { useSyncExternalStore } from 'react';
import * as api from './api.ts';
import { type ActivityItem, type ActivityLog, applyKanbanChanges, type CoreEventLike, pushActivity } from './model.ts';

export type DockTab = 'chat' | 'cards' | 'activity' | 'agent';

export interface ShellState {
  selected: string | null;
  dockTab: DockTab;
  drawerOpen: boolean;
  approvalsOpen: boolean;
  costsOpen: boolean;
  approvals: api.Approval[];
  tasks: api.KanbanTask[];
  daily: api.DailyCost[];
  costs: api.CostSummary | null;
  health: api.HealthComponent[];
  activity: ActivityLog;
  agents: api.AgentState[];
  toast: string | null;
}

let state: ShellState = {
  selected: null,
  dockTab: 'cards',
  drawerOpen: false,
  approvalsOpen: false,
  costsOpen: false,
  approvals: [],
  tasks: [],
  daily: [],
  costs: null,
  health: [],
  activity: {},
  agents: [],
  toast: null,
};
const listeners = new Set<() => void>();

function set(patch: Partial<ShellState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

async function guard(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    set({ toast: (err as Error).message });
  }
}

export const shell = {
  getState: () => state,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  select(profile: string | null) {
    set({ selected: profile });
    if (profile) void guard(async () => {
      const events = await api.getEvents(profile, 50);
      set({ activity: { ...state.activity, [profile]: pushActivity({}, (events as unknown as CoreEventLike[]).slice().reverse())[profile] ?? [] } });
    });
  },
  setTab: (dockTab: DockTab) => set({ dockTab }),
  toggleDrawer: () => set({ drawerOpen: !state.drawerOpen }),
  toggleApprovals: () => set({ approvalsOpen: !state.approvalsOpen }),
  toggleCosts: () => set({ costsOpen: !state.costsOpen }),
  closeAll: () => set({ selected: null, drawerOpen: false, approvalsOpen: false, costsOpen: false }),
  showToast: (toast: string | null) => set({ toast }),
  refreshKanban: () => guard(async () => set({ tasks: await api.getKanban() })),
  refreshApprovals: () => guard(async () => set({ approvals: await api.getApprovals() })),
  refreshCosts: () => guard(async () => set({ daily: await api.getDailyCosts(7), costs: await api.getCosts(startOfToday()) })),
  refreshAll() {
    void this.refreshKanban();
    void this.refreshApprovals();
    void this.refreshCosts();
    void guard(async () => set({ health: await api.getHealth(), agents: await api.getAgents() }));
  },
  onTopic(topic: string, data: unknown) {
    if (topic === 'events' && Array.isArray(data)) set({ activity: pushActivity(state.activity, data as CoreEventLike[]) });
    if (topic === 'approvals') void this.refreshApprovals();
    if (topic === 'kanban' && Array.isArray(data) && applyKanbanChanges(data) === 'refetch') void this.refreshKanban();
    if (topic === 'costs') void this.refreshCosts();
    if (topic === 'health' && Array.isArray(data)) set({ health: data as api.HealthComponent[] });
    if (topic === 'agents' && Array.isArray(data)) set({ agents: data as api.AgentState[] });
  },
};

export function useShell<T>(selector: (s: ShellState) => T): T {
  return useSyncExternalStore(shell.subscribe, () => selector(state));
}

export type { ActivityItem };
```

> Selector `useShell` harus mengembalikan nilai stabil (properti state, bukan objek baru) agar `useSyncExternalStore` tidak loop. Komponen memilih satu properti per panggilan.

`apps/office/src/hermes/transport.ts`:
- Tambah field `private topicHandlers: Array<(topic: string, data: unknown) => void> = []` dan `private focusHandlers: Array<(id: number) => void> = []`.
- Di `ws.onmessage`, setelah dua baris adapter, tambahkan `for (const h of this.topicHandlers) h(topic, data);`.
- Di `send`, tambah `case 'focusAgent': for (const h of this.focusHandlers) h(message.id); break;`.
- Tambah method:

```ts
  onCoreTopic(handler: (topic: string, data: unknown) => void): () => void {
    this.topicHandlers.push(handler);
    return () => {
      this.topicHandlers = this.topicHandlers.filter((h) => h !== handler);
    };
  }

  onFocus(handler: (agentId: number) => void): () => void {
    this.focusHandlers.push(handler);
    return () => {
      this.focusHandlers = this.focusHandlers.filter((h) => h !== handler);
    };
  }

  select(agentId: number): void {
    this.deliver([{ type: 'agentSelected', id: agentId }]);
  }
```

Tambahkan juga `export let officeTransport: HermesTransport | null = null;` dan set `officeTransport = transport` di `createHermesTransport()` agar shell bisa menemukannya.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm -F @aos/office test` dan `pnpm -F @aos/office typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/office/src apps/office/test
git commit -m "feat(office): shell model, Core API client, store and transport taps for the workspace UI" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Office — kerangka layar, HUD, approval inbox, panel biaya, shortcut

**Files:**
- Create: `apps/office/src/shell/AosShell.tsx`, `apps/office/src/shell/Hud.tsx`, `apps/office/src/shell/ApprovalsPanel.tsx`, `apps/office/src/shell/CostPanel.tsx`
- Modify (patch vendor P6, P7): `vendor/pixel-agents/webview-ui/src/main.tsx`, `vendor/pixel-agents/webview-ui/src/index.css`, `vendor/pixel-agents/NOTICE.md`

**Interfaces:**
- Consumes: `shell`, `useShell`, `keyAction`, `formatUsd`, `todayCost`, `sparkline`, `officeTransport`, `agentIdFor`, `api.decide`.
- Produces:
  - `AosShell` (default export) merender `App` vendor + `Dock` (Task 5) + `KanbanDrawer` (Task 6) + `Hud`.
  - Layout `grid` dua kolom: kanvas `1fr`; dock `380px` hanya bila `selected` tidak null. Baris bawah HUD tinggi 48px.

- [ ] **Step 1: Patch P6 & P7.**

P6 `main.tsx`: ganti `import App from './App.tsx';` menjadi `import AosShell from '../../../../src/shell/AosShell.tsx';`, dan `<App />` menjadi `<AosShell />`. Komentar: `// Agentic OS (NOTICE P6): the office is wrapped by the dock/HUD shell.`

P7 `index.css`: tepat setelah `@import 'tailwindcss';` tambahkan `@source "../../../../src";` (agar kelas Tailwind di `apps/office/src` ikut ter-generate).

`NOTICE.md` tambah:
- `P6 webview-ui/src/main.tsx: merender AosShell (apps/office/src/shell) yang membungkus App.`
- `P7 webview-ui/src/index.css: @source "../../../../src" agar Tailwind memindai kode Agentic OS.`

- [ ] **Step 2: Tulis `AosShell.tsx`:**

```tsx
import { useEffect } from 'react';
import App from '../../vendor/pixel-agents/webview-ui/src/App.tsx';
import { agentIdFor, PROFILES } from '../hermes/labels.ts';
import { officeTransport } from '../hermes/transport.ts';
import { Dock } from './Dock.tsx';
import { Hud } from './Hud.tsx';
import { KanbanDrawer } from './KanbanDrawer.tsx';
import { keyAction } from './model.ts';
import { shell, useShell } from './store.ts';

export default function AosShell() {
  const selected = useShell((s) => s.selected);
  const toast = useShell((s) => s.toast);

  useEffect(() => {
    shell.refreshAll();
    const t = officeTransport;
    const offTopic = t?.onCoreTopic((topic, data) => shell.onTopic(topic, data));
    const offFocus = t?.onFocus((id) => shell.select(PROFILES[id - 1] ?? null));
    const onKey = (e: KeyboardEvent) => {
      const action = keyAction(e);
      if (!action) return;
      if (action.type === 'focus') {
        shell.select(action.profile);
        const id = agentIdFor(action.profile);
        if (id !== null) t?.select(id);
      } else if (action.type === 'approvals') shell.toggleApprovals();
      else if (action.type === 'kanban') shell.toggleDrawer();
      else if (action.type === 'close') shell.closeAll();
      else if (action.type === 'chat') {
        shell.select('chief');
        shell.setTab('chat');
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      offTopic?.();
      offFocus?.();
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => shell.showToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="w-full h-full grid" style={{ gridTemplateColumns: selected ? '1fr 380px' : '1fr', gridTemplateRows: '1fr 48px' }}>
      <div className="relative min-w-0 min-h-0">
        <App />
        <KanbanDrawer />
      </div>
      {selected && (
        <div className="row-span-1 min-h-0 border-l-2 border-border bg-bg-dark">
          <Dock profile={selected} />
        </div>
      )}
      <div style={{ gridColumn: '1 / -1' }}>
        <Hud />
      </div>
      {toast && (
        <div role="status" className="fixed bottom-60 left-1/2 -translate-x-1/2 z-50 pixel-panel px-12 py-6 text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Tulis `Hud.tsx`** (bar bawah dengan approval, biaya, kanban, kesehatan, petunjuk shortcut):

```tsx
import { ApprovalsPanel } from './ApprovalsPanel.tsx';
import { CostPanel } from './CostPanel.tsx';
import { formatUsd, sparkline, todayCost } from './model.ts';
import { shell, useShell } from './store.ts';

const DOT: Record<string, string> = { ok: 'bg-status-success', down: 'bg-danger', absent: 'bg-text-muted' };

export function Hud() {
  const approvals = useShell((s) => s.approvals);
  const daily = useShell((s) => s.daily);
  const health = useShell((s) => s.health);
  const approvalsOpen = useShell((s) => s.approvalsOpen);
  const costsOpen = useShell((s) => s.costsOpen);
  return (
    <div className="h-full flex items-center gap-16 px-12 bg-bg-dark border-t-2 border-border text-sm">
      <button type="button" onClick={() => shell.toggleApprovals()} className={`px-8 py-2 border-2 ${approvals.length ? 'border-status-permission text-status-permission' : 'border-transparent'} hover:bg-btn-hover`}>
        ⚠ Approval ({approvals.length})
      </button>
      <button type="button" onClick={() => shell.toggleCosts()} className="px-8 py-2 border-2 border-transparent hover:bg-btn-hover" title="Biaya 7 hari terakhir">
        $ hari ini {formatUsd(todayCost(daily))} <span aria-hidden="true">{sparkline(daily.map((d) => d.cost_usd))}</span>
      </button>
      <button type="button" onClick={() => shell.toggleDrawer()} className="px-8 py-2 border-2 border-transparent hover:bg-btn-hover">
        ▤ Kanban
      </button>
      <div className="flex items-center gap-8" aria-label="Kesehatan sistem">
        {health.map((c) => (
          <span key={c.id} className="flex items-center gap-4" title={`${c.label}: ${c.detail}`}>
            <span className={`inline-block w-8 h-8 ${DOT[c.status]}`} />
            <span className="text-text-muted">{c.label}</span>
          </span>
        ))}
      </div>
      <span className="ml-auto text-text-muted">1–5 agent · A approval · B kanban · Esc tutup</span>
      {approvalsOpen && <ApprovalsPanel />}
      {costsOpen && <CostPanel />}
    </div>
  );
}
```

- [ ] **Step 4: Tulis `ApprovalsPanel.tsx`** (kotak masuk: daftar, detail, Approve / Deny / Deny+instruksi):

```tsx
import { useState } from 'react';
import { Button } from '../../vendor/pixel-agents/webview-ui/src/components/ui/Button.tsx';
import * as api from './api.ts';
import { shell, useShell } from './store.ts';

export function ApprovalsPanel() {
  const approvals = useShell((s) => s.approvals);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function act(id: string, decision: 'approve' | 'deny') {
    setBusy(id);
    try {
      await api.decide(id, decision, notes[id]?.trim() || undefined);
      shell.showToast(decision === 'approve' ? `Izin ${id} disetujui.` : `Izin ${id} ditolak.`);
      await shell.refreshApprovals();
    } catch (err) {
      shell.showToast((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div role="dialog" aria-label="Kotak masuk approval" className="fixed bottom-56 left-12 z-40 w-[560px] max-h-[60vh] overflow-auto pixel-panel p-12 flex flex-col gap-12">
      <div className="flex items-center justify-between">
        <strong>Approval menunggu ({approvals.length})</strong>
        <Button size="sm" variant="ghost" onClick={() => shell.toggleApprovals()}>Tutup</Button>
      </div>
      {approvals.length === 0 && <p className="text-text-muted">Tidak ada yang menunggu.</p>}
      {approvals.map((a) => (
        <div key={a.id} className="border-2 border-border p-8 flex flex-col gap-6">
          <div className="flex justify-between">
            <span>
              <strong>{a.id}</strong> · {a.profile} · kartu {a.task_id ?? '-'}
            </span>
            <span className="text-text-muted">{new Date(a.created_at).toLocaleTimeString('id-ID')}</span>
          </div>
          <div>
            {a.tool} — aturan {a.rule_id}
            {a.reason ? ` (${a.reason})` : ''}
          </div>
          <details>
            <summary className="cursor-pointer text-text-muted">Detail argumen</summary>
            <pre className="whitespace-pre-wrap break-all text-xs">{a.args_preview}</pre>
          </details>
          <input
            aria-label={`Instruksi untuk ${a.id}`}
            placeholder="Instruksi/alasan (opsional)"
            className="bg-bg border-2 border-border px-6 py-2 text-sm"
            value={notes[a.id] ?? ''}
            onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
          />
          <div className="flex gap-8">
            <Button size="sm" variant="accent" disabled={busy === a.id} onClick={() => void act(a.id, 'approve')}>Setujui</Button>
            <Button size="sm" disabled={busy === a.id} onClick={() => void act(a.id, 'deny')}>Tolak</Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Tulis `CostPanel.tsx`** (rincian hari ini per agent/model/kartu + 7 hari):

```tsx
import { Button } from '../../vendor/pixel-agents/webview-ui/src/components/ui/Button.tsx';
import { formatUsd } from './model.ts';
import { shell, useShell } from './store.ts';

export function CostPanel() {
  const costs = useShell((s) => s.costs);
  const daily = useShell((s) => s.daily);
  const rows = (items: Array<{ cost_usd: number; calls: number }>, label: (x: never) => string) =>
    items.map((x, i) => (
      <tr key={i}>
        <td className="pr-12">{label(x as never)}</td>
        <td className="pr-12 text-right">{x.calls}</td>
        <td className="text-right">{formatUsd(x.cost_usd)}</td>
      </tr>
    ));
  return (
    <div role="dialog" aria-label="Rincian biaya" className="fixed bottom-56 left-200 z-40 w-[520px] max-h-[60vh] overflow-auto pixel-panel p-12 flex flex-col gap-12 text-sm">
      <div className="flex items-center justify-between">
        <strong>Biaya hari ini {costs ? formatUsd(costs.total.cost_usd) : '…'}</strong>
        <Button size="sm" variant="ghost" onClick={() => shell.toggleCosts()}>Tutup</Button>
      </div>
      {costs && (
        <>
          <table>
            <thead><tr><th className="text-left">Agent</th><th className="text-right">Panggilan</th><th className="text-right">USD</th></tr></thead>
            <tbody>{rows(costs.byProfile, (x: { profile: string }) => x.profile)}</tbody>
          </table>
          <table>
            <thead><tr><th className="text-left">Model</th><th className="text-right">Panggilan</th><th className="text-right">USD</th></tr></thead>
            <tbody>{rows(costs.byModel, (x: { model: string | null }) => x.model ?? '-')}</tbody>
          </table>
          {costs.byTask.length > 0 && (
            <table>
              <thead><tr><th className="text-left">Kartu</th><th className="text-right">Panggilan</th><th className="text-right">USD</th></tr></thead>
              <tbody>{rows(costs.byTask, (x: { task_id: string }) => x.task_id)}</tbody>
            </table>
          )}
          {costs.byProfile.every((p) => p.profile === 'shared') && (
            <p className="text-text-muted">Semua biaya tercatat sebagai "shared" sampai key 9Router per agent dibuat (runbook §3).</p>
          )}
        </>
      )}
      <table>
        <thead><tr><th className="text-left">Hari</th><th className="text-right">Panggilan</th><th className="text-right">USD</th></tr></thead>
        <tbody>{rows(daily, (x: { day: string }) => x.day)}</tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 6: Typecheck & build**

Run: `pnpm -F @aos/office typecheck` dan `pnpm -F @aos/office build`
Expected: PASS. `Dock.tsx` dan `KanbanDrawer.tsx` dibuat di Task 5–6; untuk task ini buat stub sementara:
- `export function Dock({ profile }: { profile: string }) { return <div className="p-12">{profile}</div>; }`
- `export function KanbanDrawer() { return null; }`

- [ ] **Step 7: Commit**

```bash
git add apps/office
git commit -m "feat(office): dock/HUD shell with approval inbox, costs, health and keyboard shortcuts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Office — dock agent (Kartu, Aktivitas, Agent, Chat placeholder)

**Files:**
- Create / replace stub: `apps/office/src/shell/Dock.tsx`

**Interfaces:**
- Consumes: `useShell` (`tasks`, `activity`, `agents`, `costs`, `dockTab`), `TIERS`, `shell.setTab`, `shell.select`.
- Produces:
  - `Dock({profile})` dengan header (nama, tier, state dan detail terakhir) dan 4 tab:
    - **Chat**: teks "Chat langsung dengan agent hadir di M5b. Sementara pakai Telegram (chief) atau `hermes -p <agent> chat`."
    - **Kartu**: kartu aktif (status bukan done/archived) + 10 riwayat terakhir untuk assignee ini.
    - **Aktivitas**: log tool live, max 100.
    - **Agent**: tier, state, detail/model terakhir, biaya hari ini agent ini, plus catatan bila biaya masih "shared".

- [ ] **Step 1: Tulis `Dock.tsx`:**

```tsx
import { Button } from '../../vendor/pixel-agents/webview-ui/src/components/ui/Button.tsx';
import { formatUsd, type Profile, TIERS } from './model.ts';
import { type DockTab, shell, useShell } from './store.ts';

const TABS: Array<[DockTab, string]> = [['chat', 'Chat'], ['cards', 'Kartu'], ['activity', 'Aktivitas'], ['agent', 'Agent']];
const ACTIVE = new Set(['triage', 'todo', 'ready', 'running', 'blocked', 'review']);

export function Dock({ profile }: { profile: string }) {
  const tab = useShell((s) => s.dockTab);
  const tasks = useShell((s) => s.tasks);
  const activity = useShell((s) => s.activity);
  const agents = useShell((s) => s.agents);
  const costs = useShell((s) => s.costs);
  const agent = agents.find((a) => a.profile === profile);
  const mine = tasks.filter((t) => t.assignee === profile);
  const active = mine.filter((t) => ACTIVE.has(t.status));
  const history = mine.filter((t) => !ACTIVE.has(t.status)).slice(0, 10);
  const cost = costs?.byProfile.find((p) => p.profile === profile);

  return (
    <aside aria-label={`Dock ${profile}`} className="h-full flex flex-col text-sm">
      <header className="flex items-center justify-between p-12 border-b-2 border-border">
        <div>
          <div className="text-base">{profile}</div>
          <div className="text-text-muted">
            {TIERS[profile as Profile] ?? '-'} · {agent?.state ?? 'offline'}
            {agent?.detail ? ` · ${agent.detail}` : ''}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => shell.select(null)} aria-label="Tutup dock">✕</Button>
      </header>
      <nav className="flex border-b-2 border-border" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => shell.setTab(id)} className={`flex-1 py-6 ${tab === id ? 'bg-active-bg' : 'hover:bg-btn-hover'}`}>
            {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto p-12 flex flex-col gap-8">
        {tab === 'chat' && (
          <p className="text-text-muted">Chat langsung dengan agent hadir di M5b. Sementara pakai Telegram (chief) atau `hermes -p {profile} chat`.</p>
        )}
        {tab === 'cards' && (
          <>
            <strong>Aktif ({active.length})</strong>
            {active.length === 0 && <p className="text-text-muted">Tidak ada kartu aktif.</p>}
            {active.map((t) => (
              <div key={t.id} className="border-2 border-border p-6">
                <div>{t.title}</div>
                <div className="text-text-muted">{t.id} · {t.status}</div>
              </div>
            ))}
            <strong>Riwayat</strong>
            {history.map((t) => (
              <div key={t.id} className="text-text-muted">{t.id} · {t.status} · {t.title}</div>
            ))}
          </>
        )}
        {tab === 'activity' && (
          <ol className="flex flex-col gap-4">
            {(activity[profile] ?? []).length === 0 && <li className="text-text-muted">Belum ada aktivitas.</li>}
            {(activity[profile] ?? []).map((a) => (
              <li key={a.id} className="flex justify-between gap-8">
                <span>{a.text}</span>
                <span className={a.status === 'blocked' || a.status === 'breaker' ? 'text-status-permission' : 'text-text-muted'}>
                  {a.status} · {new Date(a.ts).toLocaleTimeString('id-ID')}
                </span>
              </li>
            ))}
          </ol>
        )}
        {tab === 'agent' && (
          <dl className="grid grid-cols-2 gap-6">
            <dt className="text-text-muted">Tier</dt><dd>{TIERS[profile as Profile] ?? '-'}</dd>
            <dt className="text-text-muted">State</dt><dd>{agent?.state ?? 'offline'}</dd>
            <dt className="text-text-muted">Terakhir</dt><dd>{agent?.detail ?? '-'}</dd>
            <dt className="text-text-muted">Biaya hari ini</dt><dd>{cost ? formatUsd(cost.cost_usd) : 'tercatat sebagai shared'}</dd>
          </dl>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck, test, build**

Run: `pnpm -F @aos/office typecheck`, `pnpm -F @aos/office test`, `pnpm -F @aos/office build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/office/src/shell/Dock.tsx
git commit -m "feat(office): agent dock with cards, live activity and agent info" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Office — laci kanban (kolom, filter, drag & drop, buat kartu)

**Files:**
- Create / replace stub: `apps/office/src/shell/KanbanDrawer.tsx`

**Interfaces:**
- Consumes: `KANBAN_COLUMNS`, `canMove`, `api.moveCard`, `api.createCard`, `shell.refreshKanban`, `shell.showToast`, `PROFILES`.
- Produces:
  - Laci (posisi `absolute` di dalam area kanvas, tinggi 60%, `transition` dimatikan saat `prefers-reduced-motion`).
  - Kolom per status + kolom drop "Arsip".
  - Filter agent.
  - Drag kartu (HTML5 DnD) ke kolom tujuan: bila `canMove` false, kolom diberi tanda tidak bisa dan drop ditolak dengan toast. Untuk `blocked → ready`, sebuah prompt instruksi (`window.prompt`) dicatat sebagai `--reason`.
  - Form "Kartu baru" (judul, assignee, body), setelah itu `refreshKanban`.

- [ ] **Step 1: Tulis `KanbanDrawer.tsx`:**

```tsx
import { type DragEvent, useState } from 'react';
import { Button } from '../../vendor/pixel-agents/webview-ui/src/components/ui/Button.tsx';
import { PROFILES } from '../hermes/labels.ts';
import * as api from './api.ts';
import { canMove, KANBAN_COLUMNS } from './model.ts';
import { shell, useShell } from './store.ts';

const TARGETS = [...KANBAN_COLUMNS, 'archived'] as const;
const LABEL: Record<string, string> = {
  triage: 'Triage', todo: 'Todo', ready: 'Ready', running: 'Running', blocked: 'Blocked', review: 'Review', done: 'Done', archived: 'Arsip',
};

export function KanbanDrawer() {
  const open = useShell((s) => s.drawerOpen);
  const tasks = useShell((s) => s.tasks);
  const [filter, setFilter] = useState('');
  const [dragging, setDragging] = useState<api.KanbanTask | null>(null);
  const [form, setForm] = useState({ title: '', assignee: 'researcher', body: '' });
  const [creating, setCreating] = useState(false);
  if (!open) return null;

  const visible = tasks.filter((t) => t.status !== 'archived' && (!filter || t.assignee === filter));

  async function drop(e: DragEvent, to: string) {
    e.preventDefault();
    const task = dragging;
    setDragging(null);
    if (!task || task.status === to) return;
    if (!canMove(task.status, to)) {
      shell.showToast(`Tidak bisa memindah ${task.status} → ${to} dari office.`);
      return;
    }
    const note = task.status === 'blocked' && to === 'ready' ? (window.prompt('Instruksi tambahan untuk agent (opsional):') ?? '') : '';
    try {
      await api.moveCard(task.id, to, note);
      shell.showToast(`${task.id} dipindah ke ${to}.`);
      await shell.refreshKanban();
    } catch (err) {
      shell.showToast((err as Error).message);
    }
  }

  async function create() {
    setCreating(true);
    try {
      const r = await api.createCard(form);
      shell.showToast(r.output);
      setForm({ ...form, title: '', body: '' });
      await shell.refreshKanban();
    } catch (err) {
      shell.showToast((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section aria-label="Laci kanban" className="absolute left-0 right-0 bottom-0 h-[60%] z-30 bg-bg-dark border-t-2 border-border flex flex-col motion-safe:transition-transform">
      <div className="flex items-center gap-12 p-8 border-b-2 border-border text-sm">
        <strong>Kanban</strong>
        <label className="flex items-center gap-6">
          Agent
          <select aria-label="Filter agent" className="bg-bg border-2 border-border" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">semua</option>
            {PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <input aria-label="Judul kartu baru" placeholder="Judul kartu baru" className="bg-bg border-2 border-border px-6 flex-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <select aria-label="Assignee kartu baru" className="bg-bg border-2 border-border" value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
          {PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input aria-label="Isi kartu baru" placeholder="Goal / acceptance criteria" className="bg-bg border-2 border-border px-6 flex-1" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <Button size="sm" variant="accent" disabled={creating || !form.title.trim()} onClick={() => void create()}>Buat</Button>
        <Button size="sm" variant="ghost" onClick={() => shell.toggleDrawer()}>Tutup</Button>
      </div>
      <div className="flex-1 grid gap-6 p-8 overflow-auto" style={{ gridTemplateColumns: `repeat(${TARGETS.length}, minmax(160px, 1fr))` }}>
        {TARGETS.map((col) => {
          const blocked = dragging !== null && dragging.status !== col && !canMove(dragging.status, col);
          return (
            <div
              key={col}
              aria-label={`Kolom ${LABEL[col]}`}
              onDragOver={(e) => { if (!blocked) e.preventDefault(); }}
              onDrop={(e) => void drop(e, col)}
              className={`flex flex-col gap-6 p-6 border-2 ${blocked ? 'border-danger opacity-50' : 'border-border'}`}
            >
              <div className="text-text-muted text-sm">{LABEL[col]} ({col === 'archived' ? '' : visible.filter((t) => t.status === col).length})</div>
              {col !== 'archived' &&
                visible.filter((t) => t.status === col).map((t) => (
                  <div key={t.id} draggable onDragStart={() => setDragging(t)} onDragEnd={() => setDragging(null)} className="border-2 border-border bg-bg p-6 cursor-grab text-sm">
                    <div>{t.title}</div>
                    <div className="text-text-muted">{t.id} · {t.assignee ?? '-'}</div>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck, test, build**

Run: `pnpm -F @aos/office typecheck`, `pnpm -F @aos/office test`, `pnpm -F @aos/office build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/office/src/shell/KanbanDrawer.tsx
git commit -m "feat(office): kanban drawer with drag and drop moves and card creation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verifikasi di mesin + dokumentasi

**Files:**
- Modify: `docs/runbook.md`, `docs/PRD-Agentic-OS.md`

- [ ] **Step 1: Siap merge.**

Run:
- `pnpm -r test`
- `pnpm -r typecheck`
- `pnpm office:build`
- `py -3 -m pytest packages tests/redteam -q`

Semua harus hijau.

- [ ] **Step 2: Restart Core (izin owner)** via `explorer.exe` agar rute baru aktif; `GET /v1/health` → ok.

- [ ] **Step 3: Verifikasi visual** (preview `office` di Vite dev, seperti M4; screenshot tiap butir):
  - **W1 HUD**:
    - Bar bawah tampil: ⚠ Approval (n), "$ hari ini" + sparkline, ▤ Kanban.
    - Titik kesehatan: Core/Gateway/9Router/Docker hijau, Hermes serve abu-abu "dipasang di M5b", Ollama abu-abu.
    - Klik "$" → panel biaya tampil (catatan "shared").
  - **W2 dock (US-07 sebagian)**:
    - Klik karakter `researcher` → dock kanan terbuka, tab Kartu/Aktivitas/Agent berisi data.
    - Tekan `3` → dock secretary dan karakter terpilih.
    - `Esc` menutup dock.
  - **W3 aktivitas live**: jalankan `hermes -p researcher chat -q` singkat (seperti M4 V1) → tab Aktivitas researcher menampilkan "Membaca …" lalu "read_file selesai (… ms)".
  - **W4 approval dari kantor (US-09)**:
    - Kartu `dev` "git push" ke remote dummy (seperti M4 V2).
    - HUD menunjukkan ⚠ Approval (1). Tekan `A` → isi instruksi "uji tolak dari office" → **Tolak**.
    - Harapan: Core mencatat `decided_by=office`, gelembung dev hilang, kartu dilanjutkan dengan `DENIED_BY_OWNER`.
  - **W5 laci kanban (US-08)**:
    - Tekan `B` → laci terbuka dengan kolom berisi kartu.
    - Buat kartu uji "Uji M5a drag" untuk `researcher` dengan body "Goal: tulis kata halo ke halo.md". Harapan: kartu muncul di Ready, lalu dikerjakan dispatcher.
    - Kartu lain yang `blocked` (misalnya kartu `dev` W4 setelah selesai, atau blok manual dari laci: seret kartu Ready → Blocked) diseret ke Ready dengan instruksi → `hermes kanban show` memuat komentar `UNBLOCK: <instruksi>`.
    - Seret kartu Done → Arsip → status `archived`.
    - Seret Done → Ready: kolom ditandai merah dan muncul toast penolakan.
  - **W6 shortcut & teks**: `Ctrl+K` membuka dock chief tab Chat (placeholder M5b). Mengetik di input laci tidak memicu shortcut.

- [ ] **Step 4: Bersihkan.** Arsipkan kartu uji (lewat laci) dan pindahkan workspace uji ke `_archive\m5a-tests\`.

- [ ] **Step 5: Dokumentasi.**
  - **`docs/runbook.md`:**
    - §3 "Pixel office": dock (klik karakter / 1–5), HUD (approval, biaya, kesehatan), laci kanban (aturan pindah & buat kartu), shortcut.
    - Rute Core baru: `/v1/health/components`, `/v1/costs/daily`, `/v1/events`, `/v1/kanban/:id/move`, `POST /v1/kanban`.
    - §4: chat menyusul M5b; triage tidak bisa dipindah dari office; biaya per agent masih "shared".
    - §5 "Bukti exit M5a".
  - **`docs/PRD-Agentic-OS.md`:**
    - §5.4.1 modul `health` dan `kanban-actions` terpasang.
    - §5.4.2 rute.
    - §5.5.4–5.5.6 status M5a.
    - §13: M5 dipecah M5a ✅ / M5b (chat).
    - §16 sisa.

- [ ] **Step 6: Commit docs**

```bash
git add docs/runbook.md docs/PRD-Agentic-OS.md
git commit -m "docs: record M5a office workspace verification in runbook and PRD" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Cakupan M5 (PRD §13) di M5a:**

| Bagian M5 | Task |
|---|---|
| Dock (kartu, log) | 5 |
| HUD (approval, biaya, kesehatan) | 1, 4 |
| Laci kanban | 2, 6 |
| Shortcut | 3, 4 |
| Chat | M5b |

**User story yang terbuka di M5a:**
- US-07 sebagian: kartu dan log; chat menyusul M5b.
- US-08.
- US-09 dari office.
- US-11.

**Konsistensi:**
- `canMove` (office) = `planMove` (Core): diuji di kedua sisi dengan kasus yang sama.
- Bentuk `HealthComponent`, `DailyCost`, dan `Approval` sama di Core dan `api.ts`.
- Topik hub baru `health` dipakai `store.onTopic`.

**Keamanan:**
- Semua rute baru memakai auth UI.
- Mutasi kanban hanya lewat CLI resmi.
- Catatan pengguna diteruskan sebagai data (tidak pernah menjadi flag CLI), diuji `planMove` dengan `--help`.
