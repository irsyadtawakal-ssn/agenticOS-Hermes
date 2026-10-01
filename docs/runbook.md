# Runbook — Agentic OS

Mesin: PC Windows 11 owner. Diverifikasi 2026-10-01 dengan Hermes Agent v0.21.5 (`e85706c`) dan 9Router 0.5.86.

## 1. Jawaban [VERIFY]

Status: `✅ terverifikasi` (dicoba di mesin ini) · `📄 dari docs/source` · `⏳ belum`.

| ID | Pertanyaan | Jawaban | Status | Bukti / cara cek |
|---|---|---|---|---|
| V1 | Key config provider custom per profile | `model: {provider: custom, base_url: http://127.0.0.1:20128/v1, default: <model 9Router>, key_env: OPENAI_API_KEY}`; `key_env` diterima. Nama model per tier diatur lewat `AOS_TIER_MODEL_*` di `.env.local` (sementara semua `COMBO-SS`). | ✅ | `pnpm aos apply-profiles`; kelima profile membalas "pong" lewat 9Router |
| V2 | Nama tool aktual untuk policy | Core: `terminal`, `process_manage`, `read_file`, `write_file`, `patch`, `search_files`, `web_search`, `web_extract`, `execute_code`, `delegate_task`, `cronjob_manage`, `memory`, `browser_*`, `computer_use`, `kanban_*`. **Tidak ada tool `send_message` yang bisa dipanggil agent** — pengiriman keluar terjadi lewat delivery gateway/cron. Plugin Agentic OS: `office_create_task`, `office_list_tasks`. | 📄 dari source | `hermes-agent/toolsets.py` (`_HERMES_CORE_TOOLS`) + probe (`web_search`, `terminal`, `write_file`) |
| V3 | CLI/API mutasi kanban | `hermes kanban create "<title>" --assignee <p> --body … --workspace dir:<abs>`, `list`, `show <id>`, `assign`, `complete`, `block`, `unblock`, `archive`. `show` tidak punya `--json` (output teks `status: …`). | ✅ | `pnpm aos smoke-kanban` PASS (`t_c6d83f9d`) |
| V4 | Path SQLite kanban & aman dibaca read-only | `<HERMES_HOME>\kanban.db` (board default), mode **WAL**; aman dibuka `readOnly` saat gateway jalan. Tabel utama: `tasks`, `task_runs`, `task_events`, `task_comments`, `task_links`, `task_attachments`. | ✅ | `node:sqlite` readOnly saat dispatcher aktif |
| V5 | `hermes serve` & `apps/shared` | `hermes serve` = gateway JSON-RPC/WebSocket, default **127.0.0.1:9119**; bind publik selalu butuh auth. `@hermes/shared` = paket **private** yang mengekspor source TS langsung (`./src/index.ts`) → di M5 di-vendor/di-link sebagai path, bukan install npm. | ✅ | `hermes serve --help`; `apps/shared/package.json` |
| V6 | Payload hook & cara blokir | Semua hook memakai **keyword args**. `pre_tool_call`: `tool_name, args{…}, task_id, session_id, tool_call_id, turn_id, api_request_id`. `post_tool_call`: + `result, duration_ms, status, error_type, error_message`. `on_session_start`: `session_id, model, platform`. **`post_llm_call` tidak membawa token usage** (hanya teks & history). `pre_auxiliary_call`: `aux_task, model, provider, base_url, approx_input_tokens…`. Blokir: return `{'action':'block','message':…}`. Penanda kanban: env `HERMES_KANBAN_TASK`. | ✅ | plugin `aos-probe` (2026-10-01) |
| V7 | Sandbox Docker di Windows | Image `nousresearch/hermes-sandbox:desktop`; container per task-id (label `hermes-task-id`), persisten. `docker_mount_cwd_to_workspace: true` me-mount **cwd** ke `/workspace` (rw). Worker (`researcher/secretary/content/dev`) mount = workspace kartu; `chief` tidak me-mount (gateway cwd = folder berisi `.env`). Network: `none` kecuali `dev` (bridge). `.env` profile tidak di-mount. | ✅ | `docker inspect` container `hermes-*` |
| V8 | Usage 9Router untuk rekonsiliasi | Tidak ada REST API usage. DB: `%APPDATA%\9router\db\data.sqlite` (WAL). Tabel `usageHistory`: `timestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, status, tokens, meta`; `usageDaily` agregat. **Kolom `apiKey` berisi key mentah** → Core harus mencocokkan via hash/suffix dan tidak pernah menampilkannya. Ini juga sumber token usage karena V6. | ✅ | `node:sqlite` readOnly |
| V9 | Cron job yang terlewat | Satu run susulan untuk beberapa slot yang terlewat (diuji untuk jeda ±13 menit; jeda panjang belum diuji) (`cron.catch_up_missed` default on). Uji: gateway mati 09:44–09:57 melewati slot 09:49 & 09:54 → tepat 1 run pada 09:57:40. **Masih terbuka:** penanda konteks cron untuk os-bridge (PRD §5.3.2) — probe tidak menemukan penanda eksplisit di kwargs `on_session_start` (`session_id, model, platform`). | ✅ | job uji `catchup-test` (dihapus setelah uji) |
| V10 | Nama produk final | Keputusan owner, bukan blocker M1 | — | — |
| V11 | Lokasi `HERMES_HOME` | Instalasi owner: `%LOCALAPPDATA%\hermes`. **Agentic OS memakai folder terpisah `D:\agentic-os\hermes-home`** (`AOS_HERMES_HOME`). Runtime (venv) dipasang ulang di folder itu (~2,5 GB); **source tetap bersama** di `%LOCALAPPDATA%\hermes\hermes-agent`. | ✅ | `hermes --version` → `Install directory` |
| V12 | Panggilan auxiliary lewat 9Router | Ya: `title_generation`, compression, vision auto-detect memakai provider utama `custom` (`COMBO-SS`) di `http://127.0.0.1:20128/v1`. | ✅ | log `agent.auxiliary_client` |
| V13 | Web search untuk `researcher` | Default **Exa keyless** (tanpa API key) berfungsi. | ✅ | log `plugins.web.exa.provider` |
| V14 | Tool kanban untuk `chief` | Tool `kanban_*` Hermes **hanya aktif untuk worker yang di-spawn dispatcher** (`HERMES_KANBAN_TASK`). `chief` memakai plugin `aos-office-tools` (`office_create_task` / `office_list_tasks`). | ✅ | `pnpm aos smoke-chief` PASS (`t_6508a3ca`) |
| V15 | Pin versi | Pin = commit source bersama di `infra/hermes.lock`; `doctor` membaca `Install directory` dari `hermes --version`. **Update Hermes Desktop menggeser commit ini** → `doctor` FAIL `hermes-pin` = sinyal untuk uji ulang lalu bump lock. Jangan jalankan `hermes update` dari folder Agentic OS. | ✅ | `pnpm aos doctor` |
| V16 | Lokasi plugin | **Per profile**: `<HERMES_HOME>\profiles\<profile>\plugins\<nama>\` (bukan `<HERMES_HOME>\plugins`). Aktifkan: `hermes -p <profile> plugins enable <nama>`. Tool dimuat lazy lewat tool search — sebut nama tool secara eksplisit di persona. | ✅ | `aos-office-tools` aktif untuk `chief` |

## 2. Arsitektur yang terpasang (M1)

```
Telegram ──► host gateway Agentic OS (Hermes_Gateway_787a7c01, HERMES_HOME=D:\agentic-os\hermes-home)
               ├─ telegram → profile chief (plugin aos-office-tools)
               ├─ kanban dispatcher (kanban.db di HERMES_HOME, board default)
               └─ cron (5 profile + default) — chief: morning-briefing 07:00
