# Agent Hermes Desktop di Agentic OS

Profile tambahan: `hermes-default` (profile utama Desktop), `adelia`, `clara`, `crib`, `maya`. Lima profile bawaan tetap tersedia; ID karakter sebelumnya tetap sama.

Import sekali dari `%LOCALAPPDATA%\hermes`:

```powershell
pnpm aos import-desktop
# Sumber alternatif:
pnpm aos import-desktop "C:\path\to\hermes"
```

Perintah menyalin konfigurasi, SOUL.md, skills, memories, serta autentikasi model ke `AOS_HERMES_HOME\profiles\<nama>`. Data pribadi dan credential hanya berada di runtime lokal, tidak ditulis ke repository. Sumber Desktop tidak diubah. Import ulang mempertahankan profile yang sudah diimpor, termasuk memory dan persona yang berubah di Agentic OS. Ini snapshot, bukan sinkronisasi dua arah.

Model dan konfigurasi auxiliary Desktop dipertahankan. Terminal memakai sandbox Docker Agentic OS dengan proxy registry; approval manual dan penolakan unattended tetap diterapkan. Command allowlist Desktop tidak disalin. Koneksi bot, cron jobs, sesi lama, database proyek, hooks/plugin pihak ketiga, cache, runtime, dan metadata UI Desktop tidak disalin. Integrasi/tool yang membutuhkan plugin atau file di luar profile perlu dipasang tersendiri. Path konfigurasi yang berada di bawah profile sumber dipetakan ke profile tujuan.

Profile default tetap memakai provider/model Desktop (saat import: openai-codex). Penggunaan provider langsung ini tidak masuk ledger biaya 9Router. Empat profile bernama memakai konfigurasi custom 9Router Desktop; key tersebut perlu didaftarkan sebagai `AOS_ROUTER_KEY_<NAMA>` agar biaya diatribusikan per agent. Tidak ada perubahan key otomatis di 9Router.

Roster sumber: `infra/profiles/roster.yaml`. `apply-profiles` menghasilkan `infra/profiles/office-roster.json` yang dipakai bersama oleh Core dan UI. Plugin office-tools chief menerima daftar assignee dari roster sehingga kartu dapat didelegasikan ke profile tambahan.

Setelah import/perubahan roster: build UI (`pnpm office:build`), muat ulang Core dan gateway Agentic OS, lalu refresh browser. Profile dapat dipilih melalui dropdown **Pilih agent** di dock, karakter di kantor, atau shortcut 1–9 dan 0. Mulai sesi chief baru agar persona yang memuat roster terbaru dipakai.

Verifikasi: `pnpm test`, `pnpm -r typecheck`, tes Python, `pnpm aos doctor`. Doctor memastikan konfigurasi model Desktop ada; tidak mengirim prompt untuk memvalidasi autentikasi provider tersebut.
