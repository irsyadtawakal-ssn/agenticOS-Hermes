# Pixel Agents (vendored)

Sumber: https://github.com/pixel-agents-hq/pixel-agents — commit 3537e140c2094761beae748592aeb92ece8edfdd (v1.4.1, 2026-08-15), lisensi MIT (lihat LICENSE).
Disalin: `core/src/**`, `webview-ui/**` (tanpa `test/`). Tidak disalin: adapter VS Code, server, e2e, scripts, `core/asyncapi.yaml`.

Patch Agentic OS (selain ini, file identik dengan upstream):
- P1 `webview-ui/vite.config.ts`: `browserMockAssetsPlugin` di-export agar dipakai `apps/office/vite.config.ts`.
- P2 `webview-ui/src/transport/index.ts`: runtime browser memakai `createHermesTransport()` (Agentic OS) alih-alih WebSocket ke server Pixel Agents.
- P3 `webview-ui/src/main.tsx`: `initBrowserMock()` dijalankan di semua build browser (bukan hanya dev) agar asset di-decode di browser.
- P4 `webview-ui/src/App.tsx`: efek `dispatchMockMessages()` dihapus (beserta import `isBrowserRuntime` yang jadi tak terpakai); asset dikirim `HermesTransport`.
- P5 `webview-ui/src/browserMock.ts`: tambah `export function getMockPayload()` dan `export type { MockPayload }`.
- P6 `webview-ui/src/main.tsx`: merender `AosShell` (`apps/office/src/shell`) yang membungkus `App` dengan dock, HUD, dan laci kanban.
- P7 `webview-ui/src/index.css`: `@source "../../../../src"` agar Tailwind memindai kode Agentic OS di luar root Vite.

Upgrade: clone commit baru upstream, salin ulang `core/src` dan `webview-ui` (tanpa `test/`), lalu terapkan ulang P1–P5.
