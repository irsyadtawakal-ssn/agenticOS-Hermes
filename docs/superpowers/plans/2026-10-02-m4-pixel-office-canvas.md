# M4 — Pixel Office: Kanvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kantor pixel di browser yang karakternya (chief, researcher, secretary, content, dev) bergerak sesuai aktivitas nyata agent Hermes dari OS Core, dengan layout editor bawaan Pixel Agents yang tetap berfungsi dan tersimpan di Core.

**Architecture:**
- **Vendor.** UI Pixel Agents (`webview-ui` + `core/src`, MIT, commit `3537e14`) di-vendor apa adanya ke `apps/office/vendor/pixel-agents/`. Patch-nya kecil dan tercatat di `NOTICE.md`.
- **Adapter.** UI digerakkan pesan (`ServerMessage`). Kita mengganti transport WebSocket bawaannya dengan `HermesTransport` (`apps/office/src/hermes/`). Transport ini membaca `/v1/stream` dan REST OS Core, lalu `HermesAdapter` (murni, teruji) menerjemahkan event Hermes menjadi pesan Pixel Agents (`agentToolStart`, `agentStatus`, `agentToolPermission`, …).
- **Asset.** Sprite di-*decode* di browser oleh `browserMock` bawaan; di dev, plugin Vite men-*decode*-nya di server.
- **Core.** Menyimpan layout, kursi, dan setting kantor (`office_state`), menyajikan build kantor di `http://127.0.0.1:7400/office/`, dan menerima token UI lewat cookie httpOnly (`/office/login`), sehingga JavaScript kantor tidak pernah memegang token.
- **Dev.** Vite (`127.0.0.1:5173`) mem-proxy `/v1` ke Core sambil menyisipkan header token dari `.env.local`.

**Tech Stack:**
- `apps/office`: React 19 + Vite 8 + Tailwind 4 + TypeScript ~5.9 (mengikuti upstream), vitest.
- Core: Fastify 5 (tanpa dependency baru).
- Setup CLI: `pnpm aos office`.

**Spec:** `docs/PRD-Agentic-OS.md`:
- §5.5 (pixel office, terutama 5.5.1 dan 5.5.3)
- §5.4 (Core)
- §8.1 (akses UI tanpa izin)
- §13-M4

Fakta terpasang ada di `docs/runbook.md`.

## Global Constraints

