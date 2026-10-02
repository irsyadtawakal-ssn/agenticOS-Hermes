# M5b — Pixel Office: Chat lewat `hermes serve` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner bisa mengobrol langsung dengan agent mana pun dari tab **Chat** di dock kantor. Yang didukung:
- Jawaban mengalir (streaming).
- Ringkasan tool.
- Permintaan izin (approval) dan pertanyaan agent (clarify) dijawab di chat.
- Sesi lama bisa dibuka lagi.
- Sesi berjalan di `hermes serve` milik Agentic OS, dengan token yang tidak pernah sampai ke browser.

**Architecture:**
- **Proses.** OS Core menjalankan dan mengawasi satu proses `hermes serve --isolated` di `127.0.0.1:9129`, dengan:
  - `HERMES_HOME` Agentic OS;
  - token sesi dari `.env.local` (`AOS_SERVE_TOKEN`);
  - lock dir host **privat** (`D:\agentic-os\serve-locks`);
  - `HERMES_PARENT_PID` = PID Core (serve ikut mati bila Core mati);
  - `HERMES_DESKTOP` dihapus dari env.
- **Relay.** Browser membuka WS `/v1/chat` ke Core (auth cookie/proxy UI seperti `/v1/stream`). Core membuka WS `ws://127.0.0.1:9129/api/ws?token=…` dan meneruskan frame JSON-RPC lewat `ChatRelay`:
  - **allowlist** 12 metode;
  - cwd sesi dipaksa ke `workspaces\chat\<profile>`;
  - teks yang diawali `/` ditolak;
  - hanya sesi yang dibuat dari kantor yang bisa dibuka lagi;
  - permintaan server selain `approval`/`clarify` dijawab "tidak didukung".
- **Kantor.** Client JSON-RPC kecil sendiri (`apps/office/src/chat/rpc.ts`), reducer murni (`model.ts`), store, dan `ChatPanel` di tab Chat dock.

**Tech Stack:**
- Core: Fastify 5 + `@fastify/websocket`; client upstream memakai `WebSocket` bawaan Node 22, yang sudah diuji bisa mengirim header `Origin`. Tanpa dependency baru.
- Office: React 19 + Tailwind 4 (1 unit spacing = 1px, token warna vendor, komponen `Button` vendor). Tanpa dependency baru.

**Spec:** `docs/PRD-Agentic-OS.md`:
- §5.5.4 (dock: chat penuh, riwayat sesi)
- §5.5.6 (`Ctrl+K` chat ke chief)
- §5.4 (Core)
- §8 (keamanan)
- §13 baris M5b

Fakta terpasang ada di `docs/runbook.md` (M1–M5a).

**Hasil riset (Hermes v0.21.5, source `%LOCALAPPDATA%\hermes\hermes-agent`):**
- **Lock dir.** `hermes serve` (juga dengan `--isolated`) mendaftarkan record role `serve` di lock dir host (`gateway/host_rendezvous.py`, `hermes_cli/web_server.py::_publish_host_rendezvous`). Di dir bawaan, `hermes serve`/`dashboard`/`plugins install` milik owner akan menempel ke instance kita. Lock dir privat lewat `HERMES_GATEWAY_LOCK_DIR` memisahkannya. Lock dir hanya berisi record role dan lock token platform (Telegram), yang tidak dipakai serve (`gateway/status.py::_get_lock_dir`).
- **Mode Desktop.** Hanya backend "milik Desktop" (`HERMES_DESKTOP=1` + `HERMES_DASHBOARD_SESSION_TOKEN`) yang menjalankan ticker cron dan memanen gateway yatim (`process_identity.py::is_desktop_owned_backend`, `web_server.py:250-274`). Karena itu `HERMES_DESKTOP` **wajib** dihapus dari env serve. Kanban dispatcher tidak ada di serve.
- **Parent watchdog.** `HERMES_PARENT_PID` mengaktifkan watchdog kematian parent untuk serve standalone (`web_server.py:1342`).
- **Port tetap 9129** (bukan 0), agar pemanen "Desktop-local serve" (`dashboard_procs.py`, bentuk `--port 0`) tidak menyasar instance kita. Default serve owner = 9119.
- **Protokol** (`apps/shared/src/gateway-contract.openrpc.json`, JSON-RPC 2.0):
  - Event: `{method:"event", params:{type, session_id, payload, seq}}`.
  - Permintaan server: `{id:<string>, method:"approval"|"clarify"|…, params}`, dijawab `{id, result}`.
  - `approval` → `{choice: once|session|always|deny}`; `clarify` → `{answer}` atau `{answers:{qid: …}}`.
  - Setelah event `gateway.ready`, client mengirim `client.capabilities {server_requests:true}`.
  - `session.create {profile, cwd, cwd_explicit}` → `{session_id (runtime), stored_session_id}`.
  - `session.resume {session_id: stored, profile}` → `{session_id, messages, open_requests}`.
  - `session.list {profile, limit}` → `{sessions:[{id, title, preview, started_at, message_count, source}]}`.
  - `prompt.submit {session_id, text}`.
  - Event chat: `message.start|delta|complete`, `tool.start|complete`, `error`.
- **Bahaya.** Serve juga punya `shell.exec`, `cli.exec`, `config.set`, `plugins.manage`, `process.kill`, `/api/pty` (250+ metode). Browser **tidak boleh** bicara langsung dengan serve.
- **Policy & bridge.** Sesi serve berplatform `tui`. os-bridge memperlakukannya sebagai konteks `interactive`, jadi aturan "approve" jatuh ke gate bawaan Hermes, yang mengirim permintaan server `approval` ke client. Core menerima mode event `tui` (string ≤ 32).
- **Sandbox.** Worker (`researcher/secretary/content/dev`) me-mount **cwd sesi** ke sandbox Docker (runbook §3 "Aturan keamanan operasional"). Karena itu cwd sesi harus folder chat khusus, bukan cwd proses.

## Global Constraints

- **Token.**
  - Token serve hanya ada di `.env.local` dan env proses serve. Tidak boleh dicetak, di-log, atau dikirim ke browser.
  - Kantor tetap tanpa token di JavaScript (cookie `aos_ui` di prod, proxy Vite di dev).
  - Env `AOS_*` milik Core tidak diteruskan ke proses serve.
- **Mutasi kanban** tetap hanya lewat CLI resmi (tidak berubah).
- **Restart Core/gateway** hanya lewat `explorer.exe "<Startup>\AgenticOS_Core.vbs"` (runbook §3 "Menyalakan ulang proses"). Proses yang dijalankan dari shell tool mati diam-diam.
- **Izin owner dulu** untuk langkah yang menyentuh mesin:
  - spike serve live;
  - menulis `AOS_SERVE_TOKEN`/`AOS_SERVE_PORT` ke `.env.local`;
  - restart Core;
  - uji live.
- **Bahasa.** Teks UI, pesan error relay, dan dokumen berbahasa Indonesia. Kode, identifier, dan pesan commit berbahasa Inggris. Trailer commit persis: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Vendor.** Pixel Agents tidak dipatch lagi; semua kode baru ada di `apps/office/src/chat/` dan `apps/office/src/shell/Dock.tsx`.
- **Allowlist relay** (persis): `ping`, `client.capabilities`, `session.create`, `session.list`, `session.resume`, `session.history`, `session.interrupt`, `session.close`, `session.events.since`, `approval.pending`, `approval.respond`, `prompt.submit`.

## File Structure

| File | Tanggung jawab |
|---|---|
| `apps/core/src/config.ts` (ubah) | `serveToken`, `servePort` (9129 bila token ada), `serveLockDir`, `chatRoot` |
| `apps/core/src/serve.ts` (baru) | `serveLaunch()` murni (argumen + env aman) dan `superviseServe()` (spawn + restart backoff) |
| `apps/core/src/health.ts` (ubah) | Detail `serve` saat nonaktif |
| `apps/core/src/db.ts` (ubah) | Tabel `chat_sessions` |
| `apps/core/src/chatSessions.ts` (baru) | `rememberChatSession`, `knownChatSessions` |
| `apps/core/src/chatRelay.ts` (baru) | `ChatRelay`: kebijakan frame client↔serve (murni, tanpa I/O) |
| `apps/core/src/server.ts` (ubah) | Rute WS `/v1/chat` yang menyambung browser ↔ upstream lewat `ChatRelay` |
| `apps/core/src/main.ts` (ubah) | Menjalankan supervisor serve, membuat folder chat, membangun `deps.chat` |
| `apps/office/src/chat/rpc.ts` (baru) | `ChatRpc`: client JSON-RPC WS minimal |
| `apps/office/src/chat/model.ts` (baru) | Reducer murni event → item chat, transkrip → item, permintaan server → kartu |
| `apps/office/src/chat/store.ts` (baru) | Satu koneksi bersama, state per profile, aksi (kirim, sesi baru, buka sesi, hentikan, jawab) |
| `apps/office/src/chat/ChatPanel.tsx` (baru) | UI chat di dock |
| `apps/office/src/shell/Dock.tsx` (ubah) | Tab Chat merender `ChatPanel` |
| `infra/windows/set-local-secrets.ps1` (ubah) | Membuat `AOS_SERVE_TOKEN` + `AOS_SERVE_PORT` |

---

### Task 1: Spike live `hermes serve` (izin owner)

Tujuan: memastikan asumsi protokol sebelum kode ditulis. Task ini tidak menghasilkan kode produksi, hanya catatan di bagian "Catatan spike" di bawah.

**Files:**
- Create (scratchpad, tidak di-commit): `<scratchpad>/spike-serve.mjs`

- [ ] **Step 1: Minta izin owner.** Spike menjalankan `hermes serve` sementara di port 9139 dengan lock dir `D:\agentic-os\serve-locks-spike` dan satu prompt pendek ke `chief` lewat 9Router.

- [ ] **Step 2: Siapkan folder dan jalankan serve di background** (Bash, `run_in_background: true`). Token hanya disimpan di file scratchpad, tidak dicetak.

```bash
SP="<scratchpad>"; mkdir -p /d/agentic-os/serve-locks-spike /d/agentic-os/hermes-home/workspaces/chat/chief
node -e "require('fs').writeFileSync(process.argv[1], require('crypto').randomBytes(24).toString('hex'))" "$SP/spike-token"
env -u HERMES_DESKTOP HERMES_HOME='D:\agentic-os\hermes-home' HERMES_DASHBOARD_SESSION_TOKEN="$(cat "$SP/spike-token")" HERMES_GATEWAY_LOCK_DIR='D:\agentic-os\serve-locks-spike' hermes serve --isolated --skip-build --host 127.0.0.1 --port 9139 > "$SP/spike-serve.log" 2>&1
```

- [ ] **Step 3: Tulis skrip spike** `<scratchpad>/spike-serve.mjs`:

```js
import { readFileSync } from 'node:fs';
const token = readFileSync(process.argv[2], 'utf8').trim();
const ws = new WebSocket(`ws://127.0.0.1:9139/api/ws?token=${token}`, { headers: { Origin: 'http://127.0.0.1:9139' } });
let id = 0;
const pending = new Map();
const call = (method, params) => new Promise((resolve, reject) => {
  const n = ++id; pending.set(n, { resolve, reject });
  ws.send(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }));
});
const seen = [];
let done;
const finished = new Promise((r) => (done = r));
ws.onmessage = (e) => {
  const f = JSON.parse(String(e.data));
  if (f.method === 'event') {
    const p = f.params;
    seen.push(`${p.type}${p.type === 'message.delta' ? ':' + JSON.stringify(p.payload?.text) : ''}`);
    if (p.type === 'message.complete') { console.log('complete.text=', JSON.stringify(p.payload?.text)?.slice(0, 80)); done(); }
    return;
  }
  if (typeof f.method === 'string') { console.log('server request', f.method, Object.keys(f.params ?? {})); return; }
  const c = pending.get(f.id); pending.delete(f.id);
  if (f.error) c?.reject(new Error(JSON.stringify(f.error))); else c?.resolve(f.result);
};
ws.onopen = async () => {
  try {
    await new Promise((r) => setTimeout(r, 500));
    console.log('caps', JSON.stringify(await call('client.capabilities', { server_requests: true })));
    const s = await call('session.create', { profile: 'chief', cwd: 'D:\\agentic-os\\hermes-home\\workspaces\\chat\\chief', cwd_explicit: true });
    console.log('create keys', Object.keys(s), 'session_id?', typeof s.session_id, 'stored?', typeof s.stored_session_id);
    console.log('submit', JSON.stringify(await call('prompt.submit', { session_id: s.session_id, text: 'Balas hanya dengan satu kata: pong' })));
    await Promise.race([finished, new Promise((r) => setTimeout(r, 180000))]);
    console.log('events', seen.slice(0, 40).join(' | '));
    const list = await call('session.list', { profile: 'chief', limit: 3 });
    console.log('list row', JSON.stringify(list.sessions?.[0] ?? null).slice(0, 300));
    const resumed = await call('session.resume', { profile: 'chief', session_id: s.stored_session_id });
    console.log('resume keys', Object.keys(resumed), 'messages', resumed.messages?.length, JSON.stringify(resumed.messages?.[0] ?? null).slice(0, 200));
    try { await call('shell.exec', { command: 'echo hi' }); console.log('shell.exec DIIZINKAN serve (relay wajib memblok)'); } catch (e) { console.log('shell.exec error', e.message.slice(0, 120)); }
  } catch (e) { console.log('FAIL', e.message); }
  ws.close();
};
ws.onerror = () => console.log('ws error');
```

- [ ] **Step 4: Jalankan** setelah serve siap (tunggu `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:9139/` mengembalikan kode < 500):

Run: `node "<scratchpad>/spike-serve.mjs" "<scratchpad>/spike-token"`

Expected:
- `create keys` memuat `session_id` dan `stored_session_id`.
- Event berurutan `message.start`/`message.delta`/`message.complete`.
- `list row` punya `id` = `stored_session_id` dan `started_at`.
- `resume` mengembalikan `messages`.

- [ ] **Step 5: Periksa isolasi lock dir:**

```bash
ls /d/agentic-os/serve-locks-spike; ls "$USERPROFILE/.local/state/hermes/gateway-locks"
```

Expected:
- `host-serve.json` ada di `serve-locks-spike`.
- **Tidak** ada `host-serve.json` di `gateway-locks`; `host-gateway.json` milik gateway tetap.

- [ ] **Step 6: Matikan serve spike dan bersihkan.**

```powershell
$c = Get-NetTCPConnection -LocalPort 9139 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { Stop-Process -Id $c.OwningProcess -Force -Confirm:$false }
```

Lalu hapus `spike-token`, dan hapus `D:\agentic-os\serve-locks-spike` setelah port mati.

- [ ] **Step 7: Catat hasil** di bagian "Catatan spike" di akhir rencana ini. Isi yang dicatat:
  - Apakah `message.delta.text` berupa potongan (incremental) atau kumulatif.
  - Apakah `message.complete.text` berisi teks penuh.
  - Satuan `started_at` (detik atau ms).
  - Bentuk `messages[0]` hasil resume.
  - Apakah `shell.exec` terbuka di serve.

  Bila delta ternyata kumulatif, ubah `applyChatEvent` di Task 5 (cabang `message.delta`) agar **mengganti** teks, bukan menambah, dan sesuaikan test-nya. Commit catatan:

```bash
git add docs/superpowers/plans/2026-10-02-m5b-office-chat.md
git commit -m "docs: record hermes serve protocol spike notes for M5b" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Core — config serve, peluncur & supervisor

**Files:**
- Modify: `apps/core/src/config.ts`
- Create: `apps/core/src/serve.ts`
- Modify: `apps/core/src/health.ts` (detail `serve` nonaktif)
- Test: `apps/core/test/config.test.ts`, `apps/core/test/serve.test.ts`

**Interfaces:**
- Produces:
  - `CoreConfig.serveToken: string | null`, `CoreConfig.servePort: number | null`, `CoreConfig.serveLockDir: string`, `CoreConfig.chatRoot: string`.
  - `serveLaunch(s: ServeSettings, baseEnv: NodeJS.ProcessEnv): ServeLaunch`.
  - `superviseServe(launch: ServeLaunch, deps: SuperviseDeps): Supervisor`.
  - Types: `ServeSettings`, `ServeLaunch`, `ServeChild`, `SuperviseDeps`, `Supervisor`.

- [ ] **Step 1: Tulis test config yang gagal.** Di `apps/core/test/config.test.ts`, ganti baris 58 (`const o = loadCoreConfig({ ...BASE_ENV, AOS_SERVE_PORT: '9129', ...`) menjadi versi dengan token, lalu tambahkan test baru di `describe` yang sama:

```ts
    const o = loadCoreConfig({ ...BASE_ENV, AOS_SERVE_TOKEN: 'st', AOS_SERVE_PORT: '9129', AOS_ROUTER_URL: 'http://x:1/', AOS_TIMEZONE: 'UTC', HERMES_GATEWAY_LOCK_DIR: 'E:\\locks' });
```

```ts
  it('enables hermes serve only when AOS_SERVE_TOKEN is set', () => {
    const off = loadCoreConfig({ ...BASE_ENV, AOS_SERVE_PORT: '9200' });
    expect([off.serveToken, off.servePort]).toEqual([null, null]);
    const on = loadCoreConfig({ ...BASE_ENV, AOS_SERVE_TOKEN: 'st' });
    expect([on.serveToken, on.servePort]).toEqual(['st', 9129]);
    expect(on.serveLockDir).toBe(join(on.hermesHome, '..', 'serve-locks'));
    expect(on.chatRoot).toBe(join(on.workspacesRoot, 'chat'));
    expect(loadCoreConfig({ ...BASE_ENV, AOS_SERVE_TOKEN: 'st', AOS_SERVE_PORT: '9300', AOS_SERVE_LOCK_DIR: 'E:\\sl' }).serveLockDir).toBe('E:\\sl');
  });

  it('rejects a serve token equal to another Core token', () => {
    expect(() => loadCoreConfig({ ...BASE_ENV, AOS_SERVE_TOKEN: BASE_ENV.AOS_UI_TOKEN })).toThrow(/AOS_SERVE_TOKEN/);
  });
```

  Pastikan `join` diimpor dari `node:path` di file test (tambahkan `import { join } from 'node:path';` bila belum ada) dan `BASE_ENV` memuat `AOS_UI_TOKEN` (sudah).

- [ ] **Step 2: Jalankan, pastikan gagal.**

Run: `pnpm -F @aos/core exec vitest run test/config.test.ts`
Expected: FAIL (`serveToken` undefined / tidak melempar).

- [ ] **Step 3: Ubah `apps/core/src/config.ts`.**
  - Tambahkan ke `interface CoreConfig` (setelah `servePort`):

```ts
  serveToken: string | null;
  serveLockDir: string;
  chatRoot: string;
```

  - Di `loadCoreConfig`, setelah validasi `approverToken`, tambahkan:

```ts
  const serveToken = env.AOS_SERVE_TOKEN?.trim() || null;
  if (serveToken && [bridgeToken, uiToken, approverToken].includes(serveToken)) {
    throw new Error('AOS_SERVE_TOKEN must differ from the other Core tokens');
  }
  const workspacesRoot = env.AOS_WORKSPACES_ROOT?.trim() || join(hermesHome, 'workspaces');
```

  - Di objek return, ganti baris `workspacesRoot: …` dan `servePort: …` dengan:

```ts
    workspacesRoot,
    servePort: serveToken ? Number(env.AOS_SERVE_PORT?.trim() || 9129) : null,
    serveToken,
    serveLockDir: env.AOS_SERVE_LOCK_DIR?.trim() || join(hermesHome, '..', 'serve-locks'),
    chatRoot: join(workspacesRoot, 'chat'),
```

- [ ] **Step 4: Jalankan test config.**

Run: `pnpm -F @aos/core exec vitest run test/config.test.ts`
Expected: PASS

- [ ] **Step 5: Tulis test serve yang gagal** `apps/core/test/serve.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ServeChild, serveLaunch, superviseServe } from '../src/serve.js';

const SETTINGS = {
  hermesExe: 'hermes',
  hermesHome: 'D:\\agentic-os\\hermes-home',
  port: 9129,
  token: 'serve-secret',
  lockDir: 'D:\\agentic-os\\serve-locks',
  cwd: 'D:\\agentic-os\\hermes-home\\workspaces\\chat',
  parentPid: 4242,
};

describe('serveLaunch', () => {
  it('builds an isolated loopback serve with a private lock dir', () => {
    const l = serveLaunch(SETTINGS, {
      PATH: 'C:\\bin',
      HERMES_DESKTOP: '1',
      HERMES_KANBAN_TASK: 't_1',
      HERMES_GATEWAY_LOCK_DIR: 'C:\\shared',
      HERMES_HOME: 'C:\\owner-hermes',
      AOS_UI_TOKEN: 'ui',
      AOS_ROUTER_KEY: 'rk',
    });
    expect(l.exe).toBe('hermes');
    expect(l.args).toEqual(['serve', '--isolated', '--skip-build', '--host', '127.0.0.1', '--port', '9129']);
    expect(l.cwd).toBe(SETTINGS.cwd);
    expect(l.env).toMatchObject({
      PATH: 'C:\\bin',
      HERMES_HOME: SETTINGS.hermesHome,
      HERMES_DASHBOARD_SESSION_TOKEN: 'serve-secret',
      HERMES_GATEWAY_LOCK_DIR: SETTINGS.lockDir,
      HERMES_PARENT_PID: '4242',
    });
    for (const k of ['HERMES_DESKTOP', 'HERMES_KANBAN_TASK', 'AOS_UI_TOKEN', 'AOS_ROUTER_KEY']) expect(l.env[k]).toBeUndefined();
  });
});

class FakeChild implements ServeChild {
  pid = 100;
  killed = false;
  private onExit: ((code: number | null) => void) | null = null;
  kill() {
    this.killed = true;
    return true;
  }
  on(_event: 'exit', cb: (code: number | null) => void) {
    this.onExit = cb;
    return this;
  }
  exit(code: number) {
    this.onExit?.(code);
  }
}

describe('superviseServe', () => {
  afterEach(() => vi.useRealTimers());

  it('restarts serve with backoff and stops cleanly', () => {
    vi.useFakeTimers();
    const children: FakeChild[] = [];
    const logs: string[] = [];
    const sup = superviseServe(serveLaunch(SETTINGS, {}), {
      spawn: () => {
        const c = new FakeChild();
        children.push(c);
        return c;
      },
      log: (m) => logs.push(m),
      now: () => Date.now(),
    });
    expect(children).toHaveLength(1);
    expect(sup.running()).toBe(true);
    children[0].exit(1);
    expect(sup.running()).toBe(false);
    vi.advanceTimersByTime(1999);
    expect(children).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(children).toHaveLength(2);
    children[1].exit(1);
    vi.advanceTimersByTime(5000);
    expect(children).toHaveLength(3);
    sup.stop();
    expect(children[2].killed).toBe(true);
    children[2].exit(0);
    vi.advanceTimersByTime(120_000);
    expect(children).toHaveLength(3);
    expect(logs.some((l) => l.includes('exited'))).toBe(true);
    expect(logs.join('\n')).not.toContain('serve-secret');
  });

  it('resets the backoff after a long healthy run', () => {
    vi.useFakeTimers();
    const children: FakeChild[] = [];
    superviseServe(serveLaunch(SETTINGS, {}), {
      spawn: () => {
        const c = new FakeChild();
        children.push(c);
        return c;
      },
      log: () => {},
      now: () => Date.now(),
    });
    children[0].exit(1);
    vi.advanceTimersByTime(2000);
    vi.advanceTimersByTime(10 * 60_000);
    children[1].exit(1);
    vi.advanceTimersByTime(2000);
    expect(children).toHaveLength(3);
  });
});
```

- [ ] **Step 6: Jalankan, pastikan gagal.**

Run: `pnpm -F @aos/core exec vitest run test/serve.test.ts`
Expected: FAIL (`Cannot find module '../src/serve.js'`).

- [ ] **Step 7: Implementasi** `apps/core/src/serve.ts`:

```ts
/** Launch and supervise the Agentic OS `hermes serve` backend (M5b). */

export interface ServeSettings {
  hermesExe: string;
  hermesHome: string;
  port: number;
  token: string;
  lockDir: string;
  cwd: string;
  parentPid: number;
}

export interface ServeLaunch {
  exe: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}

export interface ServeChild {
  pid?: number;
  kill(): boolean;
  on(event: 'exit', cb: (code: number | null) => void): unknown;
}

export interface SuperviseDeps {
  spawn(launch: ServeLaunch): ServeChild;
  log(message: string): void;
  now(): number;
}

export interface Supervisor {
  stop(): void;
  running(): boolean;
}

// Desktop ownership (cron ticker, gateway reaping) and kanban worker context must never leak into serve.
const DROPPED = ['HERMES_DESKTOP', 'HERMES_KANBAN_TASK', 'HERMES_KANBAN_RUN_ID', 'HERMES_KANBAN_WORKSPACE', 'HERMES_TUI_SIDECAR_URL'];
const BACKOFF_MS = [2_000, 5_000, 15_000, 60_000];
const HEALTHY_RUN_MS = 120_000;

export function serveLaunch(s: ServeSettings, baseEnv: NodeJS.ProcessEnv): ServeLaunch {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (key.startsWith('AOS_') || DROPPED.includes(key)) continue;
    env[key] = value;
  }
  env.HERMES_HOME = s.hermesHome;
  env.HERMES_DASHBOARD_SESSION_TOKEN = s.token;
  env.HERMES_GATEWAY_LOCK_DIR = s.lockDir;
  env.HERMES_PARENT_PID = String(s.parentPid);
  return {
    exe: s.hermesExe,
    args: ['serve', '--isolated', '--skip-build', '--host', '127.0.0.1', '--port', String(s.port)],
    env,
    cwd: s.cwd,
  };
}

export function superviseServe(launch: ServeLaunch, deps: SuperviseDeps): Supervisor {
  let child: ServeChild | null = null;
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const start = () => {
    timer = null;
    if (stopped) return;
    const startedAt = deps.now();
    let current: ServeChild;
    try {
      current = deps.spawn(launch);
    } catch (err) {
      deps.log(`hermes serve failed to start: ${(err as Error).message}`);
      schedule();
      return;
    }
    child = current;
    deps.log(`hermes serve started (pid ${current.pid ?? '?'})`);
    current.on('exit', (code) => {
      if (child === current) child = null;
      deps.log(`hermes serve exited (code ${code ?? 'null'})`);
      if (deps.now() - startedAt >= HEALTHY_RUN_MS) failures = 0;
      schedule();
    });
  };

  const schedule = () => {
    if (stopped || timer) return;
    const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
    failures += 1;
    timer = setTimeout(start, delay);
  };

  start();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      child?.kill();
    },
    running: () => child !== null,
  };
}
```

- [ ] **Step 8: Ubah detail `serve` nonaktif** di `apps/core/src/health.ts`: ganti `detail: 'dipasang di M5b'` menjadi `detail: 'nonaktif (AOS_SERVE_TOKEN kosong)'`.

- [ ] **Step 9: Jalankan test dan typecheck.**

Run: `pnpm -F @aos/core exec vitest run test/serve.test.ts test/config.test.ts test/health.test.ts` lalu `pnpm -F @aos/core typecheck`
Expected: PASS, tanpa error TS.

- [ ] **Step 10: Commit.**

```bash
git add apps/core/src/config.ts apps/core/src/serve.ts apps/core/src/health.ts apps/core/test/config.test.ts apps/core/test/serve.test.ts
git commit -m "feat(core): launch and supervise an isolated hermes serve backend" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Core — sesi chat & kebijakan relay

**Files:**
- Modify: `apps/core/src/db.ts` (tabel `chat_sessions` di `SCHEMA`)
- Create: `apps/core/src/chatSessions.ts`, `apps/core/src/chatRelay.ts`
- Test: `apps/core/test/chatRelay.test.ts`

**Interfaces:**
- Consumes: `Db` dari `./db.js`.
- Produces:
  - `rememberChatSession(db: Db, profile: string, storedId: string, now: number): void`
  - `knownChatSessions(db: Db, profile: string): Set<string>`
  - `interface RelayContext { profiles: readonly string[]; chatRoot: string; known(profile: string): Set<string>; remember(profile: string, storedId: string): void }`
  - `interface RelayOutput { toServer?: string; toClient?: string }`
  - `class ChatRelay { constructor(ctx: RelayContext); fromClient(raw: string): RelayOutput; fromServer(raw: string): RelayOutput }`
  - `const CHAT_METHODS`

- [ ] **Step 1: Tulis test yang gagal** `apps/core/test/chatRelay.test.ts`:

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChatRelay, type RelayContext } from '../src/chatRelay.js';
import { knownChatSessions, rememberChatSession } from '../src/chatSessions.js';
import { openCoreDb } from '../src/db.js';

const ROOT = join('D:', 'ws', 'chat');

function ctx(seed: Record<string, string[]> = {}) {
  const known: Record<string, string[]> = { ...seed };
  const remembered: Array<[string, string]> = [];
  const context: RelayContext = {
    profiles: ['chief', 'researcher', 'secretary', 'content', 'dev'],
    chatRoot: ROOT,
    known: (p) => new Set(known[p] ?? []),
    remember: (p, id) => {
      remembered.push([p, id]);
      (known[p] ??= []).push(id);
    },
  };
  return { context, remembered };
}

const req = (id: number | string, method: string, params: Record<string, unknown> = {}) => JSON.stringify({ jsonrpc: '2.0', id, method, params });
const res = (id: number | string, result: unknown) => JSON.stringify({ jsonrpc: '2.0', id, result });
const parse = (s?: string) => (s === undefined ? undefined : JSON.parse(s));

function withSession(profile = 'chief') {
  const c = ctx();
  const r = new ChatRelay(c.context);
  r.fromClient(req(1, 'session.create', { profile }));
  r.fromServer(res(1, { session_id: 'rt1', stored_session_id: 'st1', message_count: 0, messages: [] }));
  return { r, ...c };
}

describe('chat sessions store', () => {
  it('remembers office sessions per profile', () => {
    const db = openCoreDb(':memory:');
    rememberChatSession(db, 'chief', 'st1', 1);
    rememberChatSession(db, 'chief', 'st1', 2);
    rememberChatSession(db, 'dev', 'st2', 3);
    expect([...knownChatSessions(db, 'chief')]).toEqual(['st1']);
    expect([...knownChatSessions(db, 'researcher')]).toEqual([]);
  });
});

describe('ChatRelay client frames', () => {
  it('refuses methods outside the allowlist', () => {
    const r = new ChatRelay(ctx().context);
    for (const method of ['shell.exec', 'cli.exec', 'config.set', 'plugins.manage', 'session.control']) {
      const out = r.fromClient(req(9, method, { command: 'dir' }));
      expect(out.toServer).toBeUndefined();
      expect(parse(out.toClient)).toMatchObject({ id: 9, error: { code: -32601 } });
    }
  });

  it('forces the chat cwd and drops overrides on session.create', () => {
    const r = new ChatRelay(ctx().context);
    const out = r.fromClient(req(2, 'session.create', { profile: 'researcher', cwd: 'D:\\MIT', model: 'x', provider: 'openai' }));
    expect(parse(out.toServer)).toEqual({
      jsonrpc: '2.0',
      id: 2,
      method: 'session.create',
      params: { profile: 'researcher', cwd: join(ROOT, 'researcher'), cwd_explicit: true },
    });
  });

  it('rejects unknown profiles', () => {
    const r = new ChatRelay(ctx().context);
    expect(parse(r.fromClient(req(3, 'session.create', { profile: 'root' })).toClient)).toMatchObject({ id: 3, error: { code: -32602 } });
  });

  it('remembers created sessions and only lets prompts reach live ones', () => {
    const c = ctx();
    const r = new ChatRelay(c.context);
    expect(parse(r.fromClient(req(4, 'prompt.submit', { session_id: 'rt1', text: 'halo' })).toClient)).toMatchObject({ error: { code: -32602 } });
    r.fromClient(req(5, 'session.create', { profile: 'chief' }));
    const back = r.fromServer(res(5, { session_id: 'rt1', stored_session_id: 'st1', message_count: 0, messages: [] }));
    expect(parse(back.toClient)).toMatchObject({ id: 5, result: { session_id: 'rt1' } });
    expect(c.remembered).toEqual([['chief', 'st1']]);
    expect(parse(r.fromClient(req(6, 'prompt.submit', { session_id: 'rt1', text: 'halo', queued: true })).toServer)).toEqual({
      jsonrpc: '2.0',
      id: 6,
      method: 'prompt.submit',
      params: { session_id: 'rt1', profile: 'chief', text: 'halo' },
    });
  });

  it('refuses slash commands and empty prompts', () => {
    const { r } = withSession();
    const slash = parse(r.fromClient(req(7, 'prompt.submit', { session_id: 'rt1', text: '  /yolo' })).toClient);
    expect(slash).toMatchObject({ id: 7, error: { code: -32602 } });
    expect(slash.error.message).toContain('slash');
    expect(parse(r.fromClient(req(8, 'prompt.submit', { session_id: 'rt1', text: '   ' })).toClient)).toMatchObject({ error: { code: -32602 } });
  });

  it('filters session.list to sessions created from the office', () => {
    const r = new ChatRelay(ctx({ chief: ['st1'] }).context);
    r.fromClient(req(10, 'session.list', { profile: 'chief', limit: 500 }));
    const out = parse(
      r.fromServer(
        res(10, {
          sessions: [
            { id: 'st1', title: 'office', preview: '', started_at: 1, message_count: 2, source: 'tui' },
            { id: 'tg1', title: 'telegram', preview: '', started_at: 1, message_count: 9, source: 'telegram' },
          ],
        }),
      ).toClient,
    );
    expect(out.result.sessions.map((s: { id: string }) => s.id)).toEqual(['st1']);
  });

  it('caps session.list and only resumes office sessions', () => {
    const r = new ChatRelay(ctx({ chief: ['st1'] }).context);
    expect(parse(r.fromClient(req(11, 'session.list', { profile: 'chief', limit: 500 })).toServer).params).toEqual({ profile: 'chief', limit: 50 });
    expect(parse(r.fromClient(req(12, 'session.resume', { profile: 'chief', session_id: 'tg1' })).toClient)).toMatchObject({ error: { code: -32602 } });
    expect(parse(r.fromClient(req(13, 'session.resume', { profile: 'chief', session_id: 'st1', eager_build: true })).toServer).params).toEqual({ session_id: 'st1', profile: 'chief' });
    r.fromServer(res(13, { session_id: 'rt9', message_count: 0, messages: [] }));
    expect(parse(r.fromClient(req(14, 'session.interrupt', { session_id: 'rt9' })).toServer).params).toEqual({ session_id: 'rt9', profile: 'chief' });
  });

  it('validates approval.respond', () => {
    const { r } = withSession('dev');
    expect(parse(r.fromClient(req(15, 'approval.respond', { session_id: 'rt1', choice: 'yolo' })).toClient)).toMatchObject({ error: { code: -32602 } });
    expect(parse(r.fromClient(req(16, 'approval.respond', { session_id: 'rt1', choice: 'deny', all: true, request_id: 'a1' })).toServer).params).toEqual({
      session_id: 'rt1',
      profile: 'dev',
      choice: 'deny',
      request_id: 'a1',
    });
  });

  it('answers malformed frames without forwarding', () => {
    const r = new ChatRelay(ctx().context);
    expect(parse(r.fromClient('not json').toClient)).toMatchObject({ error: { code: -32700 } });
    expect(r.fromClient(JSON.stringify({ jsonrpc: '2.0', method: 'prompt.submit', params: {} }))).toEqual({});
  });
});

describe('ChatRelay server frames', () => {
  it('forwards events untouched', () => {
    const r = new ChatRelay(ctx().context);
    const frame = JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'message.delta', session_id: 'rt1', payload: { text: 'po' } } });
    expect(r.fromServer(frame)).toEqual({ toClient: frame });
  });

  it('forwards approval requests and exactly one valid owner answer', () => {
    const { r } = withSession('dev');
    const ask = JSON.stringify({ jsonrpc: '2.0', id: 'srv-1', method: 'approval', params: { session_id: 'rt1', request_id: 'a1', command: 'git push', choices: ['once', 'session', 'always', 'deny'] } });
    expect(r.fromServer(ask)).toEqual({ toClient: ask });
    expect(r.fromClient(res('srv-1', { choice: 'yolo' }))).toEqual({});
    expect(parse(r.fromClient(res('srv-1', { choice: 'deny', all: true })).toServer)).toEqual({ jsonrpc: '2.0', id: 'srv-1', result: { choice: 'deny' } });
    expect(r.fromClient(res('srv-1', { choice: 'once' }))).toEqual({});
  });

  it('forwards clarify answers', () => {
    const { r } = withSession();
    r.fromServer(JSON.stringify({ jsonrpc: '2.0', id: 'srv-2', method: 'clarify', params: { session_id: 'rt1', question: 'Warna?' } }));
    expect(parse(r.fromClient(res('srv-2', { answer: 'biru', extra: 1 })).toServer)).toEqual({ jsonrpc: '2.0', id: 'srv-2', result: { answer: 'biru' } });
  });

  it('declines server requests the office cannot answer and answers pings', () => {
    const r = new ChatRelay(ctx().context);
    const secret = r.fromServer(JSON.stringify({ jsonrpc: '2.0', id: 'srv-3', method: 'secret', params: { name: 'OPENAI_API_KEY' } }));
    expect(secret.toClient).toBeUndefined();
    expect(parse(secret.toServer)).toMatchObject({ id: 'srv-3', error: { code: -32601 } });
    expect(parse(r.fromServer(req('srv-4', 'ping')).toServer)).toEqual({ jsonrpc: '2.0', id: 'srv-4', result: { pong: true } });
  });

  it('accepts answers to requests re-delivered through open_requests', () => {
    const r = new ChatRelay(ctx({ dev: ['st1'] }).context);
    r.fromClient(req(20, 'session.resume', { profile: 'dev', session_id: 'st1' }));
    r.fromServer(res(20, { session_id: 'rt2', message_count: 1, messages: [], open_requests: [{ id: 'srv-9', method: 'approval', params: { session_id: 'rt2' } }] }));
    expect(parse(r.fromClient(res('srv-9', { choice: 'once' })).toServer)).toEqual({ jsonrpc: '2.0', id: 'srv-9', result: { choice: 'once' } });
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal.**

Run: `pnpm -F @aos/core exec vitest run test/chatRelay.test.ts`
Expected: FAIL (modul belum ada).

- [ ] **Step 3: Tambahkan tabel** ke string `SCHEMA` di `apps/core/src/db.ts`, tepat sebelum penutup `` `; `` (setelah tabel `office_state`):

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  stored_id TEXT PRIMARY KEY,
  profile TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

