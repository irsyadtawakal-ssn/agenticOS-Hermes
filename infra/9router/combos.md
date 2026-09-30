# Combo 9Router — Agentic OS

Dibuat via dashboard (9Router tidak punya file config combo). Update file ini setiap kali combo diubah.

| Combo | Urutan fallback (provider/model) | Catatan |
|---|---|---|
| os-brain | 1. `ag/claude-sonnet-4-6` 2. `ag/gemini-3.1-pro-low` | Sementara (M1) memakai akun langganan Antigravity |
| os-worker | 1. `openrouter/nvidia/nemotron-3-super-120b-a12b:free` 2. `ag/gemini-3.8-flash` | Volume tinggi |
| os-private | 1. `ag/gemini-3.8-flash` | Sementara: belum ada model lokal (Ollama) |

> **Pengecualian M1 (keputusan owner, 2026-09-30):** PRD §5.2.3 melarang akun langganan konsumen di combo agent otomatis. Untuk M1 aturan ini sengaja dilonggarkan karena belum ada API key berbayar maupun Ollama. Risiko: pembatasan/ban akun Antigravity karena ToS, dan rate limit. Ganti ke API key berbayar atau Ollama sebelum agent berjalan 24/7.

Terakhir diubah: 2026-09-30