- **Upstream:** `https://github.com/pixel-agents-hq/pixel-agents`, commit `3537e140c2094761beae748592aeb92ece8edfdd` (2026-08-15, v1.4.1), lisensi MIT. Yang di-vendor hanya `webview-ui/` (tanpa `test/`, `node_modules/`) dan `core/src/`, plus `LICENSE`.
- **Sprite karakter** berbasis "Metro City" oleh JIK-A-4 (itch.io). Dicatat di `apps/office/LICENSES.md`; cek ulang lisensinya bila dikomersialkan (PRD §15).
- **Patch vendor** hanya yang tercantum di Task 1 dan Task 4, dan semuanya dicatat di `apps/office/vendor/pixel-agents/NOTICE.md`. Struktur relatif upstream dipertahankan: `webview-ui/src` mengimpor `../../core/src/...`, jadi `core/` harus bersebelahan dengan `webview-ui/`.
- **Agent id tetap:** `chief=1`, `researcher=2`, `secretary=3`, `content=4`, `dev=5`. Event profile lain (`shared`, `default`) diabaikan.
- **Token:** `AOS_UI_TOKEN` tidak pernah ada di JavaScript kantor, URL halaman, log, atau output. Prod memakai cookie `aos_ui` (HttpOnly, SameSite=Strict); dev memakai header yang disisipkan proxy Vite.
- **Bahasa:** label aktivitas untuk owner dalam Bahasa Indonesia; kode, identifier, dan commit dalam Bahasa Inggris.
- **Commit:**
  - Trailer PERSIS `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Jangan pakai heredoc untuk menulis file (pakai Edit/Write).
- **Test:**
  - `pnpm -r test`, `pnpm -r typecheck`, `py -3 -m pytest packages tests/redteam -q`.
  - Build kantor: `pnpm -F @aos/office build`.
- **Langkah mesin** (`pnpm install` yang mengunduh paket, restart Core, `hermes` live) hanya atas izin owner.
  - Restart Core/gateway HARUS lewat `explorer.exe "<shell:startup>\<file>.vbs"`, bukan dari shell otomasi (runbook "Menyalakan ulang proses").
- Branch: `m4-pixel-office` dari `main`. Ledger: `.superpowers/sdd/2026-10-02-m4-pixel-office/progress.md`.

## Pemetaan state (PRD §5.5.3 → M4)

| PRD | Sumber | Pesan Pixel Agents | Catatan M4 |
|---|---|---|---|
| `idle` | tidak ada aktivitas | (tidak ada) | Karakter berkeliaran (perilaku bawaan engine) |
| `thinking` | `llm.started` | `agentStatus active` | Duduk di meja |
| `typing` | `tool.started` tool tulis | `agentToolStart` (toolName bukan reading) | Animasi mengetik, label "Menulis …" |
| `reading` | `tool.started` tool baca/web/browser | `agentToolStart` (toolName ∈ `readingTools`) | Animasi membaca |
| `running` | `terminal` / `process_manage` / `execute_code` | `agentToolStart` | Animasi mengetik, label "Menjalankan …" |
| `waiting_owner` | `policy.decision` `park`/`native`, approval `pending` | `agentToolPermission` | Gelembung "…" tetap sampai approval selesai, termasuk setelah sesi berakhir |
| `stuck` | `breaker.tripped` | `agentToolPermission` | **Perkiraan**: gelembung "…" (gelembung "?" merah ditunda) |
| `celebrate` | `session.ended` | `agentToolsClear` + `agentStatus waiting` | Gelembung ✓ yang memudar sendiri |
| `offline` | koneksi Core putus | state transport → `ConnectionIndicator` | Offline per-agent ditunda (butuh modul health) |
| `spawn` | `delegate_task` | sub-agent via `subagentToolNames` | Karakter sementara di dekat induknya |
| meja kosong | layout | — | Layout bawaan upstream punya ±8 kursi kerja; 3 meja kosong tanpa label (label ditunda) |

## File Structure

| File | Tanggung jawab |
|---|---|
| `apps/office/vendor/pixel-agents/{LICENSE,NOTICE.md,core/src/**,webview-ui/**}` | Kode upstream + daftar patch |
| `apps/office/package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json` | Paket `@aos/office`; root Vite = `vendor/pixel-agents/webview-ui` (`index.html` upstream tetap di sana) |
| `apps/office/LICENSES.md` | Atribusi MIT + sprite JIK-A-4 |
| `apps/office/src/hermes/labels.ts` | id agent, daftar tool baca/sub-agent, label aktivitas |
| `apps/office/src/hermes/adapter.ts` | `HermesAdapter`: event/approval/state Core → `ServerMessage[]` (murni) |
| `apps/office/src/hermes/assets.ts` | Susun pesan asset berurutan dari payload `browserMock` |
| `apps/office/src/hermes/transport.ts` | `HermesTransport implements MessageTransport` |
| `apps/core/src/office.ts` | `office_state` store, validasi, file statis kantor, cookie |
| `apps/core/src/server.ts` | Rute `/v1/office/state*`, `/office/login`, `/office/*`; auth UI juga dari cookie |
| `packages/setup/src/office.ts`, `cli.ts` | `pnpm aos office` (buka browser tanpa mencetak token) |

---

### Task 1: Vendor Pixel Agents ke `apps/office` (+ izin `pnpm install`)

**Files:**
- Create: `apps/office/vendor/pixel-agents/**`, `apps/office/package.json`, `apps/office/vite.config.ts`, `apps/office/vitest.config.ts`, `apps/office/tsconfig.json`, `apps/office/LICENSES.md`
- Modify: `pnpm-workspace.yaml` (bila perlu), `package.json` root (script `office:dev`, `office:build`), `.gitignore` (`apps/office/dist`)

**Interfaces:**
- Produces:
  - Paket `@aos/office` dengan script `dev` (Vite 127.0.0.1:5173), `build` (→ `apps/office/dist`), `test`, `typecheck`.
  - Vendored `vite.config.ts` meng-export `browserMockAssetsPlugin`.
- Patch vendor di task ini:
  - **P1** `webview-ui/vite.config.ts`: tambah `export` pada `function browserMockAssetsPlugin`.

- [ ] **Step 1: Minta izin owner** untuk mengunduh dependency npm kantor (`react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `typescript ~5.9`, `pngjs`, `@types/*`, `vitest`) lewat `pnpm install`. Repo upstream sudah ada di scratchpad (clone dangkal yang diizinkan 2026-10-02); bila belum ada, clone ulang `--depth 1` lalu `git checkout 3537e140…` (repo publik MIT, sudah diizinkan).

- [ ] **Step 2: Salin file upstream** (dari clone `<SCRATCH>/pixel-agents`):

```bash
mkdir -p apps/office/vendor/pixel-agents
cp <SCRATCH>/pixel-agents/LICENSE apps/office/vendor/pixel-agents/
cp -r <SCRATCH>/pixel-agents/core apps/office/vendor/pixel-agents/core
cp -r <SCRATCH>/pixel-agents/webview-ui apps/office/vendor/pixel-agents/webview-ui
rm -rf apps/office/vendor/pixel-agents/webview-ui/test apps/office/vendor/pixel-agents/webview-ui/node_modules apps/office/vendor/pixel-agents/core/asyncapi.yaml
```

Pertahankan `core/src/**` utuh, karena `webview-ui` dan plugin Vite memakai `core/src/assets/*`.

- [ ] **Step 3: Patch P1.** Di `apps/office/vendor/pixel-agents/webview-ui/vite.config.ts`, ganti `function browserMockAssetsPlugin(): Plugin {` menjadi `export function browserMockAssetsPlugin(): Plugin {`.

- [ ] **Step 4: Tulis `apps/office/vendor/pixel-agents/NOTICE.md`:**

```markdown
# Pixel Agents (vendored)

Sumber: https://github.com/pixel-agents-hq/pixel-agents — commit 3537e140c2094761beae748592aeb92ece8edfdd (v1.4.1, 2026-08-15), lisensi MIT (lihat LICENSE).
Disalin: `core/src/**`, `webview-ui/**` (tanpa `test/`). Tidak disalin: adapter VS Code, server, e2e, scripts.

Patch Agentic OS (selain ini, file identik dengan upstream):
- P1 `webview-ui/vite.config.ts`: `browserMockAssetsPlugin` di-export agar dipakai `apps/office/vite.config.ts`.
- P2 `webview-ui/src/transport/index.ts`: runtime browser memakai `createHermesTransport()` (Agentic OS) alih-alih WebSocket ke server Pixel Agents.
- P3 `webview-ui/src/main.tsx`: `initBrowserMock()` dijalankan di semua build browser (bukan hanya dev) agar asset di-decode di browser.
- P4 `webview-ui/src/App.tsx`: efek `dispatchMockMessages()` dihapus; asset dikirim `HermesTransport`.
- P5 `webview-ui/src/browserMock.ts`: tambah `export function getMockPayload()` dan `export type { MockPayload }`.
```

- [ ] **Step 5: Tulis `apps/office/package.json`:**

```json
{
  "name": "@aos/office",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "react": "^19.2.5",
    "react-dom": "^19.2.5"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.2.2",
    "@types/node": "^26.6.3",
    "@types/pngjs": "^6.0.5",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "pngjs": "^7.0.0",
    "tailwindcss": "^4.2.2",
    "typescript": "~5.9.3",
    "vite": "^8.0.8",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 6: Tulis `apps/office/vite.config.ts`:**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { browserMockAssetsPlugin } from './vendor/pixel-agents/webview-ui/vite.config.ts';

const here = import.meta.dirname;

// Dev only: read the UI token server-side so the browser never sees it.
function uiTokenFromEnvLocal(): string {
  const file = resolve(here, '../../.env.local');
  if (!existsSync(file)) return '';
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith('AOS_UI_TOKEN='));
  return line ? line.slice('AOS_UI_TOKEN='.length).trim() : '';
}

const coreUrl = process.env.AOS_CORE_URL ?? 'http://127.0.0.1:7400';
const token = uiTokenFromEnvLocal();

export default defineConfig({
  root: resolve(here, 'vendor/pixel-agents/webview-ui'),
  base: './',
  plugins: [tailwindcss(), react(), browserMockAssetsPlugin()],
  build: { outDir: resolve(here, 'dist'), emptyOutDir: true },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    fs: { allow: [here] },
    proxy: {
      '/v1': { target: coreUrl, changeOrigin: true, ws: true, headers: token ? { authorization: `Bearer ${token}` } : {} },
    },
  },
});
```

- [ ] **Step 7: Tulis `apps/office/tsconfig.json`** (menyalin opsi `webview-ui/tsconfig.app.json` upstream):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "types": ["vite/client", "node"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "erasableSyntaxOnly": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "test", "vendor/pixel-agents/webview-ui/src"]
}
```

`apps/office/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'] } });
```

- [ ] **Step 8: Tulis `apps/office/LICENSES.md`:**

```markdown
# Lisensi pihak ketiga — apps/office

- **Pixel Agents** (engine kantor, editor layout, asset furniture/lantai/dinding) — MIT, © 2026 Pablo De Lucca. Lihat `vendor/pixel-agents/LICENSE` dan `vendor/pixel-agents/NOTICE.md`.
- **Sprite karakter** (`vendor/pixel-agents/webview-ui/public/assets/characters/`) — berbasis "Metro City — Free Topdown Character Pack" oleh JIK-A-4 (https://jik-a-4.itch.io/metrocity-free-topdown-character-pack). Dipakai untuk penggunaan pribadi; periksa lisensi pack aslinya sebelum penggunaan komersial (PRD §15).
```

- [ ] **Step 9: Workspace & scripts.**
  - Pastikan `pnpm-workspace.yaml` mencakup `apps/*`.
  - Tambah ke `package.json` root: `"office:dev": "pnpm -F @aos/office dev"`, `"office:build": "pnpm -F @aos/office build"`.
  - Tambah `apps/office/dist/` ke `.gitignore`.

- [ ] **Step 10: Install & build** (setelah izin Step 1):

Run:
- `pnpm install`
- `pnpm -F @aos/office build`

Expected: build sukses, `apps/office/dist/index.html` ada, dan `apps/office/dist/assets/` berisi `asset-index.json` + `furniture-catalog.json` (ditulis plugin saat `closeBundle`).

Bila `typecheck` gagal pada kode vendor karena perbedaan opsi, sesuaikan `tsconfig.json` (bukan kode vendor) dan catat di NOTICE.

- [ ] **Step 11: Commit**

```bash
git add apps/office pnpm-workspace.yaml package.json pnpm-lock.yaml .gitignore
git commit -m "feat(office): vendor Pixel Agents webview and core at 3537e14" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Core — state kantor, cookie UI, dan file statis kantor

**Files:**
- Create: `apps/core/src/office.ts`
- Modify: `apps/core/src/db.ts` (tabel `office_state`), `apps/core/src/server.ts`, `apps/core/src/main.ts` (`officeDir`)
- Test: `apps/core/test/office.test.ts`; perluas `apps/core/test/server.test.ts`

**Interfaces:**
- Produces:
  - `OFFICE_KEYS = ['layout','seats','settings']`.
  - `getOfficeState(db) -> {layout: object|null, seats: Record<string,{palette:number,hueShift:number,seatId:string|null}>, settings: {soundEnabled?:boolean, alwaysShowLabels?:boolean}}`.
  - `putOfficeState(db, key, value, now)`, `validateOfficeValue(key, value) -> string|null` (pesan error).
  - `cookieToken(header) -> string`.
  - `resolveOfficeFile(officeDir, urlPath) -> string|null` (aman dari traversal; SPA fallback ke `index.html`).
  - `contentType(path)`.
- Rute (HTTP):

  | Method | Path | Auth | Keterangan |
  |---|---|---|---|
  | GET | `/v1/office/state` | UI | `{layout, seats, settings}` |
  | PUT | `/v1/office/state/:key` | UI | key ∈ `OFFICE_KEYS`; body = nilai JSON; 400 bila tidak valid |
  | GET | `/office/login?token=` | — | token UI valid → `Set-Cookie: aos_ui=<token>; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000` + 302 ke `/office/`; salah → 401 |
  | GET | `/office` / `/office/*` | — | File statis dari `officeDir`, SPA fallback `index.html`; 404 + petunjuk build bila `officeDir` tidak ada |

  - Auth UI menerima Bearer, `?token=`, **atau** cookie `aos_ui`. Berlaku juga untuk `/v1/stream`, sehingga WebSocket same-origin dari kantor ter-otentikasi otomatis.
- `ServerDeps` + `officeDir?: string`. `main.ts` mengisi `join(repoRoot, 'apps/office/dist')`.

- [ ] **Step 1: Write the failing tests** — `apps/core/test/office.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openCoreDb } from '../src/db.js';
import { contentType, cookieToken, getOfficeState, putOfficeState, resolveOfficeFile, validateOfficeValue } from '../src/office.js';

describe('office state', () => {
  it('starts empty and stores layout, seats and settings', () => {
    const db = openCoreDb(':memory:');
    expect(getOfficeState(db)).toEqual({ layout: null, seats: {}, settings: {} });
    putOfficeState(db, 'layout', { version: 1, cols: 2, rows: 2, tiles: [0, 0, 0, 0], furniture: [] }, 1);
    putOfficeState(db, 'seats', { '1': { palette: 0, hueShift: 0, seatId: 's1' } }, 2);
    putOfficeState(db, 'settings', { alwaysShowLabels: false }, 3);
    expect(getOfficeState(db)).toEqual({
      layout: { version: 1, cols: 2, rows: 2, tiles: [0, 0, 0, 0], furniture: [] },
      seats: { '1': { palette: 0, hueShift: 0, seatId: 's1' } },
      settings: { alwaysShowLabels: false },
    });
  });

  it('validates values per key', () => {
    expect(validateOfficeValue('layout', { version: 1, cols: 2, rows: 2, tiles: [], furniture: [] })).toBeNull();
    expect(validateOfficeValue('layout', { version: 2 })).toMatch(/layout/);
    expect(validateOfficeValue('layout', null)).toMatch(/layout/);
    expect(validateOfficeValue('seats', { '1': { palette: 1, hueShift: 0, seatId: null } })).toBeNull();
    expect(validateOfficeValue('seats', [])).toMatch(/seats/);
    expect(validateOfficeValue('settings', { soundEnabled: true, alwaysShowLabels: false })).toBeNull();
    expect(validateOfficeValue('settings', { soundEnabled: 'yes' })).toMatch(/settings/);
    expect(validateOfficeValue('nope', {})).toMatch(/unknown/);
  });
});

describe('cookies and static files', () => {
  it('reads the aos_ui cookie', () => {
    expect(cookieToken('a=1; aos_ui=tok123; b=2')).toBe('tok123');
    expect(cookieToken(undefined)).toBe('');
    expect(cookieToken('aos_uix=1')).toBe('');
  });

  it('resolves office files safely with SPA fallback', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-office-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'x');
    expect(resolveOfficeFile(dir, '/office/')).toBe(join(dir, 'index.html'));
    expect(resolveOfficeFile(dir, '/office/assets/app.js')).toBe(join(dir, 'assets', 'app.js'));
    expect(resolveOfficeFile(dir, '/office/some/route')).toBe(join(dir, 'index.html'));
    expect(resolveOfficeFile(dir, '/office/../../secret.txt')).toBe(join(dir, 'index.html'));
    expect(resolveOfficeFile(dir, '/office/%2e%2e/%2e%2e/x')).toBe(join(dir, 'index.html'));
    expect(resolveOfficeFile(join(dir, 'missing'), '/office/')).toBeNull();
    expect(contentType('a.js')).toBe('text/javascript; charset=utf-8');
    expect(contentType('a.png')).toBe('image/png');
    expect(contentType('a.unknown')).toBe('application/octet-stream');
  });
});
```

Tambahan di `apps/core/test/server.test.ts` (pakai helper `makeWith` dari M3; tambah opsi `officeDir`):

```ts
describe('office routes', () => {
  it('stores office state behind the UI token and accepts the aos_ui cookie', async () => {
    const { app } = await makeWith();
    expect((await app.inject({ method: 'GET', url: '/v1/office/state' })).statusCode).toBe(401);
    const empty = await app.inject({ method: 'GET', url: '/v1/office/state', headers: { cookie: 'aos_ui=ut' } });
    expect(empty.json()).toEqual({ layout: null, seats: {}, settings: {} });
    const bad = await app.inject({ method: 'PUT', url: '/v1/office/state/layout', payload: { version: 9 }, headers: { authorization: 'Bearer ut' } });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({ method: 'PUT', url: '/v1/office/state/settings', payload: { alwaysShowLabels: true }, headers: { authorization: 'Bearer ut' } });
    expect(ok.json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'PUT', url: '/v1/office/state/nope', payload: {}, headers: { authorization: 'Bearer ut' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/agents', headers: { cookie: 'aos_ui=ut' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/agents', headers: { cookie: 'aos_ui=at' } })).statusCode).toBe(401);
  });

  it('logs in with a valid UI token via an httpOnly cookie', async () => {
    const { app } = await makeWith();
    expect((await app.inject({ method: 'GET', url: '/office/login?token=wrong' })).statusCode).toBe(401);
    const res = await app.inject({ method: 'GET', url: '/office/login?token=ut' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/office/');
    expect(String(res.headers['set-cookie'])).toMatch(/^aos_ui=ut; HttpOnly; SameSite=Strict; Path=\/; Max-Age=2592000$/);
  });

  it('serves the built office with SPA fallback, or a build hint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-office-'));
    writeFileSync(join(dir, 'index.html'), '<html>office</html>');
    const { app } = await makeWith({ officeDir: dir });
    const page = await app.inject({ method: 'GET', url: '/office/' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.body).toBe('<html>office</html>');
    expect((await app.inject({ method: 'GET', url: '/office' })).statusCode).toBe(302);
    const { app: noBuild } = await makeWith({ officeDir: join(dir, 'missing') });
    const hint = await noBuild.inject({ method: 'GET', url: '/office/' });
    expect(hint.statusCode).toBe(404);
    expect(hint.body).toMatch(/pnpm office:build/);
  });
});
```

Tambah import `mkdtempSync`, `writeFileSync`, `tmpdir`, `join` di kepala `server.test.ts` bila belum ada. Catatan: `makeWith` menimpa variabel `app` yang ditutup `afterEach`. Di test ketiga, simpan instance pertama sebagai `first` dan tutup manual (`await first.close()`) sebelum memanggil `makeWith` kedua, agar tidak ada server yang tertinggal.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm -F @aos/core test`
Expected: FAIL (`office.js` belum ada, rute 404).

- [ ] **Step 3: Implement**

`apps/core/src/db.ts`: tambahkan ke `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS office_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

`apps/core/src/office.ts`:

```ts
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Db } from './db.js';

export const OFFICE_KEYS = ['layout', 'seats', 'settings'] as const;
export type OfficeKey = (typeof OFFICE_KEYS)[number];

export interface SeatAssignment {
  palette: number;
  hueShift: number;
  seatId: string | null;
}

export interface OfficeState {
  layout: Record<string, unknown> | null;
  seats: Record<string, SeatAssignment>;
  settings: { soundEnabled?: boolean; alwaysShowLabels?: boolean };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateOfficeValue(key: string, value: unknown): string | null {
  if (key === 'layout') {
    if (!isObj(value) || value.version !== 1 || typeof value.cols !== 'number' || typeof value.rows !== 'number'
      || !Array.isArray(value.tiles) || !Array.isArray(value.furniture)) return 'layout must be a version 1 office layout';
    return null;
  }
  if (key === 'seats') {
    if (!isObj(value)) return 'seats must be an object';
    for (const seat of Object.values(value)) {
      if (!isObj(seat) || typeof seat.palette !== 'number' || typeof seat.hueShift !== 'number'
        || !(seat.seatId === null || typeof seat.seatId === 'string')) return 'seats entries need palette, hueShift and seatId';
    }
    return null;
  }
  if (key === 'settings') {
    if (!isObj(value)) return 'settings must be an object';
    for (const [k, v] of Object.entries(value)) {
      if (!['soundEnabled', 'alwaysShowLabels'].includes(k) || typeof v !== 'boolean') return 'settings only accepts boolean soundEnabled / alwaysShowLabels';
    }
    return null;
  }
  return 'unknown office key';
}

export function getOfficeState(db: Db): OfficeState {
  const rows = db.prepare('SELECT key, value FROM office_state').all() as Array<{ key: string; value: string }>;
  const byKey = new Map(rows.map((r) => [r.key, JSON.parse(r.value) as unknown]));
  return {
    layout: (byKey.get('layout') as OfficeState['layout']) ?? null,
    seats: (byKey.get('seats') as OfficeState['seats']) ?? {},
    settings: (byKey.get('settings') as OfficeState['settings']) ?? {},
  };
}

export function putOfficeState(db: Db, key: OfficeKey, value: unknown, now: number): void {
  db.prepare(
    `INSERT INTO office_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), now);
}

export function cookieToken(header: string | undefined): string {
  for (const part of (header ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === 'aos_ui') return rest.join('=');
  }
  return '';
}

export function resolveOfficeFile(officeDir: string, urlPath: string): string | null {
  const root = resolve(officeDir);
  const index = join(root, 'index.html');
  if (!existsSync(index)) return null;
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath.split('?')[0].replace(/^\/office\/?/, ''));
  } catch {
    return index;
  }
  if (!rel) return index;
  const candidate = resolve(root, normalize(rel));
  if (!candidate.startsWith(root + sep)) return index;
  return existsSync(candidate) && statSync(candidate).isFile() ? candidate : index;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

export function contentType(path: string): string {
  return TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}
```

`apps/core/src/server.ts`:
- Import `readFileSync` dari `node:fs` dan semua export `office.ts`.
- `ServerDeps` + `officeDir?: string`.
- Ubah `bearerOrQueryToken(req)` agar mengembalikan `cookieToken(req.headers.cookie)` sebagai fallback terakhir bila Bearer dan `?token=` kosong.
- Tambah rute:

```ts
  app.get('/v1/office/state', { preHandler: requireUi }, async () => getOfficeState(deps.db));

  app.put('/v1/office/state/:key', { preHandler: requireUi }, async (req, reply) => {
    const key = (req.params as { key: string }).key;
    if (!(OFFICE_KEYS as readonly string[]).includes(key)) return reply.code(404).send({ error: 'unknown office key' });
    const problem = validateOfficeValue(key, req.body);
    if (problem) return reply.code(400).send({ error: problem });
    putOfficeState(deps.db, key as OfficeKey, req.body, now());
    return { ok: true };
  });

  app.get('/office/login', async (req, reply) => {
    const token = (req.query as Record<string, unknown>).token;
    if (typeof token !== 'string' || !safeEqual(token, deps.uiToken)) return reply.code(401).send({ error: 'unauthorized' });
    reply.header('set-cookie', `aos_ui=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
    return reply.redirect('/office/', 302);
  });

  app.get('/office', async (_req, reply) => reply.redirect('/office/', 302));

  app.get('/office/*', async (req, reply) => {
    const file = deps.officeDir ? resolveOfficeFile(deps.officeDir, req.url) : null;
    if (!file) return reply.code(404).type('text/plain; charset=utf-8').send('Office belum di-build: jalankan `pnpm office:build`.');
    return reply.type(contentType(file)).send(readFileSync(file));
  });
```

Rute `/office/login` (statis) didaftarkan sebelum wildcard; Fastify mengutamakan rute statis.

`apps/core/src/main.ts`: tambahkan `officeDir: join(repoRoot, 'apps/office/dist')` ke `buildServer({...})`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm -F @aos/core test` dan `pnpm -F @aos/core typecheck`
Expected: PASS semua (termasuk test M2/M3).

- [ ] **Step 5: Commit**

```bash
git add apps/core
git commit -m "feat(core): office state store, httpOnly UI cookie login and static office hosting" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `HermesAdapter` — event Hermes → pesan Pixel Agents

**Files:**
- Create: `apps/office/src/hermes/labels.ts`, `apps/office/src/hermes/adapter.ts`
- Test: `apps/office/test/adapter.test.ts`

**Interfaces:**
- Consumes:
  - Bentuk event Core (`AosEvent` M2/M3, termasuk `payload.policy`).
  - Approval (`/v1/approvals`).
  - `agent_state` (`/v1/agents`).
  - Tipe `ServerMessage` / `AgentSeatMeta` dari `vendor/pixel-agents/core/src/messages.ts`.
- Produces:
  - `PROFILES`, `agentIdFor(profile) -> number|null`, `READING_TOOLS: string[]`, `SUBAGENT_TOOLS = ['delegate_task']`, `activityLabel(tool, argsPreview) -> string`.
  - `class HermesAdapter { capabilities(): ServerMessage; snapshot(states, approvals, seats): ServerMessage[]; onEvents(events): ServerMessage[]; onApprovals(rows): ServerMessage[] }`.

- [ ] **Step 1: Write the failing test** — `apps/office/test/adapter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { HermesAdapter, type CoreApproval, type CoreEvent } from '../src/hermes/adapter.ts';
import { activityLabel, agentIdFor, READING_TOOLS } from '../src/hermes/labels.ts';

let n = 0;
function ev(type: string, profile: string, payload: Record<string, unknown> = {}): CoreEvent {
  n += 1;
  return { id: `e${n}`, ts: n, type, profile, session_id: 's', task_id: null, mode: 'kanban', payload };
}
const approval = (id: string, profile: string, status: string): CoreApproval => ({ id, profile, status, mode: 'park', tool: 'terminal', task_id: 't_1' });

describe('labels', () => {
  it('maps profiles to fixed ids and ignores others', () => {
    expect(['chief', 'researcher', 'secretary', 'content', 'dev'].map(agentIdFor)).toEqual([1, 2, 3, 4, 5]);
    expect(agentIdFor('shared')).toBeNull();
  });

  it('builds Indonesian activity labels from args previews, including truncated JSON', () => {
    expect(activityLabel('read_file', '{"path": "notes.md"}')).toBe('Membaca notes.md');
    expect(activityLabel('terminal', '{"command": "git push origin main"}')).toBe('Menjalankan git push origin main');
    expect(activityLabel('write_file', '{"path": "out/report.md", "content": "very long…')).toBe('Menulis out/report.md');
    expect(activityLabel('web_search', '{"query": "postiz"}')).toBe('Mencari web postiz');
    expect(activityLabel('delegate_task', '{"goal": "riset A"}')).toBe('Subtask: riset A');
    expect(activityLabel('browser_click', '{}')).toBe('Memakai browser');
    expect(activityLabel('kanban_complete', '{}')).toBe('Kanban: kanban_complete');
    expect(activityLabel('mystery_tool', 'not json')).toBe('mystery_tool');
    expect(READING_TOOLS).toContain('web_search');
    expect(READING_TOOLS).not.toContain('terminal');
  });
});

describe('HermesAdapter', () => {
  it('announces Hermes tool taxonomy', () => {
    const caps = new HermesAdapter().capabilities();
    expect(caps).toMatchObject({ type: 'providerCapabilities', subagentToolNames: ['delegate_task'] });
  });

  it('restores the roster with seats, live state and pending approvals', () => {
    const a = new HermesAdapter();
    const msgs = a.snapshot(
      [
        { profile: 'chief', state: 'idle', task_id: null, detail: null, updated_at: 1 },
        { profile: 'researcher', state: 'reading', task_id: 't_1', detail: 'web_search', updated_at: 2 },
        { profile: 'dev', state: 'thinking', task_id: null, detail: 'COMBO-SS', updated_at: 3 },
      ],
      [approval('abc234', 'dev', 'pending')],
      { '2': { palette: 4, hueShift: 30, seatId: 'seat-x' } },
    );
    expect(msgs[0]).toEqual({
      type: 'existingAgents',
      agents: [1, 2, 3, 4, 5],
      folderNames: { '1': 'chief', '2': 'researcher', '3': 'secretary', '4': 'content', '5': 'dev' },
      agentMeta: {
        '1': { palette: 0, hueShift: 0 },
        '2': { palette: 4, hueShift: 30, seatId: 'seat-x' },
        '3': { palette: 2, hueShift: 0 },
        '4': { palette: 3, hueShift: 0 },
        '5': { palette: 4, hueShift: 0 },
      },
      externalAgents: {},
    });
    expect(msgs).toContainEqual({ type: 'agentStatus', id: 2, status: 'active' });
    expect(msgs).toContainEqual({ type: 'agentToolStart', id: 2, toolId: 'restore-2', status: 'Mencari web', toolName: 'web_search' });
    expect(msgs).toContainEqual({ type: 'agentStatus', id: 5, status: 'active' });
    expect(msgs).toContainEqual({ type: 'agentToolPermission', id: 5 });
    expect(msgs.some((m) => 'id' in m && m.id === 1)).toBe(false);
  });

  it('animates thinking, tools and the end of a run', () => {
    const a = new HermesAdapter();
    expect(a.onEvents([ev('llm.started', 'researcher')])).toEqual([{ type: 'agentStatus', id: 2, status: 'active' }]);
    expect(a.onEvents([ev('tool.started', 'researcher', { tool: 'read_file', tool_call_id: 'c1', args_preview: '{"path": "a.md"}', policy: { decision: 'allow' } })])).toEqual([
      { type: 'agentToolStart', id: 2, toolId: 'c1', status: 'Membaca a.md', toolName: 'read_file', permissionActive: false },
    ]);
    expect(a.onEvents([ev('tool.finished', 'researcher', { tool: 'read_file', tool_call_id: 'c1', status: 'ok' })])).toEqual([
      { type: 'agentToolDone', id: 2, toolId: 'c1' },
    ]);
    expect(a.onEvents([ev('session.ended', 'researcher')])).toEqual([
      { type: 'agentToolsClear', id: 2 },
      { type: 'agentStatus', id: 2, status: 'waiting' },
    ]);
    expect(a.onEvents([ev('llm.finished', 'researcher'), ev('session.started', 'researcher'), ev('tool.started', 'shared', { tool: 'x' })])).toEqual([]);
  });

  it('keeps the permission bubble while a park approval is pending, even after the run ends', () => {
    const a = new HermesAdapter();
    expect(a.onApprovals([approval('abc234', 'dev', 'pending')])).toEqual([{ type: 'agentToolPermission', id: 5 }]);
    const started = a.onEvents([ev('tool.started', 'dev', { tool: 'terminal', tool_call_id: 'c9', args_preview: '{"command": "git push"}', policy: { decision: 'park', approval_id: 'abc234' } })]);
    expect(started).toEqual([
      { type: 'agentToolStart', id: 5, toolId: 'c9', status: 'Menjalankan git push', toolName: 'terminal', permissionActive: true },
      { type: 'agentToolPermission', id: 5 },
    ]);
    expect(a.onEvents([ev('tool.finished', 'dev', { tool: 'terminal', tool_call_id: 'c9', status: 'blocked' })])).toEqual([{ type: 'agentToolDone', id: 5, toolId: 'c9' }]);
    expect(a.onEvents([ev('session.ended', 'dev')])).toEqual([
      { type: 'agentToolsClear', id: 5 },
      { type: 'agentStatus', id: 5, status: 'waiting' },
      { type: 'agentToolPermission', id: 5 },
    ]);
    expect(a.onApprovals([approval('abc234', 'dev', 'approved')])).toEqual([{ type: 'agentToolPermissionClear', id: 5 }]);
    expect(a.onApprovals([approval('abc234', 'dev', 'consumed')])).toEqual([]);
  });

  it('shows the native Hermes gate until the tool finishes', () => {
    const a = new HermesAdapter();
    expect(a.onEvents([ev('tool.started', 'chief', { tool: 'terminal', tool_call_id: 'n1', args_preview: '{"command": "rm -rf x"}', policy: { decision: 'native' } })])).toEqual([
      { type: 'agentToolStart', id: 1, toolId: 'n1', status: 'Menjalankan rm -rf x', toolName: 'terminal', permissionActive: true },
      { type: 'agentToolPermission', id: 1 },
    ]);
    expect(a.onEvents([ev('tool.finished', 'chief', { tool: 'terminal', tool_call_id: 'n1', status: 'blocked' })])).toEqual([
      { type: 'agentToolDone', id: 1, toolId: 'n1' },
      { type: 'agentToolPermissionClear', id: 1 },
    ]);
  });

  it('flags a tripped breaker with the permission bubble and ignores native approvals in the approvals topic', () => {
    const a = new HermesAdapter();
    expect(a.onEvents([ev('breaker.tripped', 'researcher', { tool: 'web_search', reason: 'repeat' })])).toEqual([{ type: 'agentToolPermission', id: 2 }]);
    expect(a.onApprovals([{ ...approval('n_x', 'chief', 'pending'), mode: 'native' }])).toEqual([]);
  });

  it('falls back to the event id when a tool call id is missing', () => {
    const a = new HermesAdapter();
    const [start] = a.onEvents([{ ...ev('tool.started', 'content', { tool: 'write_file' }), id: 'evt-7' }]);
    expect(start).toMatchObject({ type: 'agentToolStart', id: 4, toolId: 'evt-7', status: 'Menulis' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @aos/office test`
Expected: FAIL (modul belum ada).

- [ ] **Step 3: Implement**

`apps/office/src/hermes/labels.ts`:

```ts
export const PROFILES = ['chief', 'researcher', 'secretary', 'content', 'dev'] as const;

export function agentIdFor(profile: string): number | null {
  const index = (PROFILES as readonly string[]).indexOf(profile);
  return index < 0 ? null : index + 1;
}

// Hermes tools that should animate as "reading" (mirrors os-bridge READ_TOOLS + browser navigation).
export const READING_TOOLS = [
  'web_search', 'web_extract', 'read_file', 'search_files', 'session_search', 'vision_analyze',
  'skills_list', 'skill_view', 'kanban_show', 'kanban_list', 'kanban_attachments', 'office_list_tasks',
  'office_list_approvals', 'browser_navigate', 'browser_snapshot', 'browser_get_images', 'browser_vision', 'browser_console',
];

export const SUBAGENT_TOOLS = ['delegate_task'];

const FIELDS = ['path', 'file_path', 'command', 'query', 'goal', 'url'] as const;

function previewFields(preview: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof preview !== 'string') return out;
  try {
    const parsed = JSON.parse(preview) as unknown;
    if (parsed && typeof parsed === 'object') {
      for (const key of FIELDS) {
        const value = (parsed as Record<string, unknown>)[key];
        if (typeof value === 'string') out[key] = value;
      }
      return out;
    }
  } catch {
    // args_preview is often truncated JSON; fall back to field-by-field extraction.
  }
  for (const key of FIELDS) {
    const match = new RegExp(`"${key}":\\s*"([^"]*)`).exec(preview);
    if (match) out[key] = match[1];
  }
  return out;
}

const short = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function activityLabel(tool: string, argsPreview: unknown): string {
  const f = previewFields(argsPreview);
  const join = (verb: string, value: string | undefined) => (value ? `${verb} ${short(value)}` : verb);
  switch (tool) {
    case 'read_file':
      return join('Membaca', f.path ?? f.file_path);
    case 'search_files':
      return 'Mencari file';
    case 'web_search':
      return join('Mencari web', f.query);
    case 'web_extract':
      return 'Membuka halaman web';
    case 'write_file':
    case 'patch':
      return join('Menulis', f.path ?? f.file_path);
    case 'terminal':
    case 'process_manage':
      return join('Menjalankan', f.command);
    case 'execute_code':
      return 'Menjalankan kode';
    case 'delegate_task':
      return `Subtask: ${f.goal ? short(f.goal) : 'delegasi'}`;
    default:
      if (tool.startsWith('browser_') || tool === 'computer_use') return 'Memakai browser';
      if (tool.startsWith('kanban_') || tool.startsWith('office_')) return `Kanban: ${tool}`;
      return tool;
  }
}
```

`apps/office/src/hermes/adapter.ts`:

```ts
import type { AgentSeatMeta, ServerMessage } from '../../vendor/pixel-agents/core/src/messages.ts';
import { activityLabel, agentIdFor, PROFILES, READING_TOOLS, SUBAGENT_TOOLS } from './labels.ts';

export interface CoreEvent {
  id: string;
  ts: number;
  type: string;
  profile: string;
  session_id?: string | null;
  task_id?: string | null;
  mode: string;
  payload: Record<string, unknown>;
}

export interface CoreApproval {
  id: string;
  profile: string;
  status: string;
  mode: string;
  tool: string;
  task_id: string | null;
}

export interface CoreAgentState {
  profile: string;
  state: string;
  task_id: string | null;
  detail: string | null;
  updated_at: number | null;
}

const ACTIVE_TOOL_STATES = new Set(['reading', 'typing', 'running']);

export class HermesAdapter {
  private readonly pending = new Map<number, Set<string>>();
  private readonly nativeWaits = new Map<number, Set<string>>();

  capabilities(): ServerMessage {
    return { type: 'providerCapabilities', readingTools: READING_TOOLS, subagentToolNames: SUBAGENT_TOOLS };
  }

  private waiting(id: number): boolean {
    return (this.pending.get(id)?.size ?? 0) > 0 || (this.nativeWaits.get(id)?.size ?? 0) > 0;
  }

  snapshot(states: CoreAgentState[], approvals: CoreApproval[], seats: Record<string, AgentSeatMeta>): ServerMessage[] {
    const ids = PROFILES.map((_, i) => i + 1);
    const agentMeta: Record<string, AgentSeatMeta> = {};
    const folderNames: Record<string, string> = {};
    PROFILES.forEach((profile, i) => {
      folderNames[String(i + 1)] = profile;
      agentMeta[String(i + 1)] = { palette: i, hueShift: 0, ...seats[String(i + 1)] };
    });
    const out: ServerMessage[] = [{ type: 'existingAgents', agents: ids, agentMeta, folderNames, externalAgents: {} }];
    for (const s of states) {
      const id = agentIdFor(s.profile);
      if (id === null) continue;
      if (s.state === 'thinking') out.push({ type: 'agentStatus', id, status: 'active' });
      if (ACTIVE_TOOL_STATES.has(s.state) && s.detail) {
        out.push({ type: 'agentStatus', id, status: 'active' });
        out.push({ type: 'agentToolStart', id, toolId: `restore-${id}`, status: activityLabel(s.detail, ''), toolName: s.detail });
      }
    }
    this.pending.clear();
    for (const a of approvals) {
      const id = agentIdFor(a.profile);
      if (id === null || a.mode !== 'park' || a.status !== 'pending') continue;
      if (!this.pending.has(id)) this.pending.set(id, new Set());
      this.pending.get(id)!.add(a.id);
    }
    for (const id of this.pending.keys()) out.push({ type: 'agentToolPermission', id });
    return out;
  }

  onEvents(events: CoreEvent[]): ServerMessage[] {
    const out: ServerMessage[] = [];
    for (const ev of events) {
      const id = agentIdFor(ev.profile);
      if (id === null) continue;
      const p = ev.payload ?? {};
      switch (ev.type) {
        case 'llm.started':
          out.push({ type: 'agentStatus', id, status: 'active' });
          break;
        case 'tool.started': {
          const tool = typeof p.tool === 'string' ? p.tool : '?';
          const toolId = typeof p.tool_call_id === 'string' && p.tool_call_id ? p.tool_call_id : ev.id;
          const decision = (p.policy as { decision?: string } | undefined)?.decision;
          const gated = decision === 'park' || decision === 'native';
          out.push({ type: 'agentToolStart', id, toolId, status: activityLabel(tool, p.args_preview), toolName: tool, permissionActive: gated });
          if (decision === 'native') {
            if (!this.nativeWaits.has(id)) this.nativeWaits.set(id, new Set());
            this.nativeWaits.get(id)!.add(toolId);
          }
          if (gated) out.push({ type: 'agentToolPermission', id });
          break;
        }
        case 'tool.finished': {
          const toolId = typeof p.tool_call_id === 'string' && p.tool_call_id ? p.tool_call_id : ev.id;
          out.push({ type: 'agentToolDone', id, toolId });
          const waits = this.nativeWaits.get(id);
          if (waits?.delete(toolId) && !this.waiting(id)) out.push({ type: 'agentToolPermissionClear', id });
          break;
        }
        case 'session.ended':
          this.nativeWaits.delete(id);
          out.push({ type: 'agentToolsClear', id }, { type: 'agentStatus', id, status: 'waiting' });
          if (this.waiting(id)) out.push({ type: 'agentToolPermission', id });
          break;
        case 'breaker.tripped':
          out.push({ type: 'agentToolPermission', id });
          break;
        default:
          break;
      }
    }
    return out;
  }

  onApprovals(rows: CoreApproval[]): ServerMessage[] {
    const out: ServerMessage[] = [];
    for (const row of rows) {
      const id = agentIdFor(row.profile);
      if (id === null || row.mode !== 'park') continue;
      const before = this.waiting(id);
      const set = this.pending.get(id) ?? new Set<string>();
      if (row.status === 'pending') set.add(row.id);
      else set.delete(row.id);
      this.pending.set(id, set);
      const after = this.waiting(id);
      if (!before && after) out.push({ type: 'agentToolPermission', id });
      if (before && !after) out.push({ type: 'agentToolPermissionClear', id });
    }
    return out;
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm -F @aos/office test` dan `pnpm -F @aos/office typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/office/src apps/office/test
git commit -m "feat(office): translate Hermes events, approvals and agent state into Pixel Agents messages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `HermesTransport` + pemasangan di UI vendor

**Files:**
- Create: `apps/office/src/hermes/assets.ts`, `apps/office/src/hermes/transport.ts`
- Modify (patch vendor P2–P5):
  - `vendor/pixel-agents/webview-ui/src/transport/index.ts`
  - `vendor/pixel-agents/webview-ui/src/main.tsx`
  - `vendor/pixel-agents/webview-ui/src/App.tsx`
  - `vendor/pixel-agents/webview-ui/src/browserMock.ts`
- Test: `apps/office/test/transport.test.ts`

**Interfaces:**
- Consumes: `HermesAdapter` (Task 3); rute Core `/v1/stream` (topik `events`, `approvals`), `/v1/agents`, `/v1/approvals?status=pending`, `/v1/office/state`, `PUT /v1/office/state/:key` (Task 2).
- Produces:
  - `assetMessages(payload) -> ServerMessage[]` (urutan: `characterSpritesLoaded` → `floorTilesLoaded` → `wallTilesLoaded` → `carpetTilesLoaded` → `furnitureAssetsLoaded`).
  - `class HermesTransport implements MessageTransport` (konstruktor `{ wsUrl, fetchImpl?, WebSocketImpl?, loadAssets, adapter?, version?, reconnectDelays? }`).
  - `createHermesTransport()` untuk browser.
  - `send` menangani `webviewReady` (bootstrap), `saveLayout`, `saveAgentSeats`, `setSoundEnabled`, `setAlwaysShowLabels`; pesan lain diabaikan.

- [ ] **Step 1: Write the failing test** — `apps/office/test/transport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ServerMessage } from '../vendor/pixel-agents/core/src/messages.ts';
import { HermesTransport } from '../src/hermes/transport.ts';

class FakeSocket {
  static last: FakeSocket | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.last = this;
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  push(topic: string, data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ topic, data }) });
  }
}

function fakeFetch(routes: Record<string, unknown>, calls: Array<{ url: string; method: string; body?: unknown }>) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = `${init?.method ?? 'GET'} ${url}`;
    return new Response(JSON.stringify(routes[key] ?? { ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(state: unknown = { layout: null, seats: {}, settings: {} }) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetchImpl = fakeFetch(
    {
      'GET /v1/office/state': state,
      'GET /v1/agents': [{ profile: 'dev', state: 'thinking', task_id: null, detail: null, updated_at: 1 }],
      'GET /v1/approvals?status=pending': [],
    },
    calls,
  );
  const t = new HermesTransport({
    wsUrl: 'ws://office.test/v1/stream',
    fetchImpl,
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    loadAssets: async () => ({ messages: [{ type: 'characterSpritesLoaded', characters: [] }], defaultLayout: { version: 1, default: true } }),
    version: '1.4.1',
  });
  const got: ServerMessage[] = [];
  t.onMessage((m) => got.push(m));
  return { t, got, calls };
}

describe('HermesTransport', () => {
  it('connects to the Core stream and reports state', async () => {
    const { t } = setup();
    const states: string[] = [];
    t.onStateChange((s) => states.push(s));
    t.connect();
    expect(FakeSocket.last?.url).toBe('ws://office.test/v1/stream');
    FakeSocket.last!.open();
    await t.ready;
    expect(t.state).toBe('connected');
    expect(states).toEqual(['connected']);
  });

  it('bootstraps capabilities, assets, settings, the default layout and the roster on webviewReady', async () => {
    const { t, got } = setup();
    t.connect();
    FakeSocket.last!.open();
    t.send({ type: 'webviewReady' });
    await flush();
    await flush();
    const types = got.map((m) => m.type);
    expect(types.slice(0, 5)).toEqual(['providerCapabilities', 'characterSpritesLoaded', 'settingsLoaded', 'layoutLoaded', 'existingAgents']);
    expect(got.find((m) => m.type === 'layoutLoaded')).toEqual({ type: 'layoutLoaded', layout: { version: 1, default: true } });
    expect(got.find((m) => m.type === 'settingsLoaded')).toMatchObject({ soundEnabled: false, alwaysShowLabels: true, hooksEnabled: false, hooksInfoShown: true, extensionVersion: '1.4.1', lastSeenVersion: '1.4' });
    expect(got).toContainEqual({ type: 'agentStatus', id: 5, status: 'active' });
  });

  it('prefers the layout and settings saved in Core', async () => {
    const { t, got } = setup({ layout: { version: 1, saved: true }, seats: {}, settings: { alwaysShowLabels: false, soundEnabled: true } });
    t.connect();
    FakeSocket.last!.open();
    t.send({ type: 'webviewReady' });
    await flush();
    await flush();
    expect(got.find((m) => m.type === 'layoutLoaded')).toEqual({ type: 'layoutLoaded', layout: { version: 1, saved: true } });
    expect(got.find((m) => m.type === 'settingsLoaded')).toMatchObject({ alwaysShowLabels: false, soundEnabled: true });
  });

  it('translates stream topics through the adapter', async () => {
    const { t, got } = setup();
    t.connect();
    FakeSocket.last!.open();
    FakeSocket.last!.push('events', [{ id: 'e1', ts: 1, type: 'llm.started', profile: 'researcher', mode: 'kanban', payload: {} }]);
    FakeSocket.last!.push('approvals', [{ id: 'abc234', profile: 'dev', status: 'pending', mode: 'park', tool: 'terminal', task_id: 't' }]);
    FakeSocket.last!.push('agents', []);
    expect(got).toEqual([
      { type: 'agentStatus', id: 2, status: 'active' },
      { type: 'agentToolPermission', id: 5 },
    ]);
  });

  it('persists layout, seats and settings to Core and ignores editor-only messages', async () => {
    const { t, calls } = setup();
    t.connect();
    FakeSocket.last!.open();
    t.send({ type: 'saveLayout', layout: { version: 1, cols: 1, rows: 1, tiles: [0], furniture: [] } });
    t.send({ type: 'saveAgentSeats', seats: { '1': { palette: 0, hueShift: 0, seatId: 'a' } } });
    t.send({ type: 'setAlwaysShowLabels', enabled: false });
    t.send({ type: 'setSoundEnabled', enabled: true });
    t.send({ type: 'launchAgent' });
    t.send({ type: 'focusAgent', id: 1 });
    await flush();
    expect(calls.filter((c) => c.method === 'PUT')).toEqual([
      { url: '/v1/office/state/layout', method: 'PUT', body: { version: 1, cols: 1, rows: 1, tiles: [0], furniture: [] } },
      { url: '/v1/office/state/seats', method: 'PUT', body: { '1': { palette: 0, hueShift: 0, seatId: 'a' } } },
      { url: '/v1/office/state/settings', method: 'PUT', body: { alwaysShowLabels: false } },
      { url: '/v1/office/state/settings', method: 'PUT', body: { alwaysShowLabels: false, soundEnabled: true } },
    ]);
  });

  it('reconnects after a drop and re-sends the roster snapshot', async () => {
    const { t, got } = setup();
    t.connect();
    const first = FakeSocket.last!;
    first.open();
    t.send({ type: 'webviewReady' });
    await flush();
    await flush();
    got.length = 0;
    first.onclose?.();
    expect(t.state).toBe('reconnecting');
    await new Promise((r) => setTimeout(r, 5));
    const second = FakeSocket.last!;
    expect(second).not.toBe(first);
    second.open();
    await flush();
    await flush();
    expect(got.map((m) => m.type)).toContain('existingAgents');
    t.dispose();
    expect(second.closed).toBe(true);
    expect(t.state).toBe('disconnected');
  });
});
```

Agar test reconnect cepat, `HermesTransport` menerima opsi `reconnectDelays?: (attempt: number) => number`. Test memakai `() => 1`: tambahkan `reconnectDelays: () => 1` di `setup()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @aos/office test`
Expected: FAIL.

- [ ] **Step 3: Implement**

Patch **P5** di `vendor/pixel-agents/webview-ui/src/browserMock.ts`: tambahkan di akhir file

```ts
/** Agentic OS: expose the decoded payload so HermesTransport can deliver it (see NOTICE.md P5). */
export function getMockPayload(): MockPayload | null {
  return mockPayload;
}

export type { MockPayload };
```

`apps/office/src/hermes/assets.ts`:

```ts
import type { ServerMessage } from '../../vendor/pixel-agents/core/src/messages.ts';
import type { MockPayload } from '../../vendor/pixel-agents/webview-ui/src/browserMock.ts';

export interface LoadedAssets {
  messages: ServerMessage[];
  defaultLayout: unknown;
}

export function assetMessages(payload: MockPayload): LoadedAssets {
  return {
    messages: [
      { type: 'characterSpritesLoaded', characters: payload.characters },
      { type: 'floorTilesLoaded', sprites: payload.floorSprites },
      { type: 'wallTilesLoaded', sets: payload.wallSets },
      { type: 'carpetTilesLoaded', sets: payload.carpetSets },
      { type: 'furnitureAssetsLoaded', catalog: payload.furnitureCatalog, sprites: payload.furnitureSprites },
    ] as ServerMessage[],
    defaultLayout: payload.layout,
  };
}

export async function loadBrowserAssets(): Promise<LoadedAssets> {
  const mock = await import('../../vendor/pixel-agents/webview-ui/src/browserMock.ts');
  if (!mock.getMockPayload()) await mock.initBrowserMock();
  const payload = mock.getMockPayload();
  if (!payload) throw new Error('office assets failed to load');
  return assetMessages(payload);
}
```

`apps/office/src/hermes/transport.ts`:

```ts
import {
  TRANSPORT_STATE_CONNECTED,
  TRANSPORT_STATE_CONNECTING,
  TRANSPORT_STATE_DISCONNECTED,
  TRANSPORT_STATE_RECONNECTING,
} from '../../vendor/pixel-agents/core/src/constants.ts';
import type { AgentSeatMeta, ClientMessage, ServerMessage } from '../../vendor/pixel-agents/core/src/messages.ts';
import type { MessageTransport, TransportState } from '../../vendor/pixel-agents/core/src/transport.ts';
import { type CoreAgentState, type CoreApproval, type CoreEvent, HermesAdapter } from './adapter.ts';
import { type LoadedAssets, loadBrowserAssets } from './assets.ts';

export interface HermesTransportOptions {
  wsUrl: string;
  fetchImpl?: typeof fetch;
  WebSocketImpl?: typeof WebSocket;
  loadAssets?: () => Promise<LoadedAssets>;
  adapter?: HermesAdapter;
  version?: string;
  reconnectDelays?: (attempt: number) => number;
}

interface OfficeSettings {
  soundEnabled?: boolean;
  alwaysShowLabels?: boolean;
}

export class HermesTransport implements MessageTransport {
  private ws: WebSocket | null = null;
  private handlers: Array<(m: ServerMessage) => void> = [];
  private stateHandlers: Array<(s: TransportState) => void> = [];
  private _state: TransportState = TRANSPORT_STATE_CONNECTING;
  private attempts = 0;
  private disposed = false;
  private booted = false;
  private settings: OfficeSettings = {};
  private resolveReady!: () => void;
  readonly ready: Promise<void>;
  private readonly fetchImpl: typeof fetch;
  private readonly Ws: typeof WebSocket;
  private readonly adapter: HermesAdapter;
  private readonly loadAssets: () => Promise<LoadedAssets>;
  private readonly version: string;
  private readonly delay: (attempt: number) => number;

  constructor(private readonly opts: HermesTransportOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch.bind(globalThis);
    this.Ws = opts.WebSocketImpl ?? WebSocket;
    this.adapter = opts.adapter ?? new HermesAdapter();
    this.loadAssets = opts.loadAssets ?? loadBrowserAssets;
    this.version = opts.version ?? '1.4.1';
    this.delay = opts.reconnectDelays ?? ((n) => Math.min(1000 * 2 ** n, 30_000));
    this.ready = new Promise((resolve) => (this.resolveReady = resolve));
  }

  get state(): TransportState {
    return this._state;
  }

  private setState(next: TransportState): void {
    if (this._state === next) return;
    this._state = next;
    for (const h of this.stateHandlers) h(next);
  }

  private deliver(messages: ServerMessage[]): void {
    for (const m of messages) for (const h of this.handlers) h(m);
  }

  connect(): void {
    if (this.disposed) return;
    const ws = new this.Ws(this.opts.wsUrl);
    this.ws = ws;
    ws.onopen = () => {
      const reconnect = this.attempts > 0;
      this.attempts = 0;
      this.setState(TRANSPORT_STATE_CONNECTED);
      this.resolveReady();
      if (reconnect && this.booted) void this.sendRoster();
    };
    ws.onmessage = (e: MessageEvent) => {
      try {
        const { topic, data } = JSON.parse(String(e.data)) as { topic: string; data: unknown };
        if (topic === 'events' && Array.isArray(data)) this.deliver(this.adapter.onEvents(data as CoreEvent[]));
        if (topic === 'approvals' && Array.isArray(data)) this.deliver(this.adapter.onApprovals(data as CoreApproval[]));
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (this.disposed) return;
      this.setState(TRANSPORT_STATE_RECONNECTING);
      const wait = this.delay(this.attempts);
      this.attempts += 1;
      setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => {};
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await this.fetchImpl(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  private put(key: string, value: unknown): void {
    void this.fetchImpl(`/v1/office/state/${key}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(value),
    }).catch(() => undefined);
  }

  private async sendRoster(seats?: Record<string, AgentSeatMeta>): Promise<void> {
    const [agents, approvals, state] = await Promise.all([
      this.getJson<CoreAgentState[]>('/v1/agents'),
      this.getJson<CoreApproval[]>('/v1/approvals?status=pending'),
      seats ? Promise.resolve({ seats }) : this.getJson<{ seats: Record<string, AgentSeatMeta> }>('/v1/office/state'),
    ]);
    this.deliver(this.adapter.snapshot(agents, approvals, state.seats ?? {}));
  }

  private async bootstrap(): Promise<void> {
    this.deliver([this.adapter.capabilities()]);
    const assets = await this.loadAssets();
    this.deliver(assets.messages);
    const state = await this.getJson<{ layout: unknown; seats: Record<string, AgentSeatMeta>; settings: OfficeSettings }>('/v1/office/state');
    this.settings = state.settings ?? {};
    const lastSeen = this.version.split('.').slice(0, 2).join('.');
    this.deliver([
      {
        type: 'settingsLoaded',
        soundEnabled: this.settings.soundEnabled ?? false,
        alwaysShowLabels: this.settings.alwaysShowLabels ?? true,
        lastSeenVersion: lastSeen,
        extensionVersion: this.version,
        watchAllSessions: false,
        ghostHeadlessAgents: false,
        hooksEnabled: false,
        hooksInfoShown: true,
        externalAssetDirectories: [],
        showAreas: false,
      } as ServerMessage,
      { type: 'layoutLoaded', layout: (state.layout ?? assets.defaultLayout) as Record<string, unknown> | null },
    ]);
    await this.sendRoster(state.seats ?? {});
    this.booted = true;
  }

  send(message: ClientMessage): void {
    switch (message.type) {
      case 'webviewReady':
        void this.bootstrap().catch((err: unknown) => console.error('[office] bootstrap failed', err));
        break;
      case 'saveLayout':
        this.put('layout', message.layout);
        break;
      case 'saveAgentSeats':
        this.put('seats', message.seats);
        break;
      case 'setAlwaysShowLabels':
        this.settings = { ...this.settings, alwaysShowLabels: message.enabled };
        this.put('settings', this.settings);
        break;
      case 'setSoundEnabled':
        this.settings = { ...this.settings, soundEnabled: message.enabled };
        this.put('settings', this.settings);
        break;
      default:
        break; // editor/VS Code-only messages have no Agentic OS meaning yet (chat dock = M5)
    }
  }

  onMessage(handler: (m: ServerMessage) => void): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  onStateChange(handler: (s: TransportState) => void): () => void {
    this.stateHandlers.push(handler);
    return () => {
      this.stateHandlers = this.stateHandlers.filter((h) => h !== handler);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.ws?.close();
    this.ws = null;
    this.handlers = [];
    this.setState(TRANSPORT_STATE_DISCONNECTED);
    this.stateHandlers = [];
  }
}

export function createHermesTransport(): HermesTransport {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const transport = new HermesTransport({ wsUrl: `${protocol}//${window.location.host}/v1/stream` });
  transport.connect();
  return transport;
}
```

Bila `SettingsLoaded` vendor tidak punya field `showAreas`, cast `as ServerMessage` di atas menutup perbedaan kecil itu. Pastikan field wajib upstream (§ messages.ts `SettingsLoaded`) semuanya terisi.

Patch **P2** `vendor/pixel-agents/webview-ui/src/transport/index.ts`: ganti seluruh isi menjadi

```ts
import { createHermesTransport } from '../../../../../src/hermes/transport.ts';
import { isBrowserRuntime } from '../runtime.js';
import { PostMessageTransport } from './postMessageTransport.js';
import type { MessageTransport } from './types.js';

// Agentic OS (NOTICE.md P2): the browser office talks to OS Core through HermesTransport.
function createTransport(): MessageTransport {
  return isBrowserRuntime ? createHermesTransport() : new PostMessageTransport();
}

/** Singleton transport instance. Import this everywhere instead of vscodeApi. */
export const transport: MessageTransport = createTransport();
export type { MessageTransport } from './types.js';
```

Patch **P3** `vendor/pixel-agents/webview-ui/src/main.tsx`: blok `if (isBrowserRuntime && import.meta.env.DEV) { … }` menjadi `if (isBrowserRuntime) { … }`, beserta komentarnya: "Agentic OS (NOTICE P3): decode office assets in every browser build".

Patch **P4** `vendor/pixel-agents/webview-ui/src/App.tsx`: hapus `useEffect` pertama di `App()` yang memanggil `dispatchMockMessages()`, beserta komentarnya. Ganti dengan komentar satu baris: `// Agentic OS (NOTICE P4): assets are delivered by HermesTransport.`

- [ ] **Step 4: Run tests, typecheck, build**

Run:
- `pnpm -F @aos/office test`
- `pnpm -F @aos/office typecheck`
- `pnpm -F @aos/office build`

Expected: PASS, dan build menghasilkan `apps/office/dist`.

- [ ] **Step 5: Commit**

```bash
git add apps/office
git commit -m "feat(office): HermesTransport feeds the vendored office from OS Core" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `pnpm aos office` — buka kantor tanpa mencetak token

**Files:**
- Create: `packages/setup/src/office.ts`
- Modify: `packages/setup/src/cli.ts`
- Test: `packages/setup/test/office.test.ts`

**Interfaces:**
- Produces:
  - `officeLoginUrl(coreUrl, token) -> string`.
  - `officePublicUrl(coreUrl) -> string`.
  - `openInBrowser(url, exec)`: Windows `cmd /c start "" <url>`.
  - Perintah `pnpm aos office`: membuka URL login, lalu mencetak `Office dibuka di browser: <coreUrl>/office/` (tanpa token).

- [ ] **Step 1: Write the failing test** — `packages/setup/test/office.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Exec } from '../src/exec.js';
import { officeLoginUrl, officePublicUrl, openInBrowser } from '../src/office.js';

describe('office helpers', () => {
  it('builds the login and public URLs', () => {
    expect(officeLoginUrl('http://127.0.0.1:7400/', 'a b&c')).toBe('http://127.0.0.1:7400/office/login?token=a%20b%26c');
    expect(officePublicUrl('http://127.0.0.1:7400')).toBe('http://127.0.0.1:7400/office/');
  });

  it('opens the browser through cmd start with an empty window title', async () => {
    const calls: string[][] = [];
    const exec: Exec = async (cmd, args) => (calls.push([cmd, ...args]), { code: 0, stdout: '', stderr: '' });
    await openInBrowser('http://x/office/login?token=t', exec);
    expect(calls).toEqual([['cmd', '/c', 'start', '""', 'http://x/office/login?token=t']]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -F @aos/setup test`
Expected: FAIL.

- [ ] **Step 3: Implement** `packages/setup/src/office.ts`:

```ts
import type { Exec } from './exec.js';

const base = (coreUrl: string) => coreUrl.replace(/\/+$/, '');

export function officeLoginUrl(coreUrl: string, token: string): string {
  return `${base(coreUrl)}/office/login?token=${encodeURIComponent(token)}`;
}

export function officePublicUrl(coreUrl: string): string {
  return `${base(coreUrl)}/office/`;
}

export async function openInBrowser(url: string, exec: Exec): Promise<void> {
  const r = await exec('cmd', ['/c', 'start', '""', url], { timeoutMs: 30_000 });
  if (r.code !== 0) throw new Error(`could not open the browser (exit ${r.code})`);
}
```

Di `cli.ts`:
- Import helper-nya.
- Tambah `case 'office'` sebelum `default`:

```ts
    case 'office': {
      await openInBrowser(officeLoginUrl(coreUrl, required('AOS_UI_TOKEN')), realExec);
      console.log(`Office dibuka di browser: ${officePublicUrl(coreUrl)}`);
      return 0;
    }
```

- Perbarui pesan usage menjadi `<apply-profiles|doctor|smoke-kanban|smoke-chief|office>`.

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm -r test` dan `pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/setup
git commit -m "feat(setup): pnpm aos office opens the office with a cookie login, never printing the token" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verifikasi di mesin + dokumentasi

**Files:**
- Modify: `docs/runbook.md`, `docs/PRD-Agentic-OS.md`
- Create (bila diperlukan): `.claude/launch.json` (konfigurasi preview Vite `office` untuk verifikasi)

- [ ] **Step 1: Siap merge.**

Run:
- `pnpm -r test`
- `pnpm -r typecheck`
- `pnpm office:build`
- `py -3 -m pytest packages tests/redteam -q`

Semua harus hijau.

- [ ] **Step 2: Restart Core (izin owner)** agar memuat rute baru.
  1. Matikan pemilik port 7400.
  2. `explorer.exe "<shell:startup>\AgenticOS_Core.vbs"`.
  3. `GET /v1/health` → `{ok:true}`.
  4. Cek induk proses: tidak di bawah shell otomasi.

- [ ] **Step 3: Verifikasi visual lewat Vite dev** (token disisipkan proxy, tidak lewat browser).
  1. `.claude/launch.json` dengan konfigurasi `{"name":"office","runtimeExecutable":"pnpm","runtimeArgs":["-F","@aos/office","dev"],"port":5173}`, lalu `preview_start office`.
  2. Screenshot kantor: 5 karakter berlabel `chief…dev`, area kerja, pojok pantry/lounge, indikator koneksi "connected".
  3. **V1 aktivitas**: `hermes -p researcher chat -q "baca file README.md di workspace lalu ringkas"` dari folder scratch berisi README. Harapan: karakter researcher duduk, berlabel "Membaca README.md" (animasi membaca), lalu gelembung ✓ di akhir. Screenshot.
  4. **V2 izin**: kartu `dev` "jalankan `git push origin main`" (seperti uji M3 L2). Harapan: gelembung "…" pada dev selama approval `pending`, tetap ada setelah run berhenti. Owner menolak/menyetujui lewat chief, lalu gelembung hilang. Screenshot sebelum dan sesudah.
  5. **V3 layout editor**: buka mode Layout, pindahkan satu tanaman, Save. Lalu `GET /v1/office/state` (via Core dengan token di sisi server, misalnya `node` + `.env.local`) memuat layout baru; reload halaman → perubahan bertahan. Pilih karakter dan pindahkan ke kursi lain → `seats` tersimpan dan bertahan setelah reload.
  6. **V4 reconnect**: matikan Core sebentar → indikator koneksi "reconnecting" → Core hidup lagi (via `explorer.exe`) → kembali "connected" dan roster tetap.

- [ ] **Step 4: Verifikasi prod untuk owner.** Owner menjalankan `pnpm aos office` → browser terbuka di `http://127.0.0.1:7400/office/` (cookie login), kantor tampil dan bergerak. Cek bahwa `/office/` tanpa cookie tetap memuat halaman, tetapi stream/REST mengembalikan 401 (indikator tidak terhubung).

- [ ] **Step 5: Dokumentasi.**
  - **`docs/runbook.md`:**
    - §2 diagram: kantor (browser) ↔ Core `/office/` + `/v1/stream` (cookie `aos_ui`).
    - §3 subsection "Pixel office":
      - Buka lewat `pnpm aos office`; mode dev lewat `pnpm office:dev` (http://127.0.0.1:5173, proxy menyisipkan token).
      - Build lewat `pnpm office:build`.
      - Layout/kursi/setting tersimpan di tabel `office_state` `core.db`.
      - Reset layout: `DELETE` baris `layout`, atau lewat editor.
      - Lokasi vendor dan cara upgrade: clone commit baru, terapkan ulang patch P1–P5 dari NOTICE.
    - Tabel pemetaan state M4.
    - §4 keterbatasan: `stuck` memakai gelembung "…"; offline per agent belum ada; meja kosong tanpa label; tombol Export/Import layout bawaan belum berfungsi; chat/dock/HUD menyusul M5.
    - §5 "Bukti exit M4".
  - **`docs/PRD-Agentic-OS.md`:**
    - §5.5.1: vendor di `apps/office/vendor/pixel-agents` (commit `3537e14`) + `HermesTransport`; asset di-decode di browser; sumber adapter = WS Core (`tui_gateway` di M5).
    - §5.5.3: kolom "M4 terpasang".
    - §5.4.2 rute `/v1/office/*`, `/office/login`, `/office/*`.
    - §5.4.3: cookie httpOnly terpasang.
    - §11: struktur `apps/office`.
    - §13: M4 ✅ + bukti.
    - §16: item yang ditunda (gelembung stuck, offline per agent, label meja kosong).

- [ ] **Step 6: Commit docs**

```bash
git add docs/runbook.md docs/PRD-Agentic-OS.md .claude/launch.json
git commit -m "docs: record M4 pixel office verification in runbook and PRD" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Self-review

**Cakupan PRD §13-M4:**
- Vendor Pixel Agents: Task 1.
- HermesEventAdapter: Task 3 (adapter) dan Task 4 (transport).
- Pemetaan state §5.5.3: Task 3; perkiraan dicatat di tabel di atas.
- Layout kantor 5 meja + meja kosong: layout bawaan upstream punya ±8 kursi kerja + pantry.
- Exit "karakter mencerminkan state nyata": Task 6 V1, V2, V4.
- Exit "layout editor tetap berfungsi": Task 6 V3.

**Keamanan (§8.1, akses UI tanpa izin):**
- Token tidak pernah ada di JavaScript atau URL halaman (cookie httpOnly / proxy dev).
- Core tetap hanya di `127.0.0.1`.
- File statis aman dari traversal (test di Task 2).

**Konsistensi tipe:**
- Bentuk `CoreEvent` / `CoreApproval` / `CoreAgentState` = payload M2/M3.
- `SeatAssignment` Core = `SaveAgentSeats.seats` vendor.
- Kunci `office_state` (`layout`, `seats`, `settings`) dipakai sama oleh Task 2 dan Task 4.
- Id agent 1–5 dipakai sama di labels, adapter, dan transport.
