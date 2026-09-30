# Agentic AI OS — Log Keputusan Grilling

Bahan mentah untuk PRD. Diperbarui setiap kali satu keputusan dikunci.

## Komponen dasar
- **Hermes Agent** (Nous Research) — agent core: memory, skills, multi-profile, gateway, cron, kanban.
- **9Router** — gateway OpenAI-compatible (`http://localhost:20128/v1`), fallback/combo, quota tracking.
- **Pixel Agents** (MIT, React 19 + Vite + Canvas 2D) — renderer kantor pixel + layout editor.

## Keputusan terkunci

| # | Topik | Keputusan |
|---|-------|-----------|
| 1 | Target user | Personal, self-hosted, single user |
| 2 | Use case | Kantor AI multi-role; vertikal: PA harian, Content & Social, Coding agent |
| 3 | Fase | F1 = Core (orchestrator, kanban, pixel office, 9Router) + Personal Assistant. F2 = Content & Social (integrasi postit). F3 = Coding agent |
| 4 | Integrasi Hermes | Upstream, tidak di-fork. Plugin `os-bridge` + service OS Core. 1 agent = 1 Hermes profile. Kanban bawaan Hermes = task board & dispatcher |
| 5 | Otonomi | Berbasis risiko: internal/read-only jalan otomatis; aksi eksternal/irreversible wajib approval (Telegram inline button / pixel UI) |
| 6 | Sumber model | API key berbayar, langganan konsumen, provider murah/gratis, model lokal. Langganan konsumen hanya untuk sesi interaktif (risiko ToS) |
| 7 | Routing | 3 combo 9Router: `os-brain` (planning, model terkuat), `os-worker` (murah), `os-private` (lokal dulu, fallback API zero-retention). Profile hanya menyebut nama combo |
| 8 | Budget | Tanpa limit keras — monitoring + notifikasi saja. Default tetap: circuit breaker runaway loop (mis. >10× median token per kartu → `blocked`) |
| 9 | Deployment | F1: semua di PC Windows native (Hermes Desktop runtime, gateway via Scheduled Task, 9Router, OS Core, UI di localhost). Data di `%LOCALAPPDATA%\hermes` persisten. Known limitation: agent "tidur" saat PC mati/sleep. F2 opsional: pindah backend ke VPS/mini-PC (copy `HERMES_HOME`) |
| 10 | UI | Pixel office = UI UTAMA termasuk chat. Client ke `hermes serve` via `tui_gateway` JSON-RPC/WebSocket (reuse `apps/shared`). Pin versi Hermes + contract test (protokol belum dinyatakan stabil) |
| 11 | Basis visual | Vendor Pixel Agents (engine, state machine karakter, layout editor, asset). Buang adapter VS Code/JSONL, ganti adapter event Hermes. Catatan: sprite karakter berbasis asset pack pihak ketiga — cek lisensi jika dikomersialkan |
| 12 | Stack | pnpm TS monorepo: `apps/office` (React 19 + Vite), `apps/core` (Node + Fastify + WS + SQLite/Drizzle: event log, approval, cost ledger, snapshot kanban read-only), `packages/hermes-os-bridge` (plugin Python). Tanpa Postgres/Redis di F1 |
| 13 | Approval | Enforcement di hook `pre_tool_call` + policy file. Chat interaktif: tahan & tunggu (timeout 10 menit → auto-deny). Kanban background: tolak `PENDING_APPROVAL` → kartu `blocked` → setelah approve, kembali `ready` dengan token approval sekali pakai. Biaya dibaca via `post_llm_call` |
| 14 | Scope PA F1 | Telegram (kanal utama), briefing pagi via cron, reminder + capture tugas ke kanban. Google Calendar/Gmail ditunda |
| 15 | WhatsApp | Ditunda ke F2 (Baileys nomor khusus vs Cloud API diputuskan saat migrasi VPS) |
| 16 | Roster | 5 agent aktif di F1: `chief`, `researcher`, `secretary`, `content`, `dev`. Telegram hanya ke `chief`; di office semua bisa di-chat langsung. `content` = riset + draft saja di F1 |
| 17 | Dev sandbox | Terminal backend Docker: mount hanya workspace per-kartu; tanpa akses HERMES_HOME/.env/kredensial. `git push`, global install, network di luar registry, akses di luar workspace → approval |
| 18 | Layout UI | Kanvas + dock: kanvas selalu tampil, dock kanan kontekstual (chat + kartu + log tool), HUD bawah (approval, biaya, laci kanban). Ctrl+K = chat ke chief. Desktop-first |
| 19 | postit | App terpisah; ekspos MCP server (`list_channels`, `create_draft`, `schedule_post`, `get_analytics`) ke profile `content` (F2). AI postit diarahkan ke 9Router |
| 20 | Sukses F1 | Gate rilis WAJIB: keandalan (briefing ≥95% saat PC menyala) + keamanan (0 aksi berisiko tanpa approval, red-team). Lainnya = target dipantau |
| 21 | Timeline | Santai, tanpa deadline; PRD dipecah per milestone tanpa tanggal |
| 22 | Nama | Placeholder "Agentic OS"; nama final diputuskan nanti |

Status: grilling selesai → PRD di `docs/PRD-Agentic-OS.md`.