- [ ] **Step 4: Implementasi** `apps/core/src/chatSessions.ts`:

```ts
import type { Db } from './db.js';

/** Stored Hermes session ids created from the office; only these may be listed or resumed there. */
export function rememberChatSession(db: Db, profile: string, storedId: string, now: number): void {
  db.prepare('INSERT OR IGNORE INTO chat_sessions (stored_id, profile, created_at) VALUES (?, ?, ?)').run(storedId, profile, now);
}

export function knownChatSessions(db: Db, profile: string): Set<string> {
  const rows = db.prepare('SELECT stored_id FROM chat_sessions WHERE profile = ?').all(profile) as Array<{ stored_id: string }>;
  return new Set(rows.map((r) => r.stored_id));
}
```

- [ ] **Step 5: Implementasi** `apps/core/src/chatRelay.ts`:

```ts
import { join } from 'node:path';

/**
 * Policy between the office chat and `hermes serve` (JSON-RPC 2.0 over WebSocket).
 * The browser never talks to serve directly: only allowlisted methods pass, with rebuilt params.
 */
export interface RelayContext {
  profiles: readonly string[];
  chatRoot: string;
  known(profile: string): Set<string>;
  remember(profile: string, storedId: string): void;
}

export interface RelayOutput {
  toServer?: string;
  toClient?: string;
}

export const CHAT_METHODS = [
  'ping',
  'client.capabilities',
  'session.create',
  'session.list',
  'session.resume',
  'session.history',
  'session.interrupt',
  'session.close',
  'session.events.since',
  'approval.pending',
  'approval.respond',
  'prompt.submit',
] as const;

type Params = Record<string, unknown>;
type Frame = { id?: string | number | null; method?: unknown; params?: unknown; result?: unknown; error?: unknown };

const APPROVAL_CHOICES = new Set(['once', 'session', 'always', 'deny']);
const FORWARDED_REQUESTS = new Set(['approval', 'clarify']);
const MAX_PROMPT = 20_000;

class Refusal extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const hasId = (f: Frame): f is Frame & { id: string | number } => typeof f.id === 'string' || typeof f.id === 'number';
const encode = (frame: Params): string => JSON.stringify({ jsonrpc: '2.0', ...frame });

function parse(raw: string): Frame | null {
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Frame) : null;
  } catch {
    return null;
  }
}

export class ChatRelay {
  private readonly pending = new Map<string, { method: string; profile: string }>();
  private readonly live = new Map<string, string>();
  private readonly serverRequests = new Map<string, string>();

  constructor(private readonly ctx: RelayContext) {}

  fromClient(raw: string): RelayOutput {
    const frame = parse(raw);
    if (!frame) return { toClient: encode({ id: null, error: { code: -32700, message: 'Frame bukan JSON yang valid' } }) };
    if (frame.method === undefined) {
      const answer = this.answer(frame);
      return answer ? { toServer: answer } : {};
    }
    if (!hasId(frame) || typeof frame.method !== 'string') return {};
    try {
      const params = frame.params && typeof frame.params === 'object' ? (frame.params as Params) : {};
      const clean = this.sanitize(frame.method, params);
      this.pending.set(String(frame.id), { method: frame.method, profile: clean.profile });
      return { toServer: encode({ id: frame.id, method: frame.method, params: clean.params }) };
    } catch (err) {
      const code = err instanceof Refusal ? err.code : -32602;
      return { toClient: encode({ id: frame.id, error: { code, message: (err as Error).message } }) };
    }
  }

  fromServer(raw: string): RelayOutput {
    const frame = parse(raw);
    if (!frame) return {};
    if (frame.method === 'event') return { toClient: raw };
    if (typeof frame.method === 'string' && hasId(frame)) {
      if (frame.method === 'ping') return { toServer: encode({ id: frame.id, result: { pong: true } }) };
      if (FORWARDED_REQUESTS.has(frame.method)) {
        this.serverRequests.set(String(frame.id), frame.method);
        return { toClient: raw };
      }
      return { toServer: encode({ id: frame.id, error: { code: -32601, message: `${frame.method} tidak didukung kantor Agentic OS` } }) };
    }
    if (hasId(frame)) {
      const call = this.pending.get(String(frame.id));
      this.pending.delete(String(frame.id));
      if (call && frame.result && typeof frame.result === 'object') {
        return { toClient: encode({ id: frame.id, result: this.track(call, frame.result as Params) }) };
      }
    }
    return { toClient: raw };
  }

  private answer(frame: Frame): string | undefined {
    if (!hasId(frame)) return undefined;
    const id = String(frame.id);
    const method = this.serverRequests.get(id);
    if (!method) return undefined;
    const result = frame.result && typeof frame.result === 'object' ? (frame.result as Params) : {};
    let clean: Params;
    if (method === 'approval') {
      if (!APPROVAL_CHOICES.has(str(result.choice))) return undefined;
      clean = { choice: result.choice };
    } else if (typeof result.answer === 'string') {
      clean = { answer: result.answer };
    } else if (result.answers && typeof result.answers === 'object') {
      clean = { answers: result.answers };
    } else {
      return undefined;
    }
    this.serverRequests.delete(id);
    return encode({ id: frame.id, result: clean });
  }

  private profileOf(params: Params): string {
    const profile = str(params.profile);
    if (!this.ctx.profiles.includes(profile)) throw new Refusal(-32602, `Profile tidak dikenal: ${profile || '-'}`);
    return profile;
  }

  private liveSession(params: Params): { session_id: string; profile: string } {
    const sid = str(params.session_id);
    const profile = this.live.get(sid);
    if (!profile) throw new Refusal(-32602, 'Sesi tidak dikenal; buat atau buka sesi dulu');
    return { session_id: sid, profile };
  }

  private sanitize(method: string, params: Params): { params: Params; profile: string } {
    switch (method) {
      case 'ping':
        return { params: {}, profile: '' };
      case 'client.capabilities':
        return { params: { server_requests: true }, profile: '' };
      case 'session.create': {
        const profile = this.profileOf(params);
        return { params: { profile, cwd: join(this.ctx.chatRoot, profile), cwd_explicit: true }, profile };
      }
      case 'session.list': {
        const profile = this.profileOf(params);
        const limit = Math.min(Math.max(Math.trunc(Number(params.limit)) || 20, 1), 50);
        return { params: { profile, limit }, profile };
      }
      case 'session.resume': {
        const profile = this.profileOf(params);
        const sid = str(params.session_id);
        if (!this.ctx.known(profile).has(sid)) throw new Refusal(-32602, 'Hanya sesi yang dibuat dari kantor yang bisa dibuka');
        return { params: { session_id: sid, profile }, profile };
      }
      case 'session.history':
      case 'session.interrupt':
      case 'session.close':
      case 'approval.pending': {
        const s = this.liveSession(params);
        return { params: s, profile: s.profile };
      }
      case 'session.events.since': {
        const s = this.liveSession(params);
        return { params: { ...s, last_seen: typeof params.last_seen === 'number' ? params.last_seen : null }, profile: s.profile };
      }
      case 'prompt.submit': {
        const s = this.liveSession(params);
        const text = str(params.text);
        if (!text.trim()) throw new Refusal(-32602, 'Pesan kosong');
        if (text.length > MAX_PROMPT) throw new Refusal(-32602, `Pesan lebih dari ${MAX_PROMPT} karakter`);
        if (text.trimStart().startsWith('/')) throw new Refusal(-32602, 'Perintah slash tidak didukung dari kantor; pakai Telegram atau CLI');
        return { params: { ...s, text }, profile: s.profile };
      }
      case 'approval.respond': {
        const s = this.liveSession(params);
        const choice = str(params.choice);
        if (!APPROVAL_CHOICES.has(choice)) throw new Refusal(-32602, `Pilihan approval tidak valid: ${choice || '-'}`);
        const requestId = str(params.request_id);
        return { params: { ...s, choice, ...(requestId ? { request_id: requestId } : {}) }, profile: s.profile };
      }
      default:
        throw new Refusal(-32601, `Metode ${method} tidak diizinkan dari kantor`);
    }
  }

  private track(call: { method: string; profile: string }, result: Params): Params {
    if ((call.method === 'session.create' || call.method === 'session.resume') && typeof result.session_id === 'string') {
      this.live.set(result.session_id, call.profile);
    }
    if (call.method === 'session.create' && typeof result.stored_session_id === 'string') {
      this.ctx.remember(call.profile, result.stored_session_id);
    }
    if (Array.isArray(result.open_requests)) {
      for (const r of result.open_requests as Params[]) {
        if (typeof r?.id === 'string' && FORWARDED_REQUESTS.has(str(r.method))) this.serverRequests.set(r.id, str(r.method));
      }
    }
    if (call.method === 'session.list' && Array.isArray(result.sessions)) {
      const known = this.ctx.known(call.profile);
      return { ...result, sessions: (result.sessions as Params[]).filter((row) => known.has(str(row.id)) || known.has(str(row.resolved_id))) };
    }
    return result;
  }
}
```

- [ ] **Step 6: Jalankan test dan typecheck.**

Run: `pnpm -F @aos/core exec vitest run test/chatRelay.test.ts test/db.test.ts` lalu `pnpm -F @aos/core typecheck`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add apps/core/src/db.ts apps/core/src/chatSessions.ts apps/core/src/chatRelay.ts apps/core/test/chatRelay.test.ts
git commit -m "feat(core): chat relay policy with method allowlist and office-only sessions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Core — rute `/v1/chat` dan wiring `main.ts`

**Files:**
- Modify: `apps/core/src/server.ts`, `apps/core/src/main.ts`
- Test: `apps/core/test/server.test.ts`

**Interfaces:**
- Consumes:
  - `ChatRelay`, `RelayContext` (Task 3);
  - `serveLaunch`, `superviseServe` (Task 2);
  - `rememberChatSession`, `knownChatSessions` (Task 3);
  - `CoreConfig.serveToken/servePort/serveLockDir/chatRoot` (Task 2).
- Produces:
  - `interface UpstreamSocket { onopen: (() => void) | null; onmessage: ((e: { data: unknown }) => void) | null; onclose: (() => void) | null; onerror: (() => void) | null; send(data: string): void; close(): void }`
  - `ServerDeps.chat?: { connect(): UpstreamSocket; context: RelayContext }`
  - Rute `GET /v1/chat` (WS, auth UI). Kode tutup `4503` = serve nonaktif, `4502` = serve terputus.

- [ ] **Step 1: Tulis test yang gagal.** Tambahkan ke `apps/core/test/server.test.ts`. Tambahkan juga import `import type { UpstreamSocket } from '../src/server.js';` di atas.

