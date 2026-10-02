# Runbook — Agentic OS

Mesin: PC Windows 11 owner. Diverifikasi 2026-10-01/02 (M1 + M2) dengan Hermes Agent v0.21.5 (`e85706c`) dan 9Router 0.5.86.

## 1. Jawaban [VERIFY]

Status: `✅ terverifikasi` (dicoba di mesin ini) · `📄 dari docs/source` · `⏳ belum`.

| ID | Pertanyaan | Jawaban | Status | Bukti / cara cek |
|---|---|---|---|---|
| V1 | Key config provider custom per profile | `model: {provider: custom, base_url: http://127.0.0.1:20128/v1, default: <model 9Router>, key_env: OPENAI_API_KEY}`; `key_env` diterima. Nama model per tier diatur lewat `AOS_TIER_MODEL_*` di `.env.local` (sementara semua `COMBO-SS`). | ✅ | `pnpm aos apply-profiles`; kelima profile membalas "pong" lewat 9Router |
| V2 | Nama tool aktual untuk policy | Core: `terminal`, `process_manage`, `read_file`, `write_file`, `patch`, `search_files`, `web_search`, `web_extract`, `execute_code`, `delegate_task`, `cronjob_manage`, `memory`, `browser_*`, `computer_use`, `kanban_*`. **Tidak ada tool `send_message` yang bisa dipanggil agent** — pengiriman keluar terjadi lewat delivery gateway/cron. Plugin Agentic OS: `office_create_task`, `office_list_tasks`. | 📄 dari source | `hermes-agent/toolsets.py` (`_HERMES_CORE_TOOLS`) + probe (`web_search`, `terminal`, `write_file`) |
| V3 | CLI/API mutasi kanban | `hermes kanban create "<title>" --assignee <p> --body … --workspace dir:<abs>`, `list`, `show <id>`, `assign`, `complete`, `block`, `unblock`, `archive`. `show` tidak punya `--json` (output teks `status: …`). | ✅ | `pnpm aos smoke-kanban` PASS (`t_c6d83f9d`) |
| V4 | Path SQLite kanban & aman dibaca read-only | `<HERMES_HOME>\kanban.db` (board default), mode **WAL**; aman dibuka `readOnly` saat gateway jalan. Tabel utama: `tasks`, `task_runs`, `task_events`, `task_comments`, `task_links`, `task_attachments`. | ✅ | `node:sqlite` readOnly saat dispatcher aktif |
| V5 | `hermes serve` & `apps/shared` | `hermes serve` = gateway JSON-RPC/WebSocket, default **127.0.0.1:9119**; bind publik selalu butuh auth. `@hermes/shared` = paket **private** yang mengekspor source TS langsung (`./src/index.ts`) → di M5 di-vendor/di-link sebagai path, bukan install npm. | ✅ | `hermes serve --help`; `apps/shared/package.json` |
| V6 | Payload hook & cara blokir | Semua hook memakai **keyword args**. `pre_tool_call`: `tool_name, args{…}, task_id, session_id, tool_call_id, turn_id, api_request_id`. `post_tool_call`: + `result, duration_ms, status, error_type, error_message`. `on_session_start`: `session_id, model, platform`. **`post_llm_call` tidak membawa token usage** (hanya teks & history). `pre_auxiliary_call`: `aux_task, model, provider, base_url, approx_input_tokens…`. Blokir: return `{'action':'block','message':…}`. Penanda kanban: env `HERMES_KANBAN_TASK`. **Penanda cron:** sesi cron membawa `platform = "cron"` (event session/llm `mode = cron`) dan `session_id = cron_<job_id>_<YYYYMMDD_HHMMSS>`. | ✅ | plugin `aos-probe` (2026-10-01); sesi cron lewat os-bridge (M2) |
| V7 | Sandbox Docker di Windows | Image `nousresearch/hermes-sandbox:desktop`. Profile memakai `terminal.container_persistent: true` + `docker_persist_across_processes: false` → **tiap proses worker yang di-spawn dispatcher mendapat container sendiri** dengan workspace kartu ter-mount di `/workspace` (rw); dua kartu berurutan masing-masing menyimpan `notes.md` sendiri, dan tidak ada container `hermes-*` tersisa setelah run. `docker_mount_cwd_to_workspace: true` me-mount **cwd** ke `/workspace`. Worker (`researcher/secretary/content/dev`) mount = workspace kartu; `chief` tidak me-mount (gateway cwd = folder berisi `.env`). Network: `none` kecuali `dev` (bridge). `.env` profile tidak di-mount. | ✅ | `docker inspect` container `hermes-*` selama run; dua kartu berurutan (M2) |
| V8 | Usage 9Router untuk rekonsiliasi | Tidak ada REST API usage. DB: `%APPDATA%\9router\db\data.sqlite` (WAL). Tabel `usageHistory`: `timestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, status, tokens, meta`; `usageDaily` agregat. **Kolom `apiKey` berisi key mentah** → Core harus mencocokkan via hash/suffix dan tidak pernah menampilkannya. Ini juga sumber token usage karena V6. **Implementasi M2:** OS Core menyinkronkan `usageHistory` per key (dibuka read-only, tiap 30 dtk) ke ledger `core.db`. Karena owner memilih **tidak** membuat key per profile, seluruh usage diatribusikan ke profile `shared` dan `byTask` kosong (lihat §3 "Atribusi biaya"). | ✅ | `node:sqlite` readOnly; `GET /v1/costs` |
| V9 | Cron job yang terlewat | Satu run susulan untuk beberapa slot yang terlewat (diuji untuk jeda ±13 menit; jeda panjang belum diuji) (`cron.catch_up_missed` default on). Uji: gateway mati 09:44–09:57 melewati slot 09:49 & 09:54 → tepat 1 run pada 09:57:40. Penanda konteks cron untuk os-bridge (PRD §5.3.2) **sudah ditemukan**: lihat V6 (`platform = "cron"`, `session_id = cron_<job_id>_<stamp>`). | ✅ | job uji `catchup-test` (dihapus setelah uji) |
| V10 | Nama produk final | Keputusan owner, bukan blocker M1 | — | — |
| V11 | Lokasi `HERMES_HOME` | Instalasi owner: `%LOCALAPPDATA%\hermes`. **Agentic OS memakai folder terpisah `D:\agentic-os\hermes-home`** (`AOS_HERMES_HOME`). Runtime (venv) dipasang ulang di folder itu (~2,5 GB); **source tetap bersama** di `%LOCALAPPDATA%\hermes\hermes-agent`. | ✅ | `hermes --version` → `Install directory` |
| V12 | Panggilan auxiliary lewat 9Router | Ya: `title_generation`, compression, vision auto-detect memakai provider utama `custom` (`COMBO-SS`) di `http://127.0.0.1:20128/v1`. | ✅ | log `agent.auxiliary_client` |
| V13 | Web search untuk `researcher` | Default **Exa keyless** (tanpa API key) berfungsi. | ✅ | log `plugins.web.exa.provider` |
| V14 | Tool kanban untuk `chief` | Tool `kanban_*` Hermes **hanya aktif untuk worker yang di-spawn dispatcher** (`HERMES_KANBAN_TASK`). `chief` memakai plugin `aos-office-tools` (`office_create_task` / `office_list_tasks`). | ✅ | `pnpm aos smoke-chief` PASS (`t_6508a3ca`) |
| V15 | Pin versi | Pin = commit source bersama di `infra/hermes.lock`; `doctor` membaca `Install directory` dari `hermes --version`. **Update Hermes Desktop menggeser commit ini** → `doctor` FAIL `hermes-pin` = sinyal untuk uji ulang lalu bump lock. Jangan jalankan `hermes update` dari folder Agentic OS. | ✅ | `pnpm aos doctor` |
| V16 | Lokasi plugin | **Per profile**: `<HERMES_HOME>\profiles\<profile>\plugins\<nama>\` (bukan `<HERMES_HOME>\plugins`). Aktifkan: `hermes -p <profile> plugins enable <nama>`. Tool dimuat lazy lewat tool search — sebut nama tool secara eksplisit di persona. | ✅ | `aos-office-tools` aktif untuk `chief` |

## 2. Arsitektur yang terpasang (M1 + M2)

```
Telegram ──► host gateway Agentic OS (Hermes_Gateway_787a7c01, HERMES_HOME=D:\agentic-os\hermes-home)
               ├─ telegram → profile chief (plugin aos-office-tools)
               ├─ kanban dispatcher (kanban.db di HERMES_HOME, board default; config ROOT: tick 60 dtk, max 2 running)
               └─ cron (5 profile + default) — chief: morning-briefing 07:00
