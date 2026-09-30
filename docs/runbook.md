# Runbook — Agentic OS

## 1. Jawaban [VERIFY]

Status: `✅ terverifikasi` (dicoba di mesin ini) · `📄 dari docs` (belum dicoba) · `⏳ belum`.

| ID | Pertanyaan | Jawaban | Status | Bukti / cara cek | Task |
|---|---|---|---|---|---|
| V1 | Key config provider custom per profile | `model.provider: custom`, `model.base_url`, `model.default`, `model.key_env` | 📄 dari docs | | T5 |
| V2 | Nama tool aktual untuk policy (send_message, terminal, execute_code, write_file, patch, cronjob, kanban_*) | | ⏳ belum | | T10 |
| V3 | CLI/API mutasi kanban | `hermes kanban create/assign/complete/block/unblock/archive` | 📄 dari docs | | T7 |
| V4 | Path SQLite kanban & aman dibaca read-only (WAL) | | ⏳ belum | | T7 |
| V5 | Port & auth `hermes serve`; `apps/shared` bisa dipakai sebagai package | | ⏳ belum | | T10 |
| V6 | Payload hook (`pre_tool_call`, `post_llm_call`, penanda cron) & cara blokir | Blokir: return `{'action':'block','message':...}` | 📄 dari docs | | T10 |
| V7 | Terminal backend Docker di Windows (mount, network, resource) | | ⏳ belum | | T5 |
| V8 | Usage/quota 9Router untuk rekonsiliasi | Tidak ada REST API; data di `~/.9router/db/data.sqlite` | 📄 dari docs | | T10 |
| V9 | Perilaku cron untuk job yang terlewat | Satu catch-up run per slot; `cron.catch_up_missed` | 📄 dari docs | | T9 |
| V10 | Nama produk final | Keputusan owner, bukan blocker M1 | — | | — |
| V11 | Lokasi `HERMES_HOME` di Windows | `%LOCALAPPDATA%\hermes` | 📄 dari docs | | T2 |
| V12 | Semua panggilan auxiliary lewat 9Router | | ⏳ belum | | T5, T10 |
| V13 | Backend web search untuk `researcher` | | ⏳ belum | | T5 |
| V14 | Tool kanban tersedia untuk `chief` di sesi chat/gateway/cron | | ⏳ belum | | T8 |
| V15 | Pin versi vs auto-update (Desktop MSIX) | Pakai installer CLI + pin commit; Desktop opsional | 📄 dari docs | | T2 |
| V16 | Lokasi plugin: root `plugins/` vs `profiles/<name>/plugins/` | | ⏳ belum | | T8, T10 |

## 2. Prosedur operasi

(diisi oleh task-task M1)