dispatcher ──► hermes -p <worker> (cwd = workspace kartu) ──► sandbox Docker per kartu
semua LLM ──► 9Router 127.0.0.1:20128/v1 (Require API key ON, key "HERMES") ──► COMBO-SS
```
Gateway & data Hermes lama milik owner (`%LOCALAPPDATA%\hermes`, `Hermes_Gateway`) berjalan berdampingan dan tidak disentuh.

## 3. Prosedur operasi

### Konfigurasi lokal (`.env.local`, tidak di-commit)
`AOS_ROUTER_URL`, `AOS_ROUTER_KEY` (key 9Router "HERMES"), `AOS_TIMEZONE=Asia/Jakarta`, `AOS_HERMES_HOME=D:\agentic-os\hermes-home`, `AOS_TIER_MODEL_OS_BRAIN|OS_WORKER|OS_PRIVATE` (sementara `COMBO-SS`). Isi key lewat editor atau `Read-Host -AsSecureString` — jangan ditempel di chat.

### Perintah harian
| Tujuan | Perintah |
|---|---|
| Cek kesehatan (harus 26/26 OK) | `pnpm aos doctor` |
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

### Kanban & workspace
- Kartu dari `chief` dibuat lewat `office_create_task` dengan workspace permanen `D:\agentic-os\hermes-home\workspaces\<stamp>-<slug>\` (hasil kerja worker tersimpan di sana). Plugin kini mengunci `HERMES_HOME` ke home Agentic OS (`AOS_HERMES_HOME`, atau terdeteksi dari lokasi plugin). Kartu smoke sebelumnya ada di `…\profiles\chief\workspaces\`, dibuat sebelum perbaikan ini.
- Kartu yang dibuat manual dengan `hermes kanban create` tanpa `--workspace` memakai workspace *scratch* yang **dihapus saat kartu selesai**.

### Cron
- `morning-briefing` (`c7efc0721f0e`): `0 7 * * *`, deliver telegram. Jalankan manual: `hermes -p chief cron run c7efc0721f0e`.
- PC mati/sleep di jam 07:00 → saat gateway menyala lagi, briefing dikirim **satu kali** sebagai susulan (V9).

### Plugin
- `aos-office-tools` → `profiles\chief\plugins\aos-office-tools\` (sumber: `packages/hermes-office-tools/aos-office-tools/`; salin ulang setelah diubah, lalu restart gateway).
- `aos-probe` → `profiles\researcher\plugins\aos-probe\`, **disabled** (hanya untuk investigasi kontrak hook).

### Aturan keamanan operasional
- Jangan memulai sesi interaktif worker (`researcher/secretary/content/dev`) dari folder yang berisi rahasia — cwd di-mount ke sandbox Docker.
- Jangan jalankan `hermes update` dari folder Agentic OS (source dipakai bersama instalasi Hermes owner).
- Pesan `hermes: source-update completion failed … run hermes update` dari runtime Agentic OS: diketahui, tidak memblokir; abaikan sampai upgrade terencana.

## 4. Keterbatasan & catatan yang diketahui

- **Combo sementara**: semua tier → `COMBO-SS` (akun langganan, risiko ToS/limit; `os-private` belum lokal). Ganti lewat `AOS_TIER_MODEL_*` setelah combo `os-*` / API key / Ollama tersedia.
- **PC mati = agent tidur** (gateway, dispatcher, cron berhenti).
- **Biaya**: token usage tidak tersedia di hook `post_llm_call`; M2 memakai `usageHistory` 9Router.
- **Dua dispatcher terpisah**: Hermes lama owner punya dispatcher sendiri untuk board-nya; tidak saling mengganggu karena `kanban_home` berbeda.
- **Batas dispatcher belum berlaku**: host gateway menjalankan dispatcher dengan config ROOT home (`<home>\config.yaml`, belum ada → default Hermes). `max_in_progress`, `failure_limit`, `dispatch_profiles`, `dispatch_interval_seconds` saat ini hanya ada di config `chief`, sehingga baris `profile:chief:dispatcher` di `doctor` tidak mencerminkan dispatcher yang berjalan. Perbaikan (apply-profiles menulis kanban/cron ke config root; doctor memeriksa config root + liveness gateway) direncanakan di awal M2.
- **Belum ada atribusi biaya per profile**: kelima profile memakai SATU key 9Router ("HERMES"), jadi `usageHistory.apiKey` hanya memisahkan trafik Hermes dari aplikasi lain, bukan profile atau task. Atribusi per profile butuh satu key 9Router per profile (perubahan apply-profiles) atau join berdasarkan jendela waktu + event task.
- **Risiko injeksi workspace sampai M3**: `kanban_create` milik worker menerima `workspace_kind`/`workspace_path`, dan cwd worker di-mount read-write ke sandbox Docker. Worker yang terkena prompt injection bisa membuat kartu (mis. untuk `dev`, yang punya network) dengan workspace menunjuk folder sensitif (home Hermes berisi semua `.env`, atau repo berisi `.env.local`). Akan jadi skenario red-team + aturan policy di M3 (deny/approve `kanban_create` dengan workspace di luar root yang diizinkan).

- **File hasil worker belum tersimpan (masalah terbuka, awal M2)**: dengan `container_persistent: false` (dipakai agar kartu tidak saling menulis ke workspace kartu lain), sesi worker dispatcher membuat dua environment Docker; `terminal`/`write_file` jalan di environment yang **tidak** me-mount workspace kartu, sehingga file seperti `notes.md` hilang saat sesi selesai. Hasil kerja tetap tersimpan sebagai ringkasan `kanban_complete` (`hermes kanban show <id>`). Dengan `container_persistent: true` lebih buruk: semua kartu berikutnya menulis ke workspace kartu pertama.

## 5. Bukti exit M1

| Kriteria (PRD §13) | Bukti | Status |
|---|---|---|
| `chief` membuat kartu yang dikerjakan `researcher` via dispatcher | `smoke-chief` PASS `t_6508a3ca` (CLI), output `notes.md` tersimpan; uji delegasi via Telegram oleh owner sendiri masih menunggu | ✅ CLI · Telegram menunggu owner |
| Semua panggilan LLM lewat 9Router | `doctor` 26/26 (tanpa key provider langsung di Hermes Agentic OS) + V12 auxiliary | ✅ |
| Daftar VERIFY terjawab | Tabel §1 | ✅ (V10 = keputusan owner) |
| Briefing pagi | `cron run` → owner mengonfirmasi menerima briefing di Telegram (2026-10-01) | ✅ |