```ts
class FakeUpstream implements UpstreamSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  closed = false;
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
}

async function makeChat() {
  const upstreams: FakeUpstream[] = [];
  app = await buildServer({
    db: openCoreDb(':memory:'),
    bridgeToken: 'bt',
    uiToken: 'ut',
    approverToken: 'at',
    hub: createHub(),
    kanban: () => ({ tasks: [], runs: [] }),
    chat: {
      connect: () => {
        const u = new FakeUpstream();
        upstreams.push(u);
        return u;
      },
      context: { profiles: ['chief'], chatRoot: 'C:\\chat', known: () => new Set(), remember: () => {} },
    },
  });
  return upstreams;
}

const nextMessage = (ws: { once(event: 'message', cb: (data: Buffer) => void): void }) =>
  new Promise<unknown>((resolve) => ws.once('message', (data) => resolve(JSON.parse(String(data)))));

describe('/v1/chat relay', () => {
  it('queues client frames until serve opens and filters them', async () => {
    const upstreams = await makeChat();
    const ws = await app!.injectWS('/v1/chat?token=ut');
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'session.create', params: { profile: 'chief', cwd: 'D:\\MIT' } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(upstreams[0].sent).toEqual([]);
    upstreams[0].onopen?.();
    expect(JSON.parse(upstreams[0].sent[0])).toMatchObject({ method: 'session.create', params: { cwd: 'C:\\chat\\chief' } });
    const refused = nextMessage(ws);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'shell.exec', params: { command: 'dir' } }));
    expect(await refused).toMatchObject({ id: 2, error: { code: -32601 } });
    expect(upstreams[0].sent).toHaveLength(1);
    const event = nextMessage(ws);
    upstreams[0].onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', method: 'event', params: { type: 'gateway.ready' } }) });
    expect(await event).toMatchObject({ method: 'event', params: { type: 'gateway.ready' } });
    ws.terminate();
    await new Promise((r) => setTimeout(r, 20));
    expect(upstreams[0].closed).toBe(true);
  });

  it('closes with 4502 when serve drops', async () => {
    const upstreams = await makeChat();
    const ws = await app!.injectWS('/v1/chat?token=ut');
    const closed = new Promise<number>((resolve) => ws.once('close', (code: number) => resolve(code)));
    upstreams[0].onclose?.();
    expect(await closed).toBe(4502);
  });

  it('closes with 4503 when serve is disabled and rejects bad tokens', async () => {
    await make();
    const ws = await app!.injectWS('/v1/chat?token=ut');
    const code = await new Promise<number>((resolve) => ws.once('close', (c: number) => resolve(c)));
    expect(code).toBe(4503);
    await expect(app!.injectWS('/v1/chat?token=wrong')).rejects.toThrow();
  });
});
```

  `join('C:\\chat', 'chief')` di Windows = `C:\chat\chief`. Test ini berjalan di mesin owner (Windows).

- [ ] **Step 2: Jalankan, pastikan gagal.**

Run: `pnpm -F @aos/core exec vitest run test/server.test.ts`
Expected: FAIL (`chat` bukan bagian `ServerDeps` / rute 404).

- [ ] **Step 3: Implementasi rute** di `apps/core/src/server.ts`.
  - Import: `import { ChatRelay, type RelayContext } from './chatRelay.js';`
  - Sebelum `export interface ServerDeps`, tambahkan:

```ts
export interface UpstreamSocket {
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

const MAX_QUEUED_FRAMES = 100;
```

  - Tambahkan field ke `ServerDeps`:

```ts
  chat?: { connect(): UpstreamSocket; context: RelayContext };
```

  - Tambahkan rute setelah rute `/v1/stream`:

```ts
  app.get('/v1/chat', { websocket: true, preHandler: requireUi }, (socket) => {
    if (!deps.chat) {
      socket.close(4503, 'hermes serve nonaktif');
      return;
    }
    const relay = new ChatRelay(deps.chat.context);
    const upstream = deps.chat.connect();
    const queue: string[] = [];
    let open = false;
    let done = false;
    const toClient = (frame?: string) => {
      if (frame && !done) socket.send(frame);
    };
    const toServer = (frame?: string) => {
      if (!frame) return;
      if (open) upstream.send(frame);
      else if (queue.length < MAX_QUEUED_FRAMES) queue.push(frame);
    };
    upstream.onopen = () => {
      open = true;
      for (const frame of queue.splice(0)) upstream.send(frame);
    };
    upstream.onmessage = (e) => {
      const out = relay.fromServer(String(e.data));
      toServer(out.toServer);
      toClient(out.toClient);
    };
    upstream.onerror = () => {};
    upstream.onclose = () => {
      if (done) return;
      done = true;
      socket.close(4502, 'hermes serve terputus');
    };
    socket.on('message', (data: Buffer) => {
      const out = relay.fromClient(String(data));
      toServer(out.toServer);
      toClient(out.toClient);
    });
    socket.on('close', () => {
      done = true;
      upstream.close();
    });
  });
```

- [ ] **Step 4: Jalankan test server.**

Run: `pnpm -F @aos/core exec vitest run test/server.test.ts`
Expected: PASS (termasuk test lama).

- [ ] **Step 5: Wiring di `apps/core/src/main.ts`.**
  - Import tambahan:

```ts
import { spawn } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { knownChatSessions, rememberChatSession } from './chatSessions.js';
import { PROFILES } from './config.js';
import { serveLaunch, superviseServe } from './serve.js';
import type { ServerDeps, UpstreamSocket } from './server.js';
```

  Gabungkan dengan import yang sudah ada dari modul yang sama: `existsSync`/`readFileSync` dari `node:fs`, `join`/`resolve` dari `node:path`, `loadCoreConfig` dari `./config.js`, `buildServer` dari `./server.js`. Jangan menduplikasi.

  - Sebelum `const app = await buildServer({`, tambahkan:

```ts
let chat: ServerDeps['chat'];
if (config.serveToken && config.servePort) {
  const port = config.servePort;
  for (const profile of PROFILES) mkdirSync(join(config.chatRoot, profile), { recursive: true });
  mkdirSync(config.serveLockDir, { recursive: true });
  const serveLog = openSync(join(dirname(config.dbPath), 'serve.log'), 'a');
  const launch = serveLaunch(
    {
      hermesExe: config.hermesExe,
      hermesHome: config.hermesHome,
      port,
      token: config.serveToken,
      lockDir: config.serveLockDir,
      cwd: config.chatRoot,
      parentPid: process.pid,
    },
    process.env,
  );
  const supervisor = superviseServe(launch, {
    spawn: (l) => spawn(l.exe, l.args, { env: l.env, cwd: l.cwd, stdio: ['ignore', serveLog, serveLog], windowsHide: true }),
    log,
    now: Date.now,
  });
  process.on('exit', () => supervisor.stop());
  const upstreamUrl = `ws://127.0.0.1:${port}/api/ws?token=${encodeURIComponent(config.serveToken)}`;
  const origin = `http://127.0.0.1:${port}`;
  // Node 22's global WebSocket (undici) accepts an init object with headers; serve requires a loopback Origin.
  const NodeWebSocket = (globalThis as unknown as { WebSocket: new (url: string, init: { headers: Record<string, string> }) => UpstreamSocket }).WebSocket;
  chat = {
    connect: () => new NodeWebSocket(upstreamUrl, { headers: { Origin: origin } }),
    context: {
      profiles: PROFILES,
      chatRoot: config.chatRoot,
      known: (profile) => knownChatSessions(db, profile),
      remember: (profile, storedId) => rememberChatSession(db, profile, storedId, Date.now()),
    },
  };
  log(`hermes serve supervised on 127.0.0.1:${port} (lock dir ${config.serveLockDir})`);
}
```

  - Tambahkan `chat,` ke objek yang diberikan ke `buildServer({ … })`.

- [ ] **Step 6: Typecheck dan seluruh test Core.**

Run: `pnpm -F @aos/core typecheck` lalu `pnpm -F @aos/core test`
Expected: tanpa error TS; semua test lulus.

- [ ] **Step 7: Commit.**

```bash
git add apps/core/src/server.ts apps/core/src/main.ts apps/core/test/server.test.ts
git commit -m "feat(core): relay office chat to the supervised hermes serve over /v1/chat" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Office — client RPC & model chat

**Files:**
- Create: `apps/office/src/chat/rpc.ts`, `apps/office/src/chat/model.ts`
- Test: `apps/office/test/chat.test.ts`

**Interfaces:**
- Produces:
  - `ChatEvent`, `ServerRequest`, `ChatSocket`, `ChatState`, `ChatRpcOptions`, `RpcError`, `class ChatRpc { state; connect(); request<T>(method, params?): Promise<T>; respond(id, result); close() }`.
  - `ApprovalChoice`, `ChatItem`, `ChatView`, `TranscriptMessage`, `SessionRow`, `newItemId()`, `applyChatEvent(view, ev): ChatView`, `fromTranscript(messages): ChatItem[]`, `requestItem(req): ChatItem | null`, `resolveRequest(items, requestId, answer): ChatItem[]`, `startedAtMs(v: number): number`.