dispatcher ──► hermes -p <worker> (cwd = workspace kartu) ──► sandbox Docker (satu container per proses worker)
semua LLM ──► 9Router 127.0.0.1:20128/v1 (Require API key ON, key "HERMES") ──► COMBO-SS

plugin os-bridge (di tiap proses Hermes, 5 profile) ──events──► OS Core 127.0.0.1:7400 ──► core.db
                      └─ Core mati → spool lokal, dikirim ulang nanti
OS Core ◄── baca read-only: kanban.db (tiap 2 dtk), 9Router data.sqlite / usageHistory (tiap 30 dtk)
OS Core ──► klien UI/WebSocket (/v1/stream: events, agents, kanban, costs)
```
Gateway & data Hermes lama milik owner (`%LOCALAPPDATA%\hermes`, `Hermes_Gateway`) berjalan berdampingan dan tidak disentuh.

## 3. Prosedur operasi

### Konfigurasi lokal (`.env.local`, tidak di-commit)
`AOS_ROUTER_URL`, `AOS_ROUTER_KEY` (key 9Router "HERMES"), `AOS_TIMEZONE=Asia/Jakarta`, `AOS_HERMES_HOME=D:\agentic-os\hermes-home`, `AOS_TIER_MODEL_OS_BRAIN|OS_WORKER|OS_PRIVATE` (sementara `COMBO-SS`), `AOS_BRIDGE_TOKEN` dan `AOS_UI_TOKEN` (token OS Core; **harus berbeda**), opsional `AOS_ROUTER_KEY_<PROFILE>` (lihat "Atribusi biaya"). Isi key lewat editor atau `Read-Host -AsSecureString` — jangan ditempel di chat.

### Perintah harian
| Tujuan | Perintah |
|---|---|
| Cek kesehatan (semua check harus OK; sejak M2 termasuk `root:model`, `root:dispatcher`, `root:cron-catch-up`, `gateway-running`, dan check OS Core) | `pnpm aos doctor` |
| Terapkan ulang profile setelah ubah `infra/profiles/*` | `pnpm aos apply-profiles` (backup `*.bak-<stamp>` untuk config, .env, SOUL.md) |
| Uji dispatcher | `pnpm aos smoke-kanban` |
| Uji delegasi chief | `pnpm aos smoke-chief` |
| Perintah Hermes untuk Agentic OS | selalu set dulu `$env:HERMES_HOME = "D:\agentic-os\hermes-home"` |

### 9Router
- Autostart: `shell:startup\9router.vbs` dengan `--tray --skip-update --host 127.0.0.1` (launcher duplikat `start_9router.bat` sudah dihapus). Skrip `infra/windows/register-9router-task.ps1` tidak dipakai (alternatif).
- Dashboard: http://127.0.0.1:20128 · **Require API key: ON** (melindungi `/v1/chat/completions`; `GET /v1/models` memang tetap publik). Aplikasi lain (mis. scraper) butuh key sendiri.
- Kalau dashboard "refused to connect": 9Router mati → klik dua kali `9router.vbs`.
- Sisa tugas owner: ganti password dashboard default.

### Gateway Agentic OS
- Satu **host gateway per HERMES_HOME** (Hermes v0.21.5 multiplex): melayani Telegram `chief`, dispatcher kanban, dan cron semua profile.
- Autostart: `shell:startup\Hermes_Gateway_787a7c01.vbs` (fallback Startup folder, tanpa UAC).
- Status / stop: `$env:HERMES_HOME="D:\agentic-os\hermes-home"; hermes gateway status | stop`. Nyalakan dengan klik dua kali `Hermes_Gateway_787a7c01.vbs` (jangan `gateway start` dari shell yang akan ditutup — prosesnya bisa ikut mati).
- Log: `D:\agentic-os\hermes-home\logs\gateway.log`.
- Pengaturan dispatcher & cron ada di config ROOT `D:\agentic-os\hermes-home\config.yaml` (ditulis `apply-profiles`): `kanban.dispatch_in_gateway: true`, interval 60 dtk, `dispatch_profiles` = kelima profile, `max_in_progress: 2`, `failure_limit: 2`; `cron.catch_up_missed: true`; model root → 9Router. `doctor` memeriksanya lewat `root:model`, `root:dispatcher`, `root:cron-catch-up`, dan `gateway-running`.

### OS Core
- Paket `apps/core` (Fastify + WebSocket + better-sqlite3 — sengaja menyimpang dari rencana Drizzle). Mendengarkan **hanya** `127.0.0.1:7400`.
- Data: DB `D:\agentic-os\core\core.db`, log `D:\agentic-os\core\core.log`.
- Start manual: `pnpm -F @aos/core start`. Autostart: `shell:startup\AgenticOS_Core.vbs` (dipasang atas persetujuan owner; menjalankan perintah yang sama).
- Cek: `pnpm aos doctor` (check OS Core) atau `GET http://127.0.0.1:7400/v1/health` (tanpa auth).
- Stop: matikan proses yang mendengarkan port 7400 (cari PID dengan `netstat -ano | findstr :7400`, lalu `Stop-Process -Id <pid>`). Menjalankan ulang: klik dua kali `AgenticOS_Core.vbs`.
- Endpoint:

| Method | Path | Auth | Keterangan |
|---|---|---|---|
| GET | `/v1/health` | tidak ada | status Core |
| POST | `/v1/events` | header `x-aos-bridge-token` | ingest event dari os-bridge |
| GET | `/v1/agents` | UI | roster + state agent |
| GET | `/v1/kanban` | UI | snapshot board |
| GET | `/v1/costs?since=&until=` | UI | ledger biaya (default 24 jam terakhir) |
| WS | `/v1/stream` | UI | topik `events`, `agents`, `kanban`, `costs` |

- Rute UI memakai `Authorization: Bearer <AOS_UI_TOKEN>` atau `?token=`. Token (`AOS_BRIDGE_TOKEN`, `AOS_UI_TOKEN`) ada di `.env.local`, harus berbeda; jangan ditempel di chat atau log.
- Core membaca `kanban.db` (tiap 2 dtk) dan `data.sqlite` 9Router (tiap 30 dtk) secara **read-only**; tidak pernah menulis ke keduanya.

### Bridge (plugin `os-bridge`) & spool
- Dipasang oleh `pnpm aos apply-profiles` di kelima profile: `profiles\<profile>\plugins\os-bridge\` dengan `config.json` (`core_url` + token); `hermes plugins enable` bersifat idempoten.
- Mengirim event `session.started/ended`, `llm.started/finished`, `tool.started/finished` ke OS Core. Tidak pernah memblokir atau melempar error ke agent, dan menyamarkan (redact) rahasia.
- Spool: saat Core mati, event ditulis ke `plugins\os-bridge\spool\<pid>.jsonl` (satu file per proses). File yatim (> 60 dtk) diambil alih dan dikirim ulang oleh sesi berikutnya dari profile yang sama. Hasil uji: Core mati → 4 event ter-spool → terkirim ulang setelah restart, spool kosong.

### Atribusi biaya (per profile / per kartu)
- Saat ini semua usage tercatat sebagai profile `shared` dan `byTask` kosong, karena owner memilih tidak membuat key 9Router per profile. Impor pertama memuat seluruh riwayat key HERMES: 258 panggilan, total ≈ $4,36 (≈ $0,81 dalam 24 jam terakhir).
- Untuk mengaktifkan atribusi per profile/kartu: (1) buat key 9Router `AOS_ROUTER_KEY_<PROFILE>` untuk `aos-chief`, `aos-researcher`, `aos-secretary`, `aos-content`, `aos-dev` di dashboard 9Router; (2) isi lewat `infra/windows/set-local-secrets.ps1`; (3) jalankan `pnpm aos apply-profiles`.

### Kanban & workspace
- Kartu dari `chief` dibuat lewat `office_create_task` dengan workspace permanen `D:\agentic-os\hermes-home\workspaces\<stamp>-<slug>\` (hasil kerja worker tersimpan di sana; di dalam sandbox terlihat sebagai `/workspace`, satu container per proses worker, lihat V7). Plugin kini mengunci `HERMES_HOME` ke home Agentic OS (`AOS_HERMES_HOME`, atau terdeteksi dari lokasi plugin). Kartu smoke sebelumnya ada di `…\profiles\chief\workspaces\`, dibuat sebelum perbaikan ini.
- Kartu yang dibuat manual dengan `hermes kanban create` tanpa `--workspace` memakai workspace *scratch* yang **dihapus saat kartu selesai**.
- Core menampilkan board lewat `GET /v1/kanban` (uji: 9 kartu). Mutasi kartu tetap lewat CLI `hermes kanban …`.

### Cron
- `morning-briefing` (`c7efc0721f0e`): `0 7 * * *`, deliver telegram. Jalankan manual: `hermes -p chief cron run c7efc0721f0e`.
- PC mati/sleep di jam 07:00 → saat gateway menyala lagi, briefing dikirim **satu kali** sebagai susulan (V9).

### Plugin
- `aos-office-tools` → `profiles\chief\plugins\aos-office-tools\` (sumber: `packages/hermes-office-tools/aos-office-tools/`; salin ulang setelah diubah, lalu restart gateway).
- `os-bridge` → `profiles\<profile>\plugins\os-bridge\` di kelima profile, dipasang `pnpm aos apply-profiles` (lihat "Bridge & spool").
- `aos-probe` → `profiles\researcher\plugins\aos-probe\`, **disabled** (hanya untuk investigasi kontrak hook).

### Aturan keamanan operasional
- Jangan memulai sesi interaktif worker (`researcher/secretary/content/dev`) dari folder yang berisi rahasia — cwd di-mount ke sandbox Docker.
- Jangan jalankan `hermes update` dari folder Agentic OS (source dipakai bersama instalasi Hermes owner).
- Pesan `hermes: source-update completion failed … run hermes update` dari runtime Agentic OS: diketahui, tidak memblokir; abaikan sampai upgrade terencana.

## 4. Keterbatasan & catatan yang diketahui

- **Combo sementara**: semua tier → `COMBO-SS` (akun langganan, risiko ToS/limit; `os-private` belum lokal). Ganti lewat `AOS_TIER_MODEL_*` setelah combo `os-*` / API key / Ollama tersedia.
- **PC mati = agent tidur** (gateway, dispatcher, cron berhenti).
- **Biaya**: token usage tidak tersedia di hook `post_llm_call`; M2 memakai `usageHistory` 9Router (disinkronkan Core per key).
- **Dua dispatcher terpisah**: Hermes lama owner punya dispatcher sendiri untuk board-nya; tidak saling mengganggu karena `kanban_home` berbeda.
- **Biaya tercatat sebagai `shared` sampai ada key per profile**: kelima profile memakai SATU key 9Router ("HERMES"), jadi semua usage diatribusikan ke profile `shared` dan `byTask` kosong. Atribusi per profile/kartu aktif setelah key `AOS_ROUTER_KEY_<PROFILE>` dibuat (prosedur di §3 "Atribusi biaya").
- **Mode event `tool.*` tidak konsisten (minor)**: event `tool.*` membawa `mode = interactive`, sedangkan event session/llm pada sesi yang sama membawa platform (`cli`/`cron`), karena hook tool tidak punya field platform. Perbaikan nanti: bridge mengingat platform per `session_id`.
- **Latensi model**: run `researcher` di `COMBO-SS` bisa memakan hingga ±10 menit; timeout `smoke-kanban` cukup ketat, jadi FAIL karena timeout belum tentu berarti dispatcher rusak.
- **Risiko injeksi workspace sampai M3**: `kanban_create` milik worker menerima `workspace_kind`/`workspace_path`, dan cwd worker di-mount read-write ke sandbox Docker. Worker yang terkena prompt injection bisa membuat kartu (mis. untuk `dev`, yang punya network) dengan workspace menunjuk folder sensitif (home Hermes berisi semua `.env`, atau repo berisi `.env.local`). Akan jadi skenario red-team + aturan policy di M3 (deny/approve `kanban_create` dengan workspace di luar root yang diizinkan).

## 5. Bukti exit M1 & M2

### Bukti exit M1

| Kriteria (PRD §13) | Bukti | Status |
|---|---|---|
| `chief` membuat kartu yang dikerjakan `researcher` via dispatcher | `smoke-chief` PASS `t_6508a3ca` (CLI), output `notes.md` tersimpan; uji delegasi via Telegram oleh owner sendiri masih menunggu | ✅ CLI · Telegram menunggu owner |
| Semua panggilan LLM lewat 9Router | `doctor` 26/26 (tanpa key provider langsung di Hermes Agentic OS) + V12 auxiliary | ✅ |
| Daftar VERIFY terjawab | Tabel §1 | ✅ (V10 = keputusan owner) |
| Briefing pagi | `cron run` → owner mengonfirmasi menerima briefing di Telegram (2026-10-01) | ✅ |

### Bukti exit M2

Diuji di mesin owner, 2026-10-01/02. Kriteria PRD §13: event semua mode masuk Core; state agent & biaya terlihat via `/v1/agents` & `/v1/costs`.

| Kriteria | Bukti | Status |
|---|---|---|
| Event mode interaktif masuk Core | Sesi interaktif `researcher` → rantai event lengkap (session, llm, tool) di `core.db` | ✅ |
| Event mode kanban masuk Core dengan `task_id` | `smoke-kanban` `t_388dd80b` → 16 event `mode=kanban` ber-`task_id` | ✅ |
| Event mode cron dapat dikenali | Penanda `platform = "cron"`, `session_id = cron_<job_id>_<stamp>` (V6) | ✅ |
| Bridge tahan Core mati | Core mati → 4 event ter-spool → terkirim ulang setelah restart, spool kosong | ✅ |
| Snapshot kanban | `GET /v1/kanban` mengembalikan 9 kartu | ✅ |
| Stream realtime | Klien WebSocket menerima keempat topik (`events`, `agents`, `kanban`, `costs`) | ✅ |
| Ledger biaya | Impor pertama key HERMES: 258 panggilan, ≈ $4,36 total (≈ $0,81 / 24 jam); atribusi `shared` (key per profile belum dibuat → `byTask` kosong) | ✅ dengan catatan |
| File hasil worker persisten | Dua kartu berurutan masing-masing menyimpan `notes.md`; tidak ada container `hermes-*` tersisa (V7) | ✅ |
| Batas dispatcher & cron berlaku | Config ROOT + check `root:model`, `root:dispatcher`, `root:cron-catch-up`, `gateway-running` di `doctor` | ✅ |