- [ ] **Step 1: Tulis test yang gagal** `apps/office/test/chat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyChatEvent, type ChatItem, fromTranscript, requestItem, resolveRequest, startedAtMs } from '../src/chat/model.ts';
import { ChatRpc, type ChatSocket, type ChatState } from '../src/chat/rpc.ts';

class FakeSocket implements ChatSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Array<Record<string, unknown>> = [];
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.onclose?.({ code: 1000 });
  }
  push(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

function rpcWith() {
  const socket = new FakeSocket();
  const events: string[] = [];
  const requests: string[] = [];
  const states: ChatState[] = [];
  const rpc = new ChatRpc('ws://x/v1/chat', {
    socketFactory: () => socket,
    onEvent: (e) => events.push(e.type),
    onRequest: (r) => requests.push(`${r.method}:${r.id}`),
    onState: (s) => states.push(s),
  });
  rpc.connect();
  socket.onopen?.();
  return { rpc, socket, events, requests, states };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ChatRpc', () => {
  it('resolves requests, advertises capabilities and routes frames', async () => {
    const { rpc, socket, events, requests, states } = rpcWith();
    expect(states).toEqual(['connecting', 'open']);
    const created = rpc.request<{ session_id: string }>('session.create', { profile: 'chief' });
    expect(socket.sent[0]).toEqual({ jsonrpc: '2.0', id: 1, method: 'session.create', params: { profile: 'chief' } });
    socket.push({ jsonrpc: '2.0', id: 1, result: { session_id: 'rt1' } });
    expect(await created).toEqual({ session_id: 'rt1' });
    socket.push({ jsonrpc: '2.0', method: 'event', params: { type: 'gateway.ready', payload: {} } });
    expect(events).toEqual(['gateway.ready']);
    expect(socket.sent[1]).toMatchObject({ method: 'client.capabilities', params: { server_requests: true } });
    socket.push({ jsonrpc: '2.0', id: 'srv-1', method: 'approval', params: { session_id: 'rt1' } });
    expect(requests).toEqual(['approval:srv-1']);
    rpc.respond('srv-1', { choice: 'deny' });
    expect(socket.sent[2]).toEqual({ jsonrpc: '2.0', id: 'srv-1', result: { choice: 'deny' } });
  });

  it('rejects errors and pending calls when the socket closes', async () => {
    const { rpc, socket, states } = rpcWith();
    const bad = rpc.request('shell.exec');
    socket.push({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'Metode shell.exec tidak diizinkan dari kantor' } });
    await expect(bad).rejects.toThrow('tidak diizinkan');
    const hanging = rpc.request('session.list', { profile: 'chief' });
    socket.onclose?.({ code: 4502 });
    await expect(hanging).rejects.toThrow('terputus');
    expect(states.at(-1)).toBe('closed');
    await expect(rpc.request('ping')).rejects.toThrow('belum terhubung');
    await flush();
  });
});

describe('chat model', () => {
  const ev = (type: string, payload: Record<string, unknown> = {}) => ({ type, session_id: 'rt1', payload });

  it('streams an assistant reply around a tool call', () => {
    let v = { items: [{ kind: 'user', id: 'u', text: 'halo' }] as ChatItem[], busy: true };
    v = applyChatEvent(v, ev('message.start'));
    v = applyChatEvent(v, ev('message.delta', { text: 'Sebentar, ' }));
    v = applyChatEvent(v, ev('tool.start', { tool_id: 't1', name: 'read_file', preview: 'README.md' }));
    v = applyChatEvent(v, ev('tool.complete', { tool_id: 't1', name: 'read_file', duration_s: 0.25 }));
    v = applyChatEvent(v, ev('message.delta', { text: 'isinya ' }));
    v = applyChatEvent(v, ev('message.delta', { text: 'halo.' }));
    v = applyChatEvent(v, ev('message.complete', { text: 'Sebentar, isinya halo.' }));
    expect(v.busy).toBe(false);
    expect(v.items.map((i) => i.kind)).toEqual(['user', 'assistant', 'tool', 'assistant']);
    expect(v.items[1]).toMatchObject({ text: 'Sebentar, ', streaming: false });
    expect(v.items[2]).toMatchObject({ label: 'README.md', status: 'done', durationMs: 250 });
    expect(v.items[3]).toMatchObject({ text: 'isinya halo.', streaming: false });
  });

  it('uses the complete text when nothing streamed and reports errors', () => {
    let v = { items: [{ kind: 'user', id: 'u', text: 'halo' }] as ChatItem[], busy: true };
    v = applyChatEvent(v, ev('message.complete', { text: 'pong' }));
    expect(v.items.at(-1)).toMatchObject({ kind: 'assistant', text: 'pong' });
    v = applyChatEvent(v, ev('error', { message: 'model timeout' }));
    expect(v.items.at(-1)).toMatchObject({ kind: 'notice', tone: 'error', text: 'model timeout' });
    expect(v.busy).toBe(false);
  });

  it('drops an empty streaming bubble when a tool starts', () => {
    let v = { items: [] as ChatItem[], busy: true };
    v = applyChatEvent(v, ev('message.start'));
    v = applyChatEvent(v, ev('tool.start', { tool_id: 't2', name: 'terminal' }));
    expect(v.items.map((i) => i.kind)).toEqual(['tool']);
    expect(v.items[0]).toMatchObject({ label: 'terminal', status: 'running' });
  });

  it('rebuilds a transcript', () => {
    const items = fromTranscript([
      { role: 'system', text: 'x' },
      { role: 'user', text: 'halo' },
      { role: 'tool', name: 'read_file', context: 'README.md' },
      { role: 'assistant', text: 'pong' },
      { role: 'assistant', text: '  ' },
    ]);
    expect(items.map((i) => i.kind)).toEqual(['user', 'tool', 'assistant']);
  });

  it('turns server requests into cards and resolves them', () => {
    const approval = requestItem({ id: 'srv-1', method: 'approval', params: { command: 'git push origin main', description: 'git-push', choices: ['once', 'deny', 'bogus'] } });
    expect(approval).toMatchObject({ kind: 'approval', requestId: 'srv-1', choices: ['once', 'deny'] });
    const clarify = requestItem({ id: 'srv-2', method: 'clarify', params: { questions: [{ qid: 'q1', question: 'Warna?', choices: ['biru', 'merah'] }] } });
    expect(clarify).toMatchObject({ kind: 'clarify', qid: 'q1', question: 'Warna?', choices: ['biru', 'merah'] });
    expect(requestItem({ id: 'srv-3', method: 'secret', params: {} })).toBeNull();
    const resolved = resolveRequest([approval!, clarify!], 'srv-1', 'deny');
    expect(resolved[0]).toMatchObject({ decided: 'deny' });
    expect(resolveRequest(resolved, 'srv-2', 'biru')[1]).toMatchObject({ answered: 'biru' });
  });

  it('normalises started_at to milliseconds', () => {
    expect(startedAtMs(1790000000)).toBe(1790000000000);
    expect(startedAtMs(1790000000000)).toBe(1790000000000);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal.**

Run: `pnpm -F @aos/office exec vitest run test/chat.test.ts`
Expected: FAIL (modul belum ada).

- [ ] **Step 3: Implementasi** `apps/office/src/chat/rpc.ts`:

```ts
/** Minimal JSON-RPC 2.0 client for the Core `/v1/chat` relay (which fronts `hermes serve`). */
export interface ChatEvent {
  type: string;
  session_id?: string;
  payload?: Record<string, unknown>;
  seq?: number;
}

export interface ServerRequest {
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface ChatSocket {
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export type ChatState = 'idle' | 'connecting' | 'open' | 'closed';

export interface ChatRpcOptions {
  onEvent(event: ChatEvent): void;
  onRequest(request: ServerRequest): void;
  onState(state: ChatState, code?: number): void;
  socketFactory?: (url: string) => ChatSocket;
  timeoutMs?: number;
}

export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

interface Pending {
  resolve(value: unknown): void;
  reject(err: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

type Frame = { id?: unknown; method?: unknown; params?: unknown; result?: unknown; error?: { code?: number; message?: string } };

export class ChatRpc {
  state: ChatState = 'idle';
  private socket: ChatSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(
    private readonly url: string,
    private readonly opts: ChatRpcOptions,
  ) {}

  connect(): void {
    if (this.state === 'connecting' || this.state === 'open') return;
    const factory = this.opts.socketFactory ?? ((u: string) => new WebSocket(u) as unknown as ChatSocket);
    const socket = factory(this.url);
    this.socket = socket;
    this.setState('connecting');
    socket.onopen = () => this.setState('open');
    socket.onmessage = (e) => this.receive(String(e.data));
    socket.onerror = () => {};
    socket.onclose = (e) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.failAll(new Error('Koneksi chat terputus'));
      this.setState('closed', e.code);
    };
  }

  request<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const socket = this.socket;
    if (!socket || this.state !== 'open') return Promise.reject(new Error('Chat belum terhubung'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: tidak ada jawaban dari Hermes`));
      }, this.opts.timeoutMs ?? 120_000);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  respond(id: string, result: Record<string, unknown>): void {
    this.socket?.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.failAll(new Error('Chat ditutup'));
    this.setState('closed', 1000);
  }

  private receive(text: string): void {
    let frame: Frame;
    try {
      frame = JSON.parse(text) as Frame;
    } catch {
      return;
    }
    if (frame.method === 'event' && frame.params && typeof frame.params === 'object') {
      const event = frame.params as ChatEvent;
      if (event.type === 'gateway.ready') void this.request('client.capabilities', { server_requests: true }).catch(() => {});
      this.opts.onEvent(event);
      return;
    }
    if (typeof frame.method === 'string' && typeof frame.id === 'string') {
      this.opts.onRequest({ id: frame.id, method: frame.method, params: (frame.params ?? {}) as Record<string, unknown> });
      return;
    }
    if (typeof frame.id !== 'number') return;
    const call = this.pending.get(frame.id);
    if (!call) return;
    this.pending.delete(frame.id);
    clearTimeout(call.timer);
    if (frame.error) call.reject(new RpcError(frame.error.code ?? -32603, frame.error.message ?? 'Hermes RPC gagal'));
    else call.resolve(frame.result);
  }

  private failAll(err: Error): void {
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(err);
    }
    this.pending.clear();
  }

  private setState(state: ChatState, code?: number): void {
    this.state = state;
    this.opts.onState(state, code);
  }
}
```

- [ ] **Step 4: Implementasi** `apps/office/src/chat/model.ts`:

```ts
import type { ChatEvent, ServerRequest } from './rpc.ts';

export type ApprovalChoice = 'once' | 'session' | 'always' | 'deny';

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean }
  | { kind: 'tool'; id: string; name: string; label: string; status: 'running' | 'done'; durationMs?: number }
  | { kind: 'approval'; id: string; requestId: string; command: string; description: string; choices: ApprovalChoice[]; decided?: ApprovalChoice }
  | { kind: 'clarify'; id: string; requestId: string; qid?: string; question: string; choices: string[]; answered?: string }
  | { kind: 'notice'; id: string; text: string; tone: 'info' | 'error' };

export interface ChatView {
  items: ChatItem[];
  busy: boolean;
}

export interface TranscriptMessage {
  role: string;
  text?: string | null;
  name?: string | null;
  context?: string | null;
}

export interface SessionRow {
  id: string;
  title: string;
  preview: string;
  started_at: number;
  message_count: number;
}

const CHOICES: ApprovalChoice[] = ['once', 'session', 'always', 'deny'];
const s = (v: unknown): string => (typeof v === 'string' ? v : '');

let counter = 0;
export function newItemId(): string {
  counter += 1;
  return `c${counter}`;
}

export function startedAtMs(v: number): number {
  return v < 1e12 ? v * 1000 : v;
}

/** Close the open streaming bubble (dropping it when empty) so later deltas start a new one. */
function settle(items: ChatItem[]): ChatItem[] {
  const last = items[items.length - 1];
  if (last?.kind !== 'assistant' || !last.streaming) return items;
  return last.text ? [...items.slice(0, -1), { ...last, streaming: false }] : items.slice(0, -1);
}

function answeredSinceLastUser(items: ChatItem[]): boolean {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (items[i].kind === 'user') return false;
    if (items[i].kind === 'assistant') return true;
  }
  return false;
}

export function applyChatEvent(view: ChatView, ev: ChatEvent): ChatView {
  const p = ev.payload ?? {};
  const items = view.items;
  const last = items[items.length - 1];
  switch (ev.type) {
    case 'message.start':
      if (last?.kind === 'assistant' && last.streaming) return { items, busy: true };
      return { items: [...items, { kind: 'assistant', id: newItemId(), text: '', streaming: true }], busy: true };
    case 'message.delta': {
      const text = s(p.text);
      if (last?.kind === 'assistant' && last.streaming) return { items: [...items.slice(0, -1), { ...last, text: last.text + text }], busy: true };
      return { items: [...items, { kind: 'assistant', id: newItemId(), text, streaming: true }], busy: true };
    }
    case 'message.complete': {
      const text = s(p.text);
      let next = settle(items);
      if (last?.kind === 'assistant' && last.streaming && !last.text && text) {
        next = [...next, { kind: 'assistant', id: last.id, text, streaming: false }];
      } else if (text && !answeredSinceLastUser(next)) {
        next = [...next, { kind: 'assistant', id: newItemId(), text, streaming: false }];
      }
      const error = s(p.error) || s(p.failure_reason);
      if (error) next = [...next, { kind: 'notice', id: newItemId(), text: error, tone: 'error' }];
      return { items: next, busy: false };
    }
    case 'tool.start': {
      const name = s(p.name) || 'tool';
      const label = s(p.preview) || s(p.context) || name;
      return { items: [...settle(items), { kind: 'tool', id: s(p.tool_id) || newItemId(), name, label, status: 'running' }], busy: true };
    }
    case 'tool.complete': {
      const id = s(p.tool_id);
      const ms = typeof p.duration_s === 'number' ? p.duration_s * 1000 : undefined;
      return { items: items.map((i) => (i.kind === 'tool' && i.id === id ? { ...i, status: 'done', durationMs: ms } : i)), busy: view.busy };
    }
    case 'error':
      return { items: [...settle(items), { kind: 'notice', id: newItemId(), text: s(p.message) || 'Terjadi kesalahan di Hermes', tone: 'error' }], busy: false };
    default:
      return view;
  }
}

export function fromTranscript(messages: TranscriptMessage[]): ChatItem[] {
  const out: ChatItem[] = [];
  for (const m of messages) {
    const text = s(m.text).trim();
    if (m.role === 'user' && text) out.push({ kind: 'user', id: newItemId(), text });
    else if (m.role === 'assistant' && text) out.push({ kind: 'assistant', id: newItemId(), text, streaming: false });
    else if (m.role === 'tool') {
      const name = s(m.name) || 'tool';
      out.push({ kind: 'tool', id: newItemId(), name, label: s(m.context) || name, status: 'done' });
    }
  }
  return out;
}

export function requestItem(req: ServerRequest): ChatItem | null {
  const p = req.params;
  if (req.method === 'approval') {
    const offered = Array.isArray(p.choices) ? p.choices : CHOICES;
    const choices = offered.filter((c): c is ApprovalChoice => CHOICES.includes(c as ApprovalChoice));
    return {
      kind: 'approval',
      id: newItemId(),
      requestId: req.id,
      command: s(p.command),
      description: s(p.description),
      choices: choices.length > 0 ? choices : ['once', 'deny'],
    };
  }
  if (req.method === 'clarify') {
    const first = Array.isArray(p.questions) && p.questions.length > 0 ? (p.questions[0] as Record<string, unknown>) : p;
    const choices = Array.isArray(first.choices) ? first.choices.filter((c): c is string => typeof c === 'string') : [];
    const qid = s(first.qid);
    return { kind: 'clarify', id: newItemId(), requestId: req.id, ...(qid ? { qid } : {}), question: s(first.question) || 'Agent bertanya', choices };
  }
  return null;
}

export function resolveRequest(items: ChatItem[], requestId: string, answer: string): ChatItem[] {
  return items.map((i) => {
    if (i.kind === 'approval' && i.requestId === requestId) return { ...i, decided: answer as ApprovalChoice };
    if (i.kind === 'clarify' && i.requestId === requestId) return { ...i, answered: answer };
    return i;
  });
}
```

- [ ] **Step 5: Jalankan test dan typecheck.**

Run: `pnpm -F @aos/office exec vitest run test/chat.test.ts` lalu `pnpm -F @aos/office typecheck`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add apps/office/src/chat/rpc.ts apps/office/src/chat/model.ts apps/office/test/chat.test.ts
git commit -m "feat(office): chat JSON-RPC client and streaming transcript model" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Office — store chat, `ChatPanel`, dan tab Chat di dock

**Files:**
- Create: `apps/office/src/chat/store.ts`, `apps/office/src/chat/ChatPanel.tsx`
- Modify: `apps/office/src/shell/Dock.tsx`

**Interfaces:**
- Consumes: `ChatRpc`, `ChatEvent`, `ServerRequest`, `ChatState` (Task 5); `applyChatEvent`, `fromTranscript`, `requestItem`, `resolveRequest`, `newItemId`, `startedAtMs`, `ChatItem`, `SessionRow`, `TranscriptMessage`, `ApprovalChoice` (Task 5).
- Produces:
  - `interface ProfileChat { runtimeId: string | null; storedId: string | null; items: ChatItem[]; busy: boolean; sessions: SessionRow[] }`
  - `interface ChatStoreState { connection: ChatState; closeCode: number | null; chats: Record<string, ProfileChat> }`
  - `chat = { connect, loadSessions, newSession, resume, send, interrupt, answer }`, `useChat(selector)`.
  - `ChatPanel({ profile })`.

- [ ] **Step 1: Implementasi** `apps/office/src/chat/store.ts`:

```ts
import { useSyncExternalStore } from 'react';
import { applyChatEvent, type ChatItem, fromTranscript, newItemId, requestItem, resolveRequest, type SessionRow, type TranscriptMessage } from './model.ts';
import { type ChatEvent, ChatRpc, type ChatState, type ServerRequest } from './rpc.ts';

export interface ProfileChat {
  runtimeId: string | null;
  storedId: string | null;
  items: ChatItem[];
  busy: boolean;
  sessions: SessionRow[];
}

export interface ChatStoreState {
  connection: ChatState;
  closeCode: number | null;
  chats: Record<string, ProfileChat>;
}

const EMPTY: ProfileChat = { runtimeId: null, storedId: null, items: [], busy: false, sessions: [] };
const RETRY_MS = [1_000, 3_000, 10_000, 30_000];

let state: ChatStoreState = { connection: 'idle', closeCode: null, chats: {} };
const listeners = new Set<() => void>();
let rpc: ChatRpc | null = null;
let retry = 0;

function set(patch: Partial<ChatStoreState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

const chatOf = (profile: string): ProfileChat => state.chats[profile] ?? EMPTY;

function patchChat(profile: string, patch: Partial<ProfileChat>): void {
  set({ chats: { ...state.chats, [profile]: { ...chatOf(profile), ...patch } } });
}

function notice(profile: string, text: string): void {
  patchChat(profile, { items: [...chatOf(profile).items, { kind: 'notice', id: newItemId(), text, tone: 'error' }], busy: false });
}

function profileOfSession(sessionId: unknown): string | null {
  if (typeof sessionId !== 'string') return null;
  return Object.keys(state.chats).find((p) => state.chats[p]?.runtimeId === sessionId) ?? null;
}

function onEvent(ev: ChatEvent): void {
  const profile = profileOfSession(ev.session_id);
  if (!profile) return;
  const c = chatOf(profile);
  patchChat(profile, applyChatEvent({ items: c.items, busy: c.busy }, ev));
}

function onRequest(req: ServerRequest): void {
  const profile = profileOfSession(req.params.session_id);
  const item = requestItem(req);
  if (profile && item) patchChat(profile, { items: [...chatOf(profile).items, item] });
}

function onState(next: ChatState, code?: number): void {
  set({ connection: next, closeCode: code ?? null });
  if (next === 'open') {
    retry = 0;
    void reattach();
  }
  if (next === 'closed' && code !== 1000) {
    const delay = RETRY_MS[Math.min(retry, RETRY_MS.length - 1)];
    retry += 1;
    setTimeout(() => rpc?.connect(), delay);
  }
}

function ensure(): ChatRpc {
  if (!rpc) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    rpc = new ChatRpc(`${protocol}//${window.location.host}/v1/chat`, { onEvent, onRequest, onState });
  }
  rpc.connect();
  return rpc;
}

function ready(): Promise<ChatRpc> {
  const r = ensure();
  if (r.state === 'open') return Promise.resolve(r);
  return new Promise((resolve, reject) => {
    const check = () => {
      if (state.connection !== 'open') return;
      listeners.delete(check);
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      listeners.delete(check);
      reject(new Error('Hermes serve belum terhubung'));
    }, 15_000);
    listeners.add(check);
  });
}

async function resume(profile: string, storedId: string): Promise<void> {
  const r = await ready();
  const res = await r.request<{ session_id: string; messages?: TranscriptMessage[]; open_requests?: ServerRequest[] }>('session.resume', {
    profile,
    session_id: storedId,
  });
  const open = (res.open_requests ?? []).map(requestItem).filter((i): i is ChatItem => i !== null);
  patchChat(profile, { runtimeId: res.session_id, storedId, items: [...fromTranscript(res.messages ?? []), ...open], busy: false });
}

async function reattach(): Promise<void> {
  for (const [profile, c] of Object.entries(state.chats)) {
    if (!c.storedId) continue;
    try {
      await resume(profile, c.storedId);
    } catch (err) {
      patchChat(profile, { runtimeId: null });
      notice(profile, (err as Error).message);
    }
  }
}

async function loadSessions(profile: string): Promise<void> {
  const r = await ready();
  const res = await r.request<{ sessions: SessionRow[] }>('session.list', { profile, limit: 20 });
  patchChat(profile, { sessions: res.sessions });
}

async function newSession(profile: string): Promise<void> {
  const r = await ready();
  const res = await r.request<{ session_id: string; stored_session_id?: string }>('session.create', { profile });
  patchChat(profile, { runtimeId: res.session_id, storedId: res.stored_session_id ?? null, items: [], busy: false });
}

async function guarded(profile: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    notice(profile, (err as Error).message);
  }
}

export const chat = {
  connect: () => void ensure(),
  loadSessions: (profile: string) => guarded(profile, () => loadSessions(profile)),
  newSession: (profile: string) => guarded(profile, () => newSession(profile)),
  resume: (profile: string, storedId: string) => guarded(profile, () => resume(profile, storedId)),
  send: (profile: string, text: string) =>
    guarded(profile, async () => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (!chatOf(profile).runtimeId) await newSession(profile);
      const c = chatOf(profile);
      patchChat(profile, { items: [...c.items, { kind: 'user', id: newItemId(), text: trimmed }], busy: true });
      await (await ready()).request('prompt.submit', { session_id: c.runtimeId, text: trimmed });
    }),
  interrupt: (profile: string) =>
    guarded(profile, async () => {
      const c = chatOf(profile);
      if (c.runtimeId) await (await ready()).request('session.interrupt', { session_id: c.runtimeId });
    }),
  answer(profile: string, item: ChatItem, value: string): void {
    if (!rpc) return;
    if (item.kind === 'approval') rpc.respond(item.requestId, { choice: value });
    else if (item.kind === 'clarify') rpc.respond(item.requestId, item.qid ? { answers: { [item.qid]: value } } : { answer: value });
    else return;
    patchChat(profile, { items: resolveRequest(chatOf(profile).items, item.requestId, value) });
  },
};

export function useChat<T>(selector: (s: ChatStoreState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(state),
  );
}
```

  `useChat` dipanggil dengan selector yang mengembalikan nilai stabil: field state, atau objek `ProfileChat` yang tidak berubah sampai di-patch. Jangan membuat objek baru di selector.

- [ ] **Step 2: Implementasi** `apps/office/src/chat/ChatPanel.tsx`:

```tsx
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Button } from '../../vendor/pixel-agents/webview-ui/src/components/ui/Button.tsx';
import { type ApprovalChoice, type ChatItem, startedAtMs } from './model.ts';
import { chat, useChat } from './store.ts';

const CHOICE_LABEL: Record<ApprovalChoice, string> = {
  once: 'Izinkan sekali',
  session: 'Izinkan sesi ini',
  always: 'Selalu izinkan',
  deny: 'Tolak',
};

function Clarify({ profile, item }: { profile: string; item: Extract<ChatItem, { kind: 'clarify' }> }) {
  const [text, setText] = useState('');
  return (
    <div role="group" aria-label="Pertanyaan agent" className="border-2 border-accent p-8 flex flex-col gap-6">
      <strong>{item.question}</strong>
      {item.answered !== undefined ? (
        <span className="text-text-muted">Dijawab: {item.answered}</span>
      ) : (
        <>
          {item.choices.length > 0 && (
            <div className="flex flex-wrap gap-6">
              {item.choices.map((c) => (
                <Button key={c} size="sm" onClick={() => chat.answer(profile, item, c)}>
                  {c}
                </Button>
              ))}
            </div>
          )}
          <div className="flex gap-6">
            <input
              aria-label="Jawaban untuk agent"
              className="flex-1 min-w-0 bg-bg border-2 border-border px-6"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button size="sm" variant="accent" disabled={!text.trim()} onClick={() => chat.answer(profile, item, text.trim())}>
              Jawab
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Item({ profile, item }: { profile: string; item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return <div className="self-end max-w-[85%] bg-active-bg px-8 py-4 whitespace-pre-wrap break-words">{item.text}</div>;
    case 'assistant':
      return (
        <div className="self-start max-w-[95%] whitespace-pre-wrap break-words">
          {item.text}
          {item.streaming ? '▍' : ''}
        </div>
      );
    case 'tool':
      return (
        <div className="text-text-muted text-xs break-all">
          {item.status === 'running' ? '… ' : '✓ '}
          {item.label}
          {item.durationMs !== undefined ? ` (${Math.round(item.durationMs)} ms)` : ''}
        </div>
      );
    case 'notice':
      return <div className={item.tone === 'error' ? 'text-danger' : 'text-text-muted'}>{item.text}</div>;
    case 'approval':
      return (
        <div role="group" aria-label="Permintaan izin" className="border-2 border-status-permission p-8 flex flex-col gap-6">
          <strong>Agent meminta izin</strong>
          <code className="font-[inherit] break-all">{item.command || '(tanpa perintah)'}</code>
          {item.description && <span className="text-text-muted">{item.description}</span>}
          {item.decided ? (
            <span className="text-text-muted">Dijawab: {CHOICE_LABEL[item.decided]}</span>
          ) : (
            <div className="flex flex-wrap gap-6">
              {item.choices.map((c) => (
                <Button key={c} size="sm" variant={c === 'deny' ? undefined : 'accent'} onClick={() => chat.answer(profile, item, c)}>
                  {CHOICE_LABEL[c]}
                </Button>
              ))}
            </div>
          )}
        </div>
      );
    case 'clarify':
      return <Clarify profile={profile} item={item} />;
  }
}

export function ChatPanel({ profile }: { profile: string }) {
  const connection = useChat((s) => s.connection);
  const closeCode = useChat((s) => s.closeCode);
  const current = useChat((s) => s.chats[profile]);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const items = current?.items ?? [];
  const sessions = current?.sessions ?? [];
  const offline = connection !== 'open';

  useEffect(() => {
    chat.connect();
    void chat.loadSessions(profile);
  }, [profile]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [items]);

  function submit() {
    const text = draft;
    if (!text.trim()) return;
    setDraft('');
    void chat.send(profile, text);
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const status =
    closeCode === 4503
      ? 'Hermes serve nonaktif (AOS_SERVE_TOKEN belum diisi).'
      : connection === 'closed'
        ? 'Chat terputus; mencoba menyambung lagi…'
        : 'Menghubungkan ke Hermes serve…';
  const selected = sessions.some((row) => row.id === current?.storedId) ? (current?.storedId ?? '') : '';

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex flex-wrap items-center gap-6 p-8 border-b-2 border-border">
        <select
          aria-label="Riwayat sesi"
          className="bg-bg border-2 border-border min-w-0 flex-1"
          value={selected}
          onChange={(e) => {
            if (e.target.value) void chat.resume(profile, e.target.value);
          }}
        >
          <option value="">{current?.storedId ? 'Sesi saat ini' : 'Buka sesi lama…'}</option>
          {sessions.map((row) => (
            <option key={row.id} value={row.id}>
              {new Date(startedAtMs(row.started_at)).toLocaleString('id-ID')} · {row.title || row.preview || row.id}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={offline} onClick={() => void chat.newSession(profile)}>
          Sesi baru
        </Button>
        {current?.busy && (
          <Button size="sm" onClick={() => void chat.interrupt(profile)}>
            Hentikan
          </Button>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-12 flex flex-col gap-8" aria-live="polite">
        {offline && <p className="text-text-muted">{status}</p>}
        {!offline && items.length === 0 && (
          <p className="text-text-muted">Mulai percakapan dengan {profile}. Enter = kirim, Shift+Enter = baris baru. Perintah "/" tidak didukung.</p>
        )}
        {items.map((item) => (
          <Item key={item.id} profile={profile} item={item} />
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex gap-6 p-8 border-t-2 border-border">
        <textarea
          aria-label={`Pesan untuk ${profile}`}
          // biome-ignore lint/a11y/noAutofocus: the chat tab is opened on purpose (click or Ctrl+K)
          autoFocus
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder="Tulis pesan…"
          className="flex-1 min-w-0 bg-bg border-2 border-border px-6 py-2 resize-none"
        />
        <Button size="sm" variant="accent" disabled={offline || !draft.trim()} onClick={submit}>
          Kirim
        </Button>
      </div>
    </div>
  );
}
```

  Bila komentar `biome-ignore` tidak relevan (proyek tidak memakai Biome), hapus baris komentar itu.

- [ ] **Step 3: Pasang ke dock.** Di `apps/office/src/shell/Dock.tsx`:
  - Tambahkan import `import { ChatPanel } from '../chat/ChatPanel.tsx';`.
  - Ganti pembungkus tabpanel `<div className="flex-1 overflow-auto p-12 flex flex-col gap-8" role="tabpanel">` beserta blok `{tab === 'chat' && (<p …>…</p>)}` menjadi:

```tsx
      {tab === 'chat' ? (
        <div className="flex-1 min-h-0 flex flex-col" role="tabpanel">
          <ChatPanel profile={profile} />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-12 flex flex-col gap-8" role="tabpanel">
```

  - Tutup dengan `)}` setelah `</div>` penutup tabpanel lama (sebelum `</aside>`). Isi tab `cards`, `activity`, `agent` tidak berubah.

- [ ] **Step 4: Typecheck, test, build.**

Run: `pnpm -F @aos/office typecheck`, `pnpm -F @aos/office test`, `pnpm office:build`
Expected: tanpa error; semua test lulus; build sukses.

- [ ] **Step 5: Commit.**

```bash
git add apps/office/src/chat/store.ts apps/office/src/chat/ChatPanel.tsx apps/office/src/shell/Dock.tsx
git commit -m "feat(office): chat tab with streaming replies, approvals, clarify and session history" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pemasangan, verifikasi di mesin, dokumentasi

**Files:**
- Modify: `infra/windows/set-local-secrets.ps1`, `docs/runbook.md`, `docs/PRD-Agentic-OS.md`

- [ ] **Step 1: Skrip secrets.** Di `infra/windows/set-local-secrets.ps1`:
  - Ubah daftar token menjadi `foreach ($t in "AOS_BRIDGE_TOKEN", "AOS_UI_TOKEN", "AOS_APPROVER_TOKEN", "AOS_SERVE_TOKEN") {`.
  - Setelah baris `AOS_CORE_URL`, tambahkan:

```powershell
if (-not (Select-String -Path $EnvFile -Pattern "^AOS_SERVE_PORT=" -Quiet)) { Set-EnvLine "AOS_SERVE_PORT" "9129" }
```

  Commit:

```bash
git add infra/windows/set-local-secrets.ps1
git commit -m "chore(setup): generate the hermes serve token in set-local-secrets" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Siap merge.** Jalankan `pnpm -r test`, `pnpm -r typecheck`, `pnpm office:build`, `py -3 -m pytest packages tests/redteam -q`. Semua harus hijau.

- [ ] **Step 3: Isi `.env.local` (izin owner).** Tambahkan `AOS_SERVE_TOKEN` acak dan `AOS_SERVE_PORT=9129` tanpa mencetak nilai:

```bash
node -e "const f=process.argv[1],fs=require('fs');let t=fs.readFileSync(f,'utf8');const add=(k,v)=>{if(!new RegExp('^'+k+'=','m').test(t))t+=(t.endsWith('\n')?'':'\n')+k+'='+v+'\n'};add('AOS_SERVE_TOKEN',require('crypto').randomBytes(32).toString('hex'));add('AOS_SERVE_PORT','9129');fs.writeFileSync(f,t);console.log('ok')" "D:/MIT/CLAUDE CODE PROJECT/agentic OS/.env.local"
```

- [ ] **Step 4: Restart Core (izin owner).** Matikan proses di port 7400, lalu `explorer.exe "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\AgenticOS_Core.vbs"`. Tunggu ±20 detik. Cek `GET /v1/health` → ok dan `D:\agentic-os\core\serve.log` tidak berisi traceback.

- [ ] **Step 5: Verifikasi di mesin** (preview `office` Vite dev; screenshot/DOM tiap butir):
  - **C1 — proses & isolasi.**
    - HUD: titik "Hermes serve" hijau `port 9129`.
    - `D:\agentic-os\serve-locks\host-serve.json` ada; `%USERPROFILE%\.local\state\hermes\gateway-locks\host-serve.json` **tidak** ada; `host-gateway.json` tetap milik gateway Agentic OS.
    - `GET /v1/health/components` → `serve` ok.
  - **C2 — chat chief.** `Ctrl+K` → tab Chat chief, textarea fokus → "Balas hanya dengan satu kata: pong". Jawaban mengalir lalu selesai; tombol "Hentikan" hilang; event `session.started` mode `tui` masuk Core (`/v1/events?profile=chief`).
  - **C3 — tool di worker.** Dock `researcher` (`2`) → Chat → "Buat file halo.md berisi kata halo, lalu baca lagi." Muncul baris tool `write_file`/`read_file` ✓, dan file ada di `workspaces\chat\researcher\halo.md`. Ini membuktikan cwd sesi = folder chat, bukan repo.
  - **C4 — approval di chat.** Dock `dev` → Chat → "Jalankan perintah terminal persis: git push origin main". Kartu "Agent meminta izin" muncul dengan `git push origin main` → **Tolak** → agent melaporkan ditolak; tidak ada push. Baris approval `native` tercatat di Core (`GET /v1/approvals?status=denied`).
  - **C5 — riwayat sesi.** Reload halaman → dock chief → dropdown "Riwayat sesi" berisi sesi C2 → pilih → transkrip "pong" tampil. Sesi Telegram/CLI chief **tidak** muncul di daftar.
  - **C6 — keamanan relay** (dari konsol browser):

```js
const ws = new WebSocket(`ws://${location.host}/v1/chat`); const got = [];
ws.onmessage = (e) => got.push(JSON.parse(e.data));
await new Promise((r) => (ws.onopen = r));
ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'shell.exec', params: { command: 'whoami' } }));
ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'session.create', params: { profile: 'root' } }));
await new Promise((r) => setTimeout(r, 1500)); ws.close(); got.filter((f) => f.id)
```

    Harapan: id 1 → error `-32601`, id 2 → error `-32602`. Di chat, mengetik `/yolo` → pesan "Perintah slash tidak didukung…".
  - **C7 — Core mati → serve ikut mati → hidup lagi.**
    - Matikan proses port 7400 → dalam ±10 detik port 9129 juga tertutup (watchdog `HERMES_PARENT_PID`).
    - Nyalakan Core lewat `explorer.exe` → serve hidup lagi, dan chat tersambung ulang otomatis ("Menghubungkan…" lalu hilang).
  - **C8 — Hermes owner tidak tersentuh.** `hermes serve --status` dari shell **dengan** `HERMES_HOME` owner (tanpa set `HERMES_HOME` Agentic OS) tidak melaporkan "attach" ke instance kita. Gateway owner dan Desktop tetap berjalan.

- [ ] **Step 6: Bersihkan.**
  - Hapus `workspaces\chat\researcher\halo.md`.
  - Sesi uji tetap tersimpan di `state.db` (tidak perlu dihapus).

- [ ] **Step 7: Dokumentasi.**
  - **`docs/runbook.md`:**
    - §2 diagram: blok M5b (browser → `/v1/chat` → relay Core → `hermes serve` 9129 → profile).
    - §3:
      - subbagian "Chat kantor (M5b)": cara pakai, `Ctrl+K`, riwayat sesi, kartu izin;
      - `AOS_SERVE_TOKEN`/`AOS_SERVE_PORT`/`AOS_SERVE_LOCK_DIR` di "Konfigurasi lokal";
      - rute `/v1/chat` di tabel endpoint;
      - log `D:\agentic-os\core\serve.log`;
      - folder `workspaces\chat\<profile>`.
    - §4 keterbatasan:
      - slash command tidak didukung dari kantor;
      - hanya sesi kantor yang bisa dibuka;
      - `hermes serve --stop` milik owner ikut mematikan serve kita (supervisor menyalakannya lagi);
      - lampiran file belum ada.
    - §5 "Bukti exit M5b" berisi C1–C8.
  - **`docs/PRD-Agentic-OS.md`:**
    - §5.4.1 modul `serve` + `chat-relay`;
    - §5.4.2 rute `/v1/chat`;
    - §5.5.4 status chat;
    - §5.5.6 `Ctrl+K` aktif;
    - §8 relay allowlist + token serve;
    - §13 M5b ✅;
    - §16: butir 10 (record host serve) terjawab, dan butir baru untuk lampiran file/slash command.

- [ ] **Step 8: Commit docs.**

```bash
git add docs/runbook.md docs/PRD-Agentic-OS.md
git commit -m "docs: record M5b office chat verification in runbook and PRD" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Selesaikan branch.** Tawarkan opsi merge ke owner (seperti M3–M5a: fast-forward ke `main`).

---

## Catatan spike

Spike 2026-10-02, serve sementara di port 9139, profile `chief`, lewat 9Router:

- **Start.** Serve siap dalam ±2 detik. Log: `HERMES_BACKEND_READY port=9139`. `GET /` → 200.
- **`client.capabilities`** → `server_requests`: `approval, clarify, display.install.sudo, preview.act, preview.read, secret, sudo, terminal.read, tour, vault.code, vault.save_login, vault.unlock_prompt, window.read`. Selain `approval`/`clarify`, semuanya ditolak relay (sesuai rencana).
- **`session.create`** → `{session_id, stored_session_id, message_count, messages, info}`. `info.cwd` = `cwd` yang dikirim (`…\workspaces\chat\chief`), `info.profile_name` = `chief`. **cwd dipatuhi.**
- **`prompt.submit`** → `{status:"streaming", user_row_id}`.
- **Urutan event:** `gateway.ready`, `sessions.changed`, `projects.changed`, `session.info`, `message.start`, `thinking.delta`, `message.delta`, `reasoning.available`, `message.complete`. Event yang tidak dikenal diabaikan reducer (cabang `default`).
- **`message.delta.text` = potongan (incremental).** Contoh: `"1, 2, 3, 4, 5, 6,"` lalu `" 7, 8, …"`. **`message.complete.text` = teks penuh.** Payload complete: `text, usage, status, persisted_turn`. Model Task 5 sudah sesuai, tanpa perubahan.
- **`session.list`** baris: `{id, title:"", preview, started_at: 1790937571.23606, message_count, source:"tui"}`. `started_at` dalam **detik (float)**, ditangani `startedAtMs`. `id` = `stored_session_id`.
- **`session.resume`** (pakai stored id) → `messages: [{role:"user", text, timestamp, row_id}, {role:"assistant", text:"pong", …}]`, ditambah `session_id`, `running`, `status`, `resumed`.
- **`shell.exec` DITERIMA serve** dengan token sesi, jadi allowlist relay adalah kontrol keamanan yang wajib.
- **Isolasi lock dir terbukti.** `host-serve.json/.lock/.token` hanya muncul di dir spike. Dir bawaan tetap berisi `host-desktop-serve.*` (Hermes Desktop owner), `host-gateway.*`, dan lock token Telegram.
- **Sisa spike.** Dua sesi uji (`source: tui`) tersimpan di `state.db` chief. Keduanya tidak tercatat di `chat_sessions`, jadi tidak muncul di kantor.
