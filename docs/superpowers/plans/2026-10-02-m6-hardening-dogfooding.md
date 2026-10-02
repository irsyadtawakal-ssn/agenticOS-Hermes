# M6 — Hardening & Dogfooding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agentic OS siap dipakai sehari-hari selama 14 hari dogfooding dan gate rilis F1 (§14.1) bisa diukur. Lingkupnya:
- Briefing pagi lengkap dan tahu kapan ia terlambat.
- Backup harian otomatis.
- Alert bila komponen mati atau kartu macet.
- Animasi kantor menghormati `prefers-reduced-motion`.
- Reminder lewat chief.
- Satu perintah untuk laporan dogfooding.
- Seluruh user story US-01…US-12 didemokan bersama owner.

**Architecture:**
- **Briefing.** Job cron `morning-briefing` (chief) mendapat **pre-run script** `briefing_context.py`. Script ini:
  - membaca `last_dispatch` job-nya sendiri di `cron/jobs.json` untuk menentukan tepat waktu / terlambat / lewati;
  - mengambil ringkasan dari endpoint Core baru `GET /v1/briefing` (auth token bridge yang sudah ada di `plugins/os-bridge/config.json`);
  - mencetak semuanya sebagai konteks prompt, atau `{"wakeAgent": false}` untuk melewati run secara senyap.
- **Core** menambah:
  - backup terjadwal (better-sqlite3 `backup()` untuk semua `*.db` + `tar.exe -a` untuk zip, retensi 14);
  - alert Telegram (komponen down ≥ 3 probe berturut-turut, kartu `running` > 2 jam) lewat notifier bot utama yang sudah ada;
  - tabel `uptime` (per jam) sebagai bukti "PC menyala";
  - laporan `GET /v1/dogfood`.
- **Lainnya:**
  - CLI setup menambah `pnpm aos backup` dan `pnpm aos dogfood-report`.
  - Kantor mendapat patch vendor P8 (karakter tidak berkeliaran bila reduced motion).
  - Persona chief mengambil alih reminder.

**Tech Stack:**
- Core: Fastify 5 + better-sqlite3 (sudah ada).
- Script cron: Python 3 stdlib (dijalankan interpreter Hermes), dengan pytest.
- Office: React 19 (vendor patch kecil).
- Setup: Node CLI. `tar.exe` bawaan Windows 10+.
- Tanpa dependency baru.

**Spec:** `docs/PRD-Agentic-OS.md`:
- §2.3 (US-01…US-12)
- §9 (reliability, backup)
- §12 (reliability test)
- §13 M6
- §14.1 (gate)
- §5.5.6 (reduced motion)

Fakta terpasang di `docs/runbook.md` (M1–M5b).

**Keputusan owner (2026-10-02):**
1. **Reminder (US-02) dibuat chief langsung**, karena hanya chief yang punya bot Telegram; satu token bot tidak bisa dipolling dua profile.
2. **Briefing tanpa topik/berita.** Isinya: kartu hari ini, blocked, approval menunggu, selesai kemarin, biaya kemarin, reminder hari ini.
3. **Tanpa key 9Router per profile.** US-12 tetap berupa breaker jumlah tool call; ambang token dicatat sebagai sebagian.
4. **Backup tanpa file `.env`.**

**Hasil riset (Hermes v0.21.5):**
- **Jejak run cron.** Run tercatat di `profiles/chief/cron/executions.db` (tabel `executions`: `source` builtin/direct, `status`, `claimed_at`, `scheduled_instant` UTC, `delivery_outcome` mis. `delivered`).
- **Stempel dispatch.** `jobs.json` menyimpan `last_dispatch = {scheduled_at, dispatched_at, lateness_seconds, kind: on_time|late|catch_up}`, ditulis saat dispatch sebelum run (`cron/jobs.py:3270`).
- **Grace window.** Job harian punya grace 2 jam: terlambat ≤ 2 jam → `late`, lebih dari itu → `catch_up`. `cron.catch_up_missed: true` menjalankan satu susulan **tanpa batas jam**, sehingga aturan "≤ 12:00" dan label "terlambat" harus dibuat sendiri.
- **Pre-run script** (`cron/scheduler.py:2209`):
  - stdout disuntikkan ke prompt sebagai "Script Output";
  - baris terakhir `{"wakeAgent": false}` = run dilewati senyap;
  - script wajib berada di `<HERMES_HOME profile>/scripts/` (`scheduler_script.py:327`);
  - dijalankan di host dengan Python Hermes;
  - dipasang lewat `hermes -p chief cron edit <id> --script <nama> --prompt <teks>`.
- **Ukuran data.** `HERMES_HOME` ±3,1 GB, tetapi `tools` (1,6 GB), `installs` (0,8 GB), dan `cache` (0,7 GB) adalah runtime. Data inti ±30 MB.
- **Vendor.** Pixel Agents tidak punya dukungan reduced motion. Karakter idle berkeliaran lewat `wanderTimer` di `webview-ui/src/office/engine/characters.ts` (state `IDLE`).
- **Timestamp kanban** (`created_at/started_at/completed_at`) dalam **detik**.
- **Notifier.** `Notifier.send(text): Promise<boolean>` (`apps/core/src/notify.ts`). Saat ini dibuat di dalam `createReactions`, sehingga `main.ts` perlu menyimpan instansinya sendiri.

## Global Constraints

- **Mutasi kanban** hanya lewat CLI resmi. Core membaca `kanban.db`, `executions.db`, `jobs.json`, dan `data.sqlite` 9Router secara **read-only**.
- **Token.** Tidak pernah dicetak atau di-log. Backup **tidak** memuat `.env*`.
- **Restart Core/gateway** hanya lewat `explorer.exe "<Startup>\<file>.vbs"`. Gateway: `hermes gateway stop` lalu `Hermes_Gateway_787a7c01.vbs`.
- **Izin owner dulu** untuk langkah yang menyentuh mesin:
  - `apply-profiles`;
  - restart gateway/Core;
  - `hermes cron edit`;
  - menjalankan cron/briefing yang mengirim Telegram;
  - backup pertama.
- **Bahasa.** Teks untuk owner (Telegram, UI, docs) berbahasa Indonesia. Kode dan commit berbahasa Inggris. Trailer commit persis `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tanpa heredoc shell** untuk menulis file kode (backslash rusak). Pakai tool Edit/Write.
- **Zona waktu** owner: `AOS_TIMEZONE` (default `Asia/Jakarta`). Jam briefing 07:00, batas susulan 12:00.

## File Structure

| File | Tanggung jawab |
|---|---|
| `apps/core/src/briefing.ts` (baru) | `buildBriefing()` murni: ringkasan pagi dari kanban + approval + biaya |
| `apps/core/src/alerts.ts` (baru) | `healthAlerts()` dan `stuckCardAlerts()` murni |
| `apps/core/src/backup.ts` (baru) | `includeInBackup()`, `backupDue()`, `runBackup()`, `pruneBackups()` |
| `apps/core/src/dogfood.ts` (baru) | `markUptime()`, `briefingDays()`, `buildDogfoodReport()` |
| `apps/core/src/db.ts` (ubah) | Tabel `uptime` |
| `apps/core/src/server.ts` (ubah) | Rute `GET /v1/briefing`, `POST /v1/backup`, `GET /v1/dogfood` |
| `apps/core/src/main.ts` (ubah) | Notifier bersama, alert, jadwal backup, uptime, pembaca `executions.db` |
| `packages/hermes-cron-scripts/chief/briefing_context.py` (baru) | Pre-run script briefing |
| `packages/hermes-cron-scripts/test_briefing_context.py` (baru) | pytest |
| `packages/setup/src/apply.ts` (ubah) | Menyalin `packages/hermes-cron-scripts/<profile>/*.py` ke `profiles/<profile>/scripts/` |
| `packages/setup/src/cli.ts` (ubah) | `backup`, `dogfood-report`, opsi `scriptsRoot` |
| `infra/profiles/cron/morning-briefing.md` (ubah) | Prompt baru berbasis Script Output |
| `infra/profiles/soul/chief.md`, `secretary.md` (ubah) | Reminder oleh chief |
| `apps/office/vendor/pixel-agents/webview-ui/src/office/engine/characters.ts` (ubah, P8) | Reduced motion |
| `apps/office/vendor/pixel-agents/NOTICE.md` (ubah) | Catat P8 |

---

### Task 1: Core — ringkasan briefing `GET /v1/briefing`

**Files:**
- Create: `apps/core/src/briefing.ts`
- Modify: `apps/core/src/server.ts`
- Test: `apps/core/test/briefing.test.ts`, `apps/core/test/server.test.ts`

**Interfaces:**
- Consumes: `KanbanTask` (`./kanban.js`), `Approval` (`./approvals.js`), `listApprovals(db, 'pending')`, `dailyCosts(db, days, now, tz)` (urutan naik; `[0]` = kemarin saat `days = 2`).
- Produces:
  - `interface Briefing { date: string; today: { total: number; byAgent: Record<string, number> }; blocked: { total: number; items: Array<{ id: string; title: string; assignee: string | null }> }; doneYesterday: number; approvals: { total: number; items: Array<{ id: string; profile: string; tool: string; task_id: string | null }> }; costYesterday: { cost_usd: number; calls: number } }`
  - `buildBriefing(tasks: KanbanTask[], pending: Approval[], costYesterday: { cost_usd: number; calls: number }, now: number, timeZone: string): Briefing`
  - Rute `GET /v1/briefing` (auth bridge **atau** owner).

- [ ] **Step 1: Tulis test yang gagal** `apps/core/test/briefing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Approval } from '../src/approvals.js';
import { buildBriefing } from '../src/briefing.js';
import type { KanbanTask } from '../src/kanban.js';

// 2026-10-02 07:00 WIB = 2026-10-02T00:00:00Z
const NOW = Date.parse('2026-10-02T00:00:00Z');
const sec = (iso: string) => Date.parse(iso) / 1000;

function task(id: string, status: string, assignee: string | null, completed?: string): KanbanTask {
  return {
    id,
    title: `Kartu ${id}`,
    assignee,
    status,
    created_at: sec('2026-09-30T00:00:00Z'),
    started_at: null,
    completed_at: completed ? sec(completed) : null,
    workspace_kind: null,
    workspace_path: null,
  };
}

describe('buildBriefing', () => {
  it('summarises the board, approvals and yesterday cost in local time', () => {
    const tasks = [
      task('t_1', 'ready', 'researcher'),
      task('t_2', 'running', 'researcher'),
      task('t_3', 'todo', 'dev'),
      task('t_4', 'blocked', 'dev'),
      task('t_5', 'done', 'content', '2026-10-01T10:00:00Z'), // 17:00 WIB kemarin
      task('t_6', 'archived', 'content', '2026-09-30T18:00:00Z'), // 01:00 WIB 1 Okt = kemarin
      task('t_7', 'done', 'content', '2026-10-01T18:00:00Z'), // 01:00 WIB hari ini
      task('t_8', 'triage', null),
    ];
    const pending = [{ id: 'abc123', profile: 'dev', tool: 'terminal', task_id: 't_4' } as Approval];
    const b = buildBriefing(tasks, pending, { cost_usd: 1.2345, calls: 40 }, NOW, 'Asia/Jakarta');
    expect(b.date).toBe('2026-10-02');
    expect(b.today).toEqual({ total: 3, byAgent: { researcher: 2, dev: 1 } });
    expect(b.blocked).toEqual({ total: 1, items: [{ id: 't_4', title: 'Kartu t_4', assignee: 'dev' }] });
    expect(b.doneYesterday).toBe(2);
    expect(b.approvals).toEqual({ total: 1, items: [{ id: 'abc123', profile: 'dev', tool: 'terminal', task_id: 't_4' }] });
    expect(b.costYesterday).toEqual({ cost_usd: 1.2345, calls: 40 });
  });

  it('caps the blocked and approval lists at five', () => {
    const tasks = Array.from({ length: 7 }, (_, i) => task(`t_${i}`, 'blocked', 'dev'));
    const pending = Array.from({ length: 7 }, (_, i) => ({ id: `a${i}`, profile: 'dev', tool: 'terminal', task_id: null }) as Approval);
    const b = buildBriefing(tasks, pending, { cost_usd: 0, calls: 0 }, NOW, 'Asia/Jakarta');
    expect([b.blocked.total, b.blocked.items.length, b.approvals.total, b.approvals.items.length]).toEqual([7, 5, 7, 5]);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal.** `pnpm -F @aos/core exec vitest run test/briefing.test.ts` → FAIL (modul belum ada).

- [ ] **Step 3: Implementasi** `apps/core/src/briefing.ts`:

```ts
import type { Approval } from './approvals.js';
import type { KanbanTask } from './kanban.js';

/** Morning briefing digest (US-01), read by the chief cron pre-run script. */
export interface Briefing {
  date: string;
  today: { total: number; byAgent: Record<string, number> };
  blocked: { total: number; items: Array<{ id: string; title: string; assignee: string | null }> };
  doneYesterday: number;
  approvals: { total: number; items: Array<{ id: string; profile: string; tool: string; task_id: string | null }> };
  costYesterday: { cost_usd: number; calls: number };
}

const ACTIVE = new Set(['todo', 'ready', 'running']);
const LIST_MAX = 5;

function localDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

export function buildBriefing(
  tasks: KanbanTask[],
  pending: Approval[],
  costYesterday: { cost_usd: number; calls: number },
  now: number,
  timeZone: string,
): Briefing {
  const yesterday = localDate(now - 86_400_000, timeZone);
  const byAgent: Record<string, number> = {};
  let total = 0;
  for (const t of tasks) {
    if (!ACTIVE.has(t.status)) continue;
    total += 1;
    const who = t.assignee ?? '-';
    byAgent[who] = (byAgent[who] ?? 0) + 1;
  }
  const blocked = tasks.filter((t) => t.status === 'blocked');
  const doneYesterday = tasks.filter(
    (t) => (t.status === 'done' || t.status === 'archived') && t.completed_at !== null && localDate(t.completed_at * 1000, timeZone) === yesterday,
  ).length;
  return {
    date: localDate(now, timeZone),
    today: { total, byAgent },
    blocked: { total: blocked.length, items: blocked.slice(0, LIST_MAX).map((t) => ({ id: t.id, title: t.title, assignee: t.assignee })) },
    doneYesterday,
    approvals: {
      total: pending.length,
      items: pending.slice(0, LIST_MAX).map((a) => ({ id: a.id, profile: a.profile, tool: a.tool, task_id: a.task_id })),
    },
    costYesterday: { cost_usd: costYesterday.cost_usd, calls: costYesterday.calls },
  };
}
```

- [ ] **Step 4: Tambahkan rute** di `apps/core/src/server.ts`.
  - Import: `import { buildBriefing } from './briefing.js';`
  - Letakkan rute setelah rute `/v1/costs/daily`:

```ts
  app.get('/v1/briefing', { preHandler: requireBridgeOrOwner }, async () => {
    const tz = deps.timeZone ?? 'Asia/Jakarta';
    const [yesterday] = dailyCosts(deps.db, 2, now(), tz);
    return buildBriefing(deps.kanban().tasks, listApprovals(deps.db, 'pending'), yesterday, now(), tz);
  });
```

  Tambahkan test di `apps/core/test/server.test.ts` (memakai `make()` yang sudah ada):

```ts
describe('/v1/briefing', () => {
  it('serves the digest to the bridge or owner tokens only', async () => {
    const { app } = await make();
    expect((await app.inject({ method: 'GET', url: '/v1/briefing' })).statusCode).toBe(401);
    const viaBridge = await app.inject({ method: 'GET', url: '/v1/briefing', headers: { 'x-aos-bridge-token': 'bt' } });
    expect(viaBridge.statusCode).toBe(200);
    expect(viaBridge.json()).toMatchObject({ today: { total: 1, byAgent: { researcher: 1 } }, approvals: { total: 0 }, costYesterday: { calls: 0 } });
    expect((await app.inject({ method: 'GET', url: '/v1/briefing?token=at' })).statusCode).toBe(200);
  });
});
```

- [ ] **Step 5: Jalankan test + typecheck.** `pnpm -F @aos/core exec vitest run test/briefing.test.ts test/server.test.ts` lalu `pnpm -F @aos/core typecheck` → PASS.

- [ ] **Step 6: Commit.** `git add apps/core/src/briefing.ts apps/core/src/server.ts apps/core/test/briefing.test.ts apps/core/test/server.test.ts` lalu `git commit -m "feat(core): morning briefing digest for the chief cron script" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 2: Pre-run script briefing + pemasangan lewat apply-profiles

**Files:**
- Create: `packages/hermes-cron-scripts/chief/briefing_context.py`, `packages/hermes-cron-scripts/test_briefing_context.py`
- Modify: `packages/setup/src/apply.ts`, `packages/setup/src/cli.ts`, `packages/setup/test/apply.test.ts`, `infra/profiles/cron/morning-briefing.md`

**Interfaces:**
- Consumes: `GET /v1/briefing` (Task 1) dengan header `x-aos-bridge-token`; `plugins/os-bridge/config.json` (`core_url`, `token`); `cron/jobs.json` (`jobs[].name`, `last_dispatch`, `next_run_at`, `enabled`).
- Produces:
  - `decide(last_dispatch: dict | None, now: datetime) -> dict` dengan kunci `run: bool`, `late: bool`, `mode: "scheduled" | "manual"`, `scheduled: str | None`
  - `reminders_today(jobs: list, now: datetime, skip_name: str) -> list[str]`
  - `render(digest: dict | None, decision: dict, now: datetime, reminders: list[str]) -> str`
  - `ApplyOptions.scriptsRoot?: string`

- [ ] **Step 1: Tulis test yang gagal** `packages/hermes-cron-scripts/test_briefing_context.py`:

```python
import importlib.util
from datetime import datetime, timedelta, timezone
from pathlib import Path

_spec = importlib.util.spec_from_file_location("briefing_context", Path(__file__).parent / "chief" / "briefing_context.py")
bc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bc)

WIB = timezone(timedelta(hours=7))


def at(h, m=0, day=2):
    return datetime(2026, 10, day, h, m, tzinfo=WIB)


def dispatch(now, kind="on_time", sched_day=2):
    return {
        "scheduled_at": f"2026-10-0{sched_day}T07:00:00+07:00",
        "dispatched_at": now.isoformat(),
        "lateness_seconds": 0,
        "kind": kind,
    }


def test_on_time_run():
    now = at(7, 0)
    assert bc.decide(dispatch(now), now) == {"run": True, "late": False, "mode": "scheduled", "scheduled": "07:00"}


def test_late_before_noon_is_labelled():
    now = at(9, 12)
    d = bc.decide(dispatch(now, "catch_up"), now)
    assert d["run"] and d["late"] and d["mode"] == "scheduled"


def test_after_noon_is_skipped():
    now = at(12, 5)
    assert bc.decide(dispatch(now, "catch_up"), now)["run"] is False


def test_yesterdays_slot_caught_up_next_morning_is_skipped():
    now = at(6, 30, day=3)
    assert bc.decide(dispatch(now, "catch_up", sched_day=2), now)["run"] is False


def test_stale_or_missing_dispatch_means_manual_run():
    now = at(18, 0)
    stale = dispatch(at(7, 0))
    assert bc.decide(stale, now) == {"run": True, "late": False, "mode": "manual", "scheduled": None}
    assert bc.decide(None, now)["mode"] == "manual"
    assert bc.decide({"dispatched_at": "garbage"}, now)["mode"] == "manual"


def test_reminders_today_lists_other_enabled_jobs_due_today():
    now = at(6, 59)
    jobs = [
        {"name": "morning-briefing", "enabled": True, "next_run_at": "2026-10-02T07:00:00+07:00"},
        {"name": "bayar listrik", "enabled": True, "next_run_at": "2026-10-02T09:00:00+07:00"},
        {"name": "besok", "enabled": True, "next_run_at": "2026-10-03T09:00:00+07:00"},
        {"name": "mati", "enabled": False, "next_run_at": "2026-10-02T10:00:00+07:00"},
        {"name": "rusak", "enabled": True, "next_run_at": None},
    ]
    assert bc.reminders_today(jobs, now, "morning-briefing") == ["09:00 bayar listrik"]


def test_render_includes_status_and_digest():
    now = at(9, 12)
    digest = {
        "date": "2026-10-02",
        "today": {"total": 3, "byAgent": {"researcher": 2, "dev": 1}},
        "blocked": {"total": 1, "items": [{"id": "t_4", "title": "Kartu t_4", "assignee": "dev"}]},
        "doneYesterday": 2,
        "approvals": {"total": 1, "items": [{"id": "abc123", "profile": "dev", "tool": "terminal", "task_id": "t_4"}]},
        "costYesterday": {"cost_usd": 1.2345, "calls": 40},
    }
    text = bc.render(digest, {"run": True, "late": True, "mode": "scheduled", "scheduled": "07:00"}, now, ["09:00 bayar listrik"])
    assert "STATUS: TERLAMBAT (jadwal 07:00, dibuat 09:12)" in text
    assert "TANGGAL: Jumat, 2 Oktober 2026" in text
    assert "KARTU_HARI_INI: 3 (researcher 2 · dev 1)" in text
    assert "BLOCKED: 1 — t_4 Kartu t_4 (dev)" in text
    assert "APPROVAL_MENUNGGU: 1 — abc123 dev terminal (kartu t_4)" in text
    assert "SELESAI_KEMARIN: 2" in text
    assert "BIAYA_KEMARIN: $1.23 (40 panggilan)" in text
    assert "REMINDER_HARI_INI: 09:00 bayar listrik" in text


def test_render_without_core_data():
    text = bc.render(None, {"run": True, "late": False, "mode": "manual", "scheduled": None}, at(18, 0), [])
    assert "STATUS: MANUAL" in text
    assert "DATA_CORE: tidak tersedia" in text
    assert "REMINDER_HARI_INI: tidak ada" in text
```

- [ ] **Step 2: Jalankan, pastikan gagal.** `py -3 -m pytest packages/hermes-cron-scripts -q` → error (file script belum ada).

- [ ] **Step 3: Implementasi** `packages/hermes-cron-scripts/chief/briefing_context.py`:

```python
"""Pre-run script for the chief morning briefing (Agentic OS M6).

Hermes runs this before the briefing job and injects stdout into the prompt. A last line of
{"wakeAgent": false} skips the run silently. Lives in <chief HERMES_HOME>/scripts/.
"""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime
from pathlib import Path

JOB_NAME = "morning-briefing"
CUTOFF_HOUR = 12
FRESH_DISPATCH_SECONDS = 180
DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"]
MANUAL = {"run": True, "late": False, "mode": "manual", "scheduled": None}


def _parse(value):
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def decide(last_dispatch, now):
    """Scheduled runs: on time, late (labelled) before CUTOFF_HOUR, else skipped. Anything else is manual."""
    try:
        dispatched = _parse(last_dispatch["dispatched_at"])
        scheduled = _parse(last_dispatch["scheduled_at"]).astimezone(now.tzinfo)
    except (TypeError, KeyError, ValueError):
        return dict(MANUAL)
    if abs((now - dispatched).total_seconds()) > FRESH_DISPATCH_SECONDS:
        return dict(MANUAL)
    if scheduled.date() != now.date() or now.hour >= CUTOFF_HOUR:
        return {"run": False, "late": True, "mode": "scheduled", "scheduled": scheduled.strftime("%H:%M")}
    late = last_dispatch.get("kind", "on_time") != "on_time"
    return {"run": True, "late": late, "mode": "scheduled", "scheduled": scheduled.strftime("%H:%M")}


def reminders_today(jobs, now, skip_name):
    out = []
    for job in jobs:
        if not job.get("enabled") or job.get("name") == skip_name or not job.get("next_run_at"):
            continue
        try:
            due = _parse(job["next_run_at"]).astimezone(now.tzinfo)
        except ValueError:
            continue
        if due.date() == now.date():
            out.append((due, f"{due.strftime('%H:%M')} {job.get('name') or 'reminder'}"))
    return [text for _, text in sorted(out)]


def _status(decision, now):
    if decision["mode"] == "manual":
        return "STATUS: MANUAL (dijalankan owner)"
    if decision["late"]:
        return f"STATUS: TERLAMBAT (jadwal {decision['scheduled']}, dibuat {now.strftime('%H:%M')})"
    return "STATUS: tepat waktu"


def render(digest, decision, now, reminders):
    lines = [_status(decision, now), f"TANGGAL: {DAYS[now.weekday()]}, {now.day} {MONTHS[now.month - 1]} {now.year}"]
    if digest is None:
        lines.append("DATA_CORE: tidak tersedia (OS Core tidak menjawab); pakai office_list_tasks untuk data kartu")
    else:
        by_agent = " · ".join(f"{who} {n}" for who, n in digest["today"]["byAgent"].items())
        lines.append(f"KARTU_HARI_INI: {digest['today']['total']}" + (f" ({by_agent})" if by_agent else ""))
        blocked = "; ".join(f"{b['id']} {b['title']} ({b['assignee'] or '-'})" for b in digest["blocked"]["items"])
        lines.append(f"BLOCKED: {digest['blocked']['total']}" + (f" — {blocked}" if blocked else ""))
        approvals = "; ".join(
            f"{a['id']} {a['profile']} {a['tool']}" + (f" (kartu {a['task_id']})" if a.get("task_id") else "")
            for a in digest["approvals"]["items"]
        )
        lines.append(f"APPROVAL_MENUNGGU: {digest['approvals']['total']}" + (f" — {approvals}" if approvals else ""))
        lines.append(f"SELESAI_KEMARIN: {digest['doneYesterday']}")
        cost = digest["costYesterday"]
        lines.append(f"BIAYA_KEMARIN: ${cost['cost_usd']:.2f} ({cost['calls']} panggilan)")
    lines.append("REMINDER_HARI_INI: " + ("; ".join(reminders) if reminders else "tidak ada"))
    return "\n".join(lines)


def _fetch_digest(profile_home):
    try:
        cfg = json.loads((profile_home / "plugins" / "os-bridge" / "config.json").read_text(encoding="utf-8"))
        req = urllib.request.Request(cfg["core_url"].rstrip("/") + "/v1/briefing", headers={"x-aos-bridge-token": cfg["token"]})
        with urllib.request.urlopen(req, timeout=10) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception:
        return None


def main():
    profile_home = Path(__file__).resolve().parent.parent
    now = datetime.now().astimezone()
    try:
        jobs = json.loads((profile_home / "cron" / "jobs.json").read_text(encoding="utf-8"))
        jobs = jobs.get("jobs", jobs) if isinstance(jobs, dict) else jobs
    except Exception:
        jobs = []
    own = next((j for j in jobs if j.get("name") == JOB_NAME), {})
    decision = decide(own.get("last_dispatch"), now)
    if not decision["run"]:
        print(json.dumps({"wakeAgent": False}))
        return
    print(render(_fetch_digest(profile_home), decision, now, reminders_today(jobs, now, JOB_NAME)))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Jalankan pytest.** `py -3 -m pytest packages/hermes-cron-scripts -q` → semua lulus.
  - Tambahkan path baru ke perintah Python standar milestone. Gunakan `py -3 -m pytest packages tests/redteam -q`; folder `packages/` sudah tercakup.

- [ ] **Step 5: apply-profiles memasang script.** Test baru di `packages/setup/test/apply.test.ts`:

```ts
  it('copies cron scripts for profiles that have them', async () => {
    const { home, opts } = setup();
    const scriptsRoot = mkdtempSync(join(tmpdir(), 'aos-scripts-'));
    mkdirSync(join(scriptsRoot, 'chief'), { recursive: true });
    writeFileSync(join(scriptsRoot, 'chief', 'briefing_context.py'), '# briefing\n');
    writeFileSync(join(scriptsRoot, 'chief', 'notes.txt'), 'not a script\n');
    const log = await applyProfiles({ ...opts, scriptsRoot });
    const target = join(profileDir(home, 'chief'), 'scripts');
    expect(readFileSync(join(target, 'briefing_context.py'), 'utf8')).toBe('# briefing\n');
    expect(existsSync(join(target, 'notes.txt'))).toBe(false);
    expect(log).toContain('installed cron scripts briefing_context.py for chief');
  });
```

  Lalu ubah `packages/setup/src/apply.ts`:
  - Tambahkan field `scriptsRoot?: string;` ke `ApplyOptions`.
  - Tambahkan fungsi:

```ts
function installScripts(o: ApplyOptions, spec: ProfileSpec, dir: string): string | null {
  const source = o.scriptsRoot ? join(o.scriptsRoot, spec.name) : null;
  if (!source || !existsSync(source)) return null;
  const files = readdirSync(source).filter((f) => f.endsWith('.py')).sort();
  if (files.length === 0) return null;
  const target = join(dir, 'scripts');
  mkdirSync(target, { recursive: true });
  for (const file of files) copyFileSync(join(source, file), join(target, file));
  return `installed cron scripts ${files.join(',')} for ${spec.name}`;
}
```

  - Di `applyProfiles`, tepat setelah `if (installed) log.push(installed);`, tambahkan:

```ts
    const scripts = installScripts(o, spec, dir);
    if (scripts) log.push(scripts);
```

  - Di `packages/setup/src/cli.ts`, kasus `apply-profiles`, tambahkan `scriptsRoot: join(repoRoot, 'packages/hermes-cron-scripts'),` ke opsi.

  Jalankan `pnpm -F @aos/setup test` → PASS.

- [ ] **Step 6: Prompt baru** `infra/profiles/cron/morning-briefing.md` (ganti seluruh isi):

```markdown
Susun briefing pagi untuk owner dalam Bahasa Indonesia, maksimal 14 baris, HANYA dari data "Script Output" di atas (jangan mengarang angka).

Format:
☀️ Briefing — <TANGGAL><jika STATUS TERLAMBAT tambahkan " (terlambat, dibuat <jam>)">
Hari ini: <KARTU_HARI_INI>
⚠ Menunggu kamu: <BLOCKED> kartu blocked<, sebut maks 3 id + judul> · <APPROVAL_MENUNGGU> izin<, sebut id + agent + tool; ingatkan balas "setujui <id>" / "tolak <id> <alasan>">
✅ Selesai kemarin: <SELESAI_KEMARIN>
💸 Biaya kemarin: <BIAYA_KEMARIN>
📌 Reminder hari ini: <REMINDER_HARI_INI>

Jika DATA_CORE tidak tersedia: ambil data kartu dengan office_list_tasks, tulis "biaya & izin: tidak tersedia (Core mati)".
Jika STATUS MANUAL: tambahkan baris terakhir "(dijalankan manual)".
```

- [ ] **Step 7: Commit.** `git add packages/hermes-cron-scripts packages/setup/src/apply.ts packages/setup/src/cli.ts packages/setup/test/apply.test.ts infra/profiles/cron/morning-briefing.md` lalu `git commit -m "feat(briefing): pre-run script with late/skip rules and Core digest" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 3: Core — alert komponen mati & kartu macet

**Files:**
- Create: `apps/core/src/alerts.ts`
- Modify: `apps/core/src/main.ts`
- Test: `apps/core/test/alerts.test.ts`

**Interfaces:**
- Consumes: `HealthComponent`, `HealthId` (`./health.js`), `KanbanTask` (`./kanban.js`), `Notifier` (`./notify.js`).
- Produces:
  - `interface HealthAlertState { streak: Map<string, number>; alerted: Set<string> }`
  - `newHealthAlertState(): HealthAlertState`
  - `healthAlerts(state: HealthAlertState, components: HealthComponent[], threshold?: number): string[]`
  - `STUCK_AFTER_MS = 7_200_000`
  - `stuckCardAlerts(tasks: KanbanTask[], now: number, notified: Set<string>): string[]`

- [ ] **Step 1: Tulis test yang gagal** `apps/core/test/alerts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { healthAlerts, newHealthAlertState, STUCK_AFTER_MS, stuckCardAlerts } from '../src/alerts.js';
import type { HealthComponent } from '../src/health.js';
import type { KanbanTask } from '../src/kanban.js';

const comp = (id: HealthComponent['id'], status: HealthComponent['status'], detail = 'x'): HealthComponent => ({ id, label: id.toUpperCase(), status, detail });

describe('healthAlerts', () => {
  it('alerts after consecutive down probes and announces recovery once', () => {
    const s = newHealthAlertState();
    expect(healthAlerts(s, [comp('router', 'down', 'tidak terjangkau')], 3)).toEqual([]);
    expect(healthAlerts(s, [comp('router', 'down', 'tidak terjangkau')], 3)).toEqual([]);
    expect(healthAlerts(s, [comp('router', 'down', 'tidak terjangkau')], 3)).toEqual(['⚠️ ROUTER bermasalah: tidak terjangkau']);
    expect(healthAlerts(s, [comp('router', 'down', 'tidak terjangkau')], 3)).toEqual([]);
    expect(healthAlerts(s, [comp('router', 'ok', 'terjangkau')], 3)).toEqual(['✅ ROUTER pulih (terjangkau)']);
    expect(healthAlerts(s, [comp('router', 'ok', 'terjangkau')], 3)).toEqual([]);
  });

  it('ignores core, ollama and absent components and resets a short outage', () => {
    const s = newHealthAlertState();
    healthAlerts(s, [comp('gateway', 'down')], 3);
    healthAlerts(s, [comp('gateway', 'ok')], 3);
    healthAlerts(s, [comp('gateway', 'down')], 3);
    expect(healthAlerts(s, [comp('gateway', 'down'), comp('ollama', 'down'), comp('serve', 'absent')], 3)).toEqual([]);
  });
});

describe('stuckCardAlerts', () => {
  const now = Date.parse('2026-10-02T10:00:00Z');
  const t = (id: string, status: string, startedMsAgo: number | null): KanbanTask => ({
    id, title: `Kartu ${id}`, assignee: 'dev', status, created_at: 0,
    started_at: startedMsAgo === null ? null : (now - startedMsAgo) / 1000, completed_at: null, workspace_kind: null, workspace_path: null,
  });

  it('reports cards running longer than two hours once', () => {
    const notified = new Set<string>();
    const tasks = [t('t_1', 'running', STUCK_AFTER_MS + 1), t('t_2', 'running', 60_000), t('t_3', 'blocked', STUCK_AFTER_MS * 2)];
    const first = stuckCardAlerts(tasks, now, notified);
    expect(first).toHaveLength(1);
    expect(first[0]).toContain('t_1');
    expect(stuckCardAlerts(tasks, now, notified)).toEqual([]);
  });

  it('forgets cards that stopped running so a later stall alerts again', () => {
    const notified = new Set<string>(['t_1']);
    stuckCardAlerts([t('t_1', 'done', null)], now, notified);
    expect(notified.has('t_1')).toBe(false);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal.** `pnpm -F @aos/core exec vitest run test/alerts.test.ts` → FAIL.

- [ ] **Step 3: Implementasi** `apps/core/src/alerts.ts`:

```ts
import type { HealthComponent, HealthId } from './health.js';
import type { KanbanTask } from './kanban.js';

const WATCHED: HealthId[] = ['gateway', 'router', 'docker', 'serve'];

export interface HealthAlertState {
  streak: Map<string, number>;
  alerted: Set<string>;
}

export function newHealthAlertState(): HealthAlertState {
  return { streak: new Map(), alerted: new Set() };
}

/** Telegram lines for components down for `threshold` consecutive probes, and their recovery. */
export function healthAlerts(state: HealthAlertState, components: HealthComponent[], threshold = 3): string[] {
  const out: string[] = [];
  for (const c of components) {
    if (!WATCHED.includes(c.id) || c.status === 'absent') continue;
    if (c.status === 'down') {
      const n = (state.streak.get(c.id) ?? 0) + 1;
      state.streak.set(c.id, n);
      if (n >= threshold && !state.alerted.has(c.id)) {
        state.alerted.add(c.id);
        out.push(`⚠️ ${c.label} bermasalah: ${c.detail}`);
      }
    } else {
      state.streak.set(c.id, 0);
      if (state.alerted.delete(c.id)) out.push(`✅ ${c.label} pulih (${c.detail})`);
    }
  }
  return out;
}

export const STUCK_AFTER_MS = 2 * 60 * 60 * 1000;

/** Cards `running` longer than STUCK_AFTER_MS, each reported once per stall (kanban times are seconds). */
export function stuckCardAlerts(tasks: KanbanTask[], now: number, notified: Set<string>): string[] {
  const out: string[] = [];
  const running = new Set<string>();
  for (const t of tasks) {
    if (t.status !== 'running' || t.started_at === null) continue;
    running.add(t.id);
    if (now - t.started_at * 1000 < STUCK_AFTER_MS || notified.has(t.id)) continue;
    notified.add(t.id);
    out.push(`⏳ Kartu ${t.id} (${t.assignee ?? '-'}) berjalan lebih dari 2 jam: ${t.title}\nBila macet, pindahkan ke Blocked dari laci kanban kantor.`);
  }
  for (const id of [...notified]) if (!running.has(id)) notified.delete(id);
  return out;
}
```

- [ ] **Step 4: Wiring di `apps/core/src/main.ts`.**
  - Ganti `notifier: createNotifierFromFile(config.chiefEnvPath),` di `createReactions({...})` dengan `notifier,`. Sebelum `createReactions`, tambahkan `const notifier = createNotifierFromFile(config.chiefEnvPath);`.
  - Import `import { healthAlerts, newHealthAlertState, stuckCardAlerts } from './alerts.js';`.
  - Sebelum `async function refreshHealth`, tambahkan:

```ts
const healthAlertState = newHealthAlertState();
const stuckNotified = new Set<string>();

function sendAll(lines: string[]): void {
  for (const line of lines) background('alert', notifier.send(line).then(() => undefined));
}
```

  - Di dalam `refreshHealth`, setelah `const components = await probeHealth(healthDeps);`, tambahkan:

```ts
  sendAll(healthAlerts(healthAlertState, components, 3));
  sendAll(stuckCardAlerts(snapshot.tasks, Date.now(), stuckNotified));
```

- [ ] **Step 5: Test + typecheck.** `pnpm -F @aos/core test` dan `pnpm -F @aos/core typecheck` → PASS.

- [ ] **Step 6: Commit.** `git add apps/core/src/alerts.ts apps/core/src/main.ts apps/core/test/alerts.test.ts` lalu `git commit -m "feat(core): Telegram alerts for down components and stalled cards" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 4: Core — backup harian + `pnpm aos backup`

**Files:**
- Create: `apps/core/src/backup.ts`
- Modify: `apps/core/src/server.ts`, `apps/core/src/main.ts`, `packages/setup/src/cli.ts`
- Test: `apps/core/test/backup.test.ts`

**Interfaces:**
- Consumes: `localStamp(ms, tz)` (`./kanbanActions.js`), `Db` (better-sqlite3).
- Produces:
  - `includeInBackup(rel: string, isDir: boolean): boolean`
  - `backupDue(lastMs: number | null, now: number, timeZone: string): boolean`
  - `interface BackupResult { file: string; files: number; failed: string[] }`
  - `runBackup(o: { hermesHome: string; backupsDir: string; coreDb: Db; now: number; timeZone: string; zip(stagingDir: string, zipFile: string): Promise<void> }): Promise<BackupResult>`
  - `pruneBackups(backupsDir: string, keep?: number): string[]`
  - `latestBackupMs(backupsDir: string): number | null`
  - Rute `POST /v1/backup` (owner); `ServerDeps.runBackup?: () => Promise<BackupResult>`.

- [ ] **Step 1: Tulis test yang gagal** `apps/core/test/backup.test.ts`:

```ts
import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { backupDue, includeInBackup, latestBackupMs, pruneBackups, runBackup } from '../src/backup.js';
import { openCoreDb } from '../src/db.js';

describe('includeInBackup', () => {
  it('keeps state and drops runtime, caches, secrets and locks', () => {
    const keep = ['config.yaml', 'kanban.db', 'profiles', 'profiles/chief/SOUL.md', 'profiles/chief/cron/jobs.json', 'workspaces/x/notes.md', 'skills/a/SKILL.md'];
    const drop = ['tools', 'installs', 'cache', 'sandboxes', 'logs', 'backups', '.env', '.env.bak-1', 'profiles/chief/.env', 'kanban.db-wal', 'state.db-shm', 'gateway.lock', 'gateway.pid',
      'profiles/chief/cache', 'profiles/chief/sandboxes', 'profiles/chief/plugins/os-bridge/spool', 'skills/a/__pycache__'];
    for (const p of keep) expect([p, includeInBackup(p, !p.includes('.'))]).toEqual([p, true]);
    for (const p of drop) expect([p, includeInBackup(p, !p.includes('.') || p.endsWith('spool'))]).toEqual([p, false]);
  });
});

describe('backupDue', () => {
  const tz = 'Asia/Jakarta';
  it('runs at 23:30 local once a day, or when the last backup is over 26 hours old', () => {
    const at = (iso: string) => Date.parse(iso);
    expect(backupDue(null, at('2026-10-02T03:00:00Z'), tz)).toBe(true);
    expect(backupDue(at('2026-10-01T16:30:00Z'), at('2026-10-02T03:00:00Z'), tz)).toBe(false);
    expect(backupDue(at('2026-10-01T16:30:00Z'), at('2026-10-02T16:31:00Z'), tz)).toBe(true);
    expect(backupDue(at('2026-10-02T16:31:00Z'), at('2026-10-02T16:45:00Z'), tz)).toBe(false);
    expect(backupDue(at('2026-09-30T10:00:00Z'), at('2026-10-02T03:00:00Z'), tz)).toBe(true);
  });
});

describe('runBackup', () => {
  it('snapshots databases consistently, copies kept files and skips the rest', async () => {
    const home = mkdtempSync(join(tmpdir(), 'aos-bk-home-'));
    const backupsDir = mkdtempSync(join(tmpdir(), 'aos-bk-out-'));
    writeFileSync(join(home, 'config.yaml'), 'a: 1\n');
    writeFileSync(join(home, '.env'), 'SECRET=1\n');
    mkdirSync(join(home, 'cache'), { recursive: true });
    writeFileSync(join(home, 'cache', 'big.bin'), 'x');
    mkdirSync(join(home, 'profiles', 'chief'), { recursive: true });
    const live = new Database(join(home, 'profiles', 'chief', 'state.db'));
    live.pragma('journal_mode = WAL');
    live.exec('CREATE TABLE t (v TEXT); INSERT INTO t VALUES (\'ok\')');
    const zipped: string[] = [];
    const result = await runBackup({
      hermesHome: home,
      backupsDir,
      coreDb: openCoreDb(join(mkdtempSync(join(tmpdir(), 'aos-bk-core-')), 'core.db')),
      now: Date.parse('2026-10-02T16:30:00Z'),
      timeZone: 'Asia/Jakarta',
      zip: async (staging, zipFile) => {
        zipped.push(zipFile);
        expect(existsSync(join(staging, 'hermes-home', 'config.yaml'))).toBe(true);
        expect(existsSync(join(staging, 'hermes-home', '.env'))).toBe(false);
        expect(existsSync(join(staging, 'hermes-home', 'cache'))).toBe(false);
        expect(existsSync(join(staging, 'core', 'core.db'))).toBe(true);
        const copy = new Database(join(staging, 'hermes-home', 'profiles', 'chief', 'state.db'), { readonly: true });
        expect(copy.prepare('SELECT v FROM t').get()).toEqual({ v: 'ok' });
        copy.close();
        writeFileSync(zipFile, 'zip');
      },
    });
    live.close();
    expect(result.file).toBe(join(backupsDir, 'aos-backup-20261002-233000.zip'));
    expect(result.failed).toEqual([]);
    expect(result.files).toBe(3);
    expect(zipped).toEqual([result.file]);
    expect(readdirSync(backupsDir)).toEqual(['aos-backup-20261002-233000.zip']);
  });
});

describe('pruneBackups / latestBackupMs', () => {
  it('keeps the newest backups only', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aos-bk-prune-'));
    for (let d = 1; d <= 16; d++) {
      const f = join(dir, `aos-backup-202609${String(d).padStart(2, '0')}-233000.zip`);
      writeFileSync(f, 'z');
      utimesSync(f, new Date(2026, 8, d), new Date(2026, 8, d));
    }
    writeFileSync(join(dir, 'other.txt'), 'keep');
    expect(pruneBackups(dir, 14)).toEqual(['aos-backup-20260901-233000.zip', 'aos-backup-20260902-233000.zip']);
    expect(readdirSync(dir)).toHaveLength(15);
    expect(latestBackupMs(dir)).toBe(new Date(2026, 8, 16).getTime());
    expect(latestBackupMs(mkdtempSync(join(tmpdir(), 'aos-bk-empty-')))).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal.** `pnpm -F @aos/core exec vitest run test/backup.test.ts` → FAIL.

- [ ] **Step 3: Implementasi** `apps/core/src/backup.ts`:

```ts
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { Db } from './db.js';
import { localStamp } from './kanbanActions.js';

/** Daily backup of Agentic OS state (PRD §9): HERMES_HOME without runtime/caches/secrets + core.db. */
const ROOT_SKIP = new Set(['cache', 'installs', 'tools', 'sandboxes', 'audio_cache', 'image_cache', 'logs', 'source-checks', 'plugin-update-checks', 'backups', 'bin']);
const PROFILE_SKIP = new Set(['cache', 'sandboxes', 'logs', 'audio_cache', 'image_cache']);
const ANY_SKIP = new Set(['__pycache__', 'node_modules', 'spool']);
const BACKUP_FILE = /^aos-backup-\d{8}-\d{6}\.zip$/;

export interface BackupResult {
  file: string;
  files: number;
  failed: string[];
}

export function includeInBackup(rel: string, isDir: boolean): boolean {
  const parts = rel.split(/[\\/]/).filter(Boolean);
  if (parts.some((p) => ANY_SKIP.has(p))) return false;
  if (parts.length >= 1 && ROOT_SKIP.has(parts[0])) return false;
  if (parts[0] === 'profiles' && parts.length >= 3 && PROFILE_SKIP.has(parts[2])) return false;
  if (isDir) return true;
  const name = parts[parts.length - 1] ?? '';
  return !(name.startsWith('.env') || /\.(lock|pid)$/.test(name) || /-(wal|shm)$/.test(name));
}

function localParts(ms: number, timeZone: string): { date: string; time: string } {
  const stamp = localStamp(ms, timeZone);
  return { date: stamp.slice(0, 8), time: stamp.slice(9, 13) };
}

export function backupDue(lastMs: number | null, now: number, timeZone: string): boolean {
  if (lastMs === null) return true;
  const today = localParts(now, timeZone);
  if (localParts(lastMs, timeZone).date === today.date) return false;
  return today.time >= '2330' || now - lastMs > 26 * 60 * 60 * 1000;
}

export function latestBackupMs(backupsDir: string): number | null {
  if (!existsSync(backupsDir)) return null;
  const times = readdirSync(backupsDir)
    .filter((f) => BACKUP_FILE.test(f))
    .map((f) => statSync(join(backupsDir, f)).mtimeMs);
  return times.length > 0 ? Math.max(...times) : null;
}

export function pruneBackups(backupsDir: string, keep = 14): string[] {
  const files = readdirSync(backupsDir)
    .filter((f) => BACKUP_FILE.test(f))
    .sort();
  const removed = files.slice(0, Math.max(0, files.length - keep));
  for (const f of removed) rmSync(join(backupsDir, f));
  return removed;
}

async function copyTree(src: string, dest: string, rel: string, result: { files: number; failed: string[] }): Promise<void> {
  for (const entry of readdirSync(join(src, rel), { withFileTypes: true })) {
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    if (!includeInBackup(childRel, entry.isDirectory())) continue;
    if (entry.isDirectory()) {
      await copyTree(src, dest, childRel, result);
      continue;
    }
    if (!entry.isFile()) continue;
    const from = join(src, childRel);
    const to = join(dest, childRel);
    mkdirSync(join(to, '..'), { recursive: true });
    try {
      if (entry.name.endsWith('.db')) {
        const db = new Database(from, { readonly: true, fileMustExist: true });
        try {
          await db.backup(to);
        } finally {
          db.close();
        }
      } else {
        copyFileSync(from, to);
      }
      result.files += 1;
    } catch {
      result.failed.push(childRel);
    }
  }
}

export async function runBackup(o: {
  hermesHome: string;
  backupsDir: string;
  coreDb: Db;
  now: number;
  timeZone: string;
  zip(stagingDir: string, zipFile: string): Promise<void>;
}): Promise<BackupResult> {
  const stamp = localStamp(o.now, o.timeZone);
  mkdirSync(o.backupsDir, { recursive: true });
  const staging = join(o.backupsDir, `.staging-${stamp}`);
  rmSync(staging, { recursive: true, force: true });
  const result = { files: 0, failed: [] as string[] };
  try {
    await copyTree(o.hermesHome, join(staging, 'hermes-home'), '', result);
    mkdirSync(join(staging, 'core'), { recursive: true });
    await o.coreDb.backup(join(staging, 'core', 'core.db'));
    result.files += 1;
    const file = join(o.backupsDir, `aos-backup-${stamp}.zip`);
    await o.zip(staging, file);
    pruneBackups(o.backupsDir);
    return { file, ...result };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
```

  Catatan: `files` di test = `config.yaml` + `state.db` + `core.db` = 3.

- [ ] **Step 4: Rute dan jadwal.**
  - **`server.ts`.** Tambahkan `runBackup?: () => Promise<import('./backup.js').BackupResult>;` ke `ServerDeps` (atau import type `BackupResult`), lalu rute:

```ts
  app.post('/v1/backup', { preHandler: requireOwner }, async (_req, reply) => {
    if (!deps.runBackup) return reply.code(503).send({ error: 'backup tidak tersedia' });
    try {
      return await deps.runBackup();
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });
```

  - **`main.ts`.** Import `import { backupDue, latestBackupMs, runBackup, type BackupResult } from './backup.js';`, lalu tambahkan sebelum `buildServer`:

```ts
const backupsDir = process.env.AOS_BACKUP_DIR?.trim() || join(dirname(config.dbPath), '..', 'backups');
let backupRunning: Promise<BackupResult> | null = null;
function backupNow(): Promise<BackupResult> {
  backupRunning ??= runBackup({
    hermesHome: config.hermesHome,
    backupsDir,
    coreDb: db,
    now: Date.now(),
    timeZone: config.timeZone,
    zip: (staging, zipFile) =>
      new Promise((done, fail) => {
        execFile('tar.exe', ['-a', '-c', '-f', zipFile, '-C', staging, '.'], { windowsHide: true, timeout: 600_000 }, (err) =>
          err ? fail(err) : done(),
        );
      }),
  })
    .then((r) => {
      log(`backup ${r.file}: ${r.files} file, ${r.failed.length} gagal`);
      if (r.failed.length > 0) void notifier.send(`⚠️ Backup selesai dengan ${r.failed.length} file gagal: ${r.failed.slice(0, 3).join(', ')}`);
      return r;
    })
    .catch((err: unknown) => {
      void notifier.send(`⚠️ Backup harian gagal: ${(err as Error).message}`);
      throw err;
    })
    .finally(() => {
      backupRunning = null;
    });
  return backupRunning;
}
function backupTick(): void {
  if (backupRunning || !backupDue(latestBackupMs(backupsDir), Date.now(), config.timeZone)) return;
  background('backup', backupNow().then(() => undefined));
}
setTimeout(backupTick, 120_000);
setInterval(backupTick, 600_000);
```

    Tambahkan `runBackup: backupNow,` ke objek `buildServer`. Pastikan `execFile` dan `dirname` sudah diimpor (`execFile` sudah; `dirname` dari M5b).
  - **`packages/setup/src/cli.ts`.** Kasus baru sebelum `default`:

```ts
    case 'backup': {
      const res = await fetch(`${coreUrl}/v1/backup`, { method: 'POST', headers: { authorization: `Bearer ${required('AOS_UI_TOKEN')}` } });
      const body = (await res.json()) as { file?: string; files?: number; failed?: string[]; error?: string };
      if (!res.ok) {
        console.error(`Backup gagal: ${body.error ?? res.status}`);
        return 1;
      }
      console.log(`Backup: ${body.file} (${body.files} file, ${body.failed?.length ?? 0} gagal)`);
      return 0;
    }
```

    Perbarui pesan usage menjadi `pnpm aos <apply-profiles|doctor|smoke-kanban|smoke-chief|office|backup|dogfood-report>`.

- [ ] **Step 5: Test + typecheck.** `pnpm -F @aos/core test`, `pnpm -F @aos/core typecheck`, `pnpm -F @aos/setup typecheck` → PASS.

- [ ] **Step 6: Commit.** `git add apps/core/src/backup.ts apps/core/src/server.ts apps/core/src/main.ts apps/core/test/backup.test.ts packages/setup/src/cli.ts` lalu `git commit -m "feat(core): daily backup of Agentic OS state with retention" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 5: Core — uptime & laporan dogfooding + `pnpm aos dogfood-report`

**Files:**
- Create: `apps/core/src/dogfood.ts`
- Modify: `apps/core/src/db.ts`, `apps/core/src/server.ts`, `apps/core/src/main.ts`, `packages/setup/src/cli.ts`
- Test: `apps/core/test/dogfood.test.ts`

**Interfaces:**
- Consumes: `auditRiskyActions(db, since)` (`./audit.js`), `localStamp` (`./kanbanActions.js`).
- Produces:
  - `markUptime(db: Db, now: number, timeZone: string): void`
  - `interface ExecutionRow { source: string; status: string; claimed_at: string; scheduled_instant: string | null; delivery_outcome: string | null }`
  - `interface DayBriefing { day: string; morningOn: boolean; delivered: boolean; late: boolean }`
  - `briefingDays(execs: ExecutionRow[], mornings: Set<string>, days: string[], timeZone: string): DayBriefing[]`
  - `interface DogfoodReport { from: string; to: string; briefing: { onDays: number; delivered: number; rate: number | null; perDay: DayBriefing[] }; security: { checked: number; violations: number }; approvals: { decided: number; medianMinutes: number | null }; adoption: { activeDays: number }; gate: { enoughData: boolean; briefingOk: boolean | null; securityOk: boolean } }`
  - `buildDogfoodReport(db: Db, execs: ExecutionRow[], days: number, now: number, timeZone: string): DogfoodReport`
  - Rute `GET /v1/dogfood?days=` (owner); `ServerDeps.readBriefingExecutions?: () => ExecutionRow[]`.

- [ ] **Step 1: Tabel uptime.** Tambahkan ke `SCHEMA` di `apps/core/src/db.ts` (setelah `chat_sessions`):

```sql
CREATE TABLE IF NOT EXISTS uptime (
  day TEXT NOT NULL,
  hour INTEGER NOT NULL,
  PRIMARY KEY (day, hour)
);
```

- [ ] **Step 2: Tulis test yang gagal** `apps/core/test/dogfood.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { openCoreDb } from '../src/db.js';
import { briefingDays, buildDogfoodReport, type ExecutionRow, markUptime } from '../src/dogfood.js';

const TZ = 'Asia/Jakarta';
const exec = (scheduled: string | null, claimed: string, outcome = 'delivered', source = 'builtin', status = 'completed'): ExecutionRow => ({
  source, status, claimed_at: claimed, scheduled_instant: scheduled, delivery_outcome: outcome,
});

describe('briefingDays', () => {
  it('counts scheduled deliveries per local day and flags late ones', () => {
    const execs = [
      exec('2026-10-01T00:00:00+00:00', '2026-10-01T07:00:20+07:00'),
      exec('2026-10-02T00:00:00+00:00', '2026-10-02T07:33:16+07:00'),
      exec(null, '2026-10-02T13:00:17+07:00', 'delivered', 'direct'),
      exec('2026-10-03T00:00:00+00:00', '2026-10-03T07:00:05+07:00', 'failed'),
    ];
    const mornings = new Set(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(briefingDays(execs, mornings, ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'], TZ)).toEqual([
      { day: '2026-10-01', morningOn: true, delivered: true, late: false },
      { day: '2026-10-02', morningOn: true, delivered: true, late: true },
      { day: '2026-10-03', morningOn: true, delivered: false, late: false },
      { day: '2026-10-04', morningOn: false, delivered: false, late: false },
    ]);
  });
});

describe('buildDogfoodReport', () => {
  it('combines briefing rate, audit, approval latency and adoption', () => {
    const db = openCoreDb(':memory:');
    const now = Date.parse('2026-10-03T05:00:00Z'); // 12:00 WIB 3 Okt
    markUptime(db, Date.parse('2026-10-02T01:00:00Z'), TZ); // 08:00 WIB 2 Okt
    markUptime(db, Date.parse('2026-10-03T01:00:00Z'), TZ); // 08:00 WIB 3 Okt
    markUptime(db, Date.parse('2026-10-03T01:10:00Z'), TZ); // jam sama, tidak dobel
    db.prepare(`INSERT INTO approvals (id, created_at, profile, task_id, session_id, tool_call_id, mode, rule_id, tool, args_preview, args_hash, reason, status, decided_by, decided_at)
                VALUES ('a1', ?, 'dev', NULL, 's', 'c', 'park', 'git-push', 'terminal', '{}', 'h', NULL, 'denied', 'office', ?)`)
      .run(Date.parse('2026-10-02T02:00:00Z'), Date.parse('2026-10-02T02:10:00Z'));
    db.prepare(`INSERT INTO events (id, ts, type, profile, session_id, task_id, mode, payload) VALUES ('e1', ?, 'session.started', 'chief', 's', NULL, 'telegram', '{}')`)
      .run(Date.parse('2026-10-02T03:00:00Z'));
    const execs = [exec('2026-10-02T00:00:00+00:00', '2026-10-02T07:00:30+07:00')];
    const r = buildDogfoodReport(db, execs, 2, now, TZ);
    expect([r.from, r.to]).toEqual(['2026-10-02', '2026-10-03']);
    expect(r.briefing).toMatchObject({ onDays: 2, delivered: 1, rate: 0.5 });
    expect(r.security).toEqual({ checked: 0, violations: 0 });
    expect(r.approvals).toEqual({ decided: 1, medianMinutes: 10 });
    expect(r.adoption).toEqual({ activeDays: 1 });
    expect(r.gate).toEqual({ enoughData: false, briefingOk: false, securityOk: true });
  });
});
```

  Sebelum menulis INSERT approvals, periksa kolom tabel `approvals` di `apps/core/src/db.ts`. Bila ada kolom wajib lain (NOT NULL tanpa default), tambahkan nilainya di INSERT test. Daftar kolom di atas mengikuti `createParkApproval` (`approvals.ts:85`) plus `decided_by`/`decided_at`.

- [ ] **Step 3: Jalankan, pastikan gagal.** `pnpm -F @aos/core exec vitest run test/dogfood.test.ts` → FAIL.

- [ ] **Step 4: Implementasi** `apps/core/src/dogfood.ts`:

```ts
import { auditRiskyActions } from './audit.js';
import type { Db } from './db.js';
import { localStamp } from './kanbanActions.js';

/** Dogfooding evidence for the F1 release gate (PRD §14.1). */
export interface ExecutionRow {
  source: string;
  status: string;
  claimed_at: string;
  scheduled_instant: string | null;
  delivery_outcome: string | null;
}

export interface DayBriefing {
  day: string;
  morningOn: boolean;
  delivered: boolean;
  late: boolean;
}

export interface DogfoodReport {
  from: string;
  to: string;
  briefing: { onDays: number; delivered: number; rate: number | null; perDay: DayBriefing[] };
  security: { checked: number; violations: number };
  approvals: { decided: number; medianMinutes: number | null };
  adoption: { activeDays: number };
  gate: { enoughData: boolean; briefingOk: boolean | null; securityOk: boolean };
}

const DAY_MS = 86_400_000;
const LATE_MS = 5 * 60_000;
const GATE_DAYS = 14;

function dayOf(ms: number, timeZone: string): string {
  const s = localStamp(ms, timeZone);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function hourOf(ms: number, timeZone: string): number {
  return Number(localStamp(ms, timeZone).slice(9, 11));
}

/** Records that Core (hence the PC) was on during this local hour. */
export function markUptime(db: Db, now: number, timeZone: string): void {
  db.prepare('INSERT OR IGNORE INTO uptime (day, hour) VALUES (?, ?)').run(dayOf(now, timeZone), hourOf(now, timeZone));
}

export function briefingDays(execs: ExecutionRow[], mornings: Set<string>, days: string[], timeZone: string): DayBriefing[] {
  return days.map((day) => {
    let delivered = false;
    let late = false;
    for (const e of execs) {
      if (e.source !== 'builtin' || !e.scheduled_instant) continue;
      const slot = Date.parse(e.scheduled_instant);
      if (dayOf(slot, timeZone) !== day || e.status !== 'completed' || e.delivery_outcome !== 'delivered') continue;
      delivered = true;
      late = Date.parse(e.claimed_at) - slot > LATE_MS;
    }
    return { day, morningOn: mornings.has(day) || delivered, delivered, late };
  });
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function buildDogfoodReport(db: Db, execs: ExecutionRow[], days: number, now: number, timeZone: string): DogfoodReport {
  const dayList = Array.from({ length: days }, (_, i) => dayOf(now - (days - 1 - i) * DAY_MS, timeZone));
  const since = now - days * DAY_MS;
  const mornings = new Set(
    (db.prepare('SELECT day FROM uptime WHERE hour >= 7 AND hour < 12 AND day >= ?').all(dayList[0]) as Array<{ day: string }>).map((r) => r.day),
  );
  const perDay = briefingDays(execs, mornings, dayList, timeZone);
  const onDays = perDay.filter((d) => d.morningOn).length;
  const delivered = perDay.filter((d) => d.morningOn && d.delivered).length;
  const rate = onDays > 0 ? delivered / onDays : null;
  const audit = auditRiskyActions(db, since);
  const decided = db
    .prepare(`SELECT created_at, decided_at FROM approvals WHERE decided_at IS NOT NULL AND created_at >= ? AND decided_by NOT IN ('timeout', 'hermes')`)
    .all(since) as Array<{ created_at: number; decided_at: number }>;
  const minutes = decided.map((a) => (a.decided_at - a.created_at) / 60_000);
  const active = new Set(
    (db.prepare(`SELECT ts FROM events WHERE ts >= ? AND mode IN ('telegram', 'tui')`).all(since) as Array<{ ts: number }>).map((r) => dayOf(r.ts, timeZone)),
  );
  return {
    from: dayList[0],
    to: dayList[dayList.length - 1],
    briefing: { onDays, delivered, rate, perDay },
    security: { checked: audit.checked, violations: audit.violations.length },
    approvals: { decided: decided.length, medianMinutes: median(minutes) },
    adoption: { activeDays: active.size },
    gate: { enoughData: onDays >= GATE_DAYS, briefingOk: rate === null ? null : rate >= 0.95, securityOk: audit.violations.length === 0 },
  };
}
```

- [ ] **Step 5: Rute, uptime, pembaca executions.**
  - **`server.ts`.** Tambahkan `readBriefingExecutions?: () => ExecutionRow[];` ke `ServerDeps` (import type dari `./dogfood.js`), lalu rute:

```ts
  app.get('/v1/dogfood', { preHandler: requireOwner }, async (req, reply) => {
    const days = Number((req.query as Record<string, string | undefined>).days ?? 14);
    if (!Number.isInteger(days) || days < 1 || days > 60) return reply.code(400).send({ error: 'days must be 1-60' });
    return buildDogfoodReport(deps.db, deps.readBriefingExecutions?.() ?? [], days, now(), deps.timeZone ?? 'Asia/Jakarta');
  });
```

  - **`main.ts`.** Import `markUptime` dan `type ExecutionRow` dari `./dogfood.js`, serta `Database` dari `better-sqlite3`. Lalu tambahkan:

```ts
function readBriefingExecutions(): ExecutionRow[] {
  const cronDir = join(config.hermesHome, 'profiles', 'chief', 'cron');
  try {
    const jobsDoc = JSON.parse(readFileSync(join(cronDir, 'jobs.json'), 'utf8')) as { jobs?: Array<{ id: string; name: string }> };
    const job = (jobsDoc.jobs ?? []).find((j) => j.name === 'morning-briefing');
    if (!job || !existsSync(join(cronDir, 'executions.db'))) return [];
    const execDb = new Database(join(cronDir, 'executions.db'), { readonly: true, fileMustExist: true });
    try {
      return execDb
        .prepare('SELECT source, status, claimed_at, scheduled_instant, delivery_outcome FROM executions WHERE job_id = ?')
        .all(job.id) as ExecutionRow[];
    } finally {
      execDb.close();
    }
  } catch (err) {
    log(`read briefing executions failed: ${(err as Error).message}`);
    return [];
  }
}

safely('uptime', () => markUptime(db, Date.now(), config.timeZone));
setInterval(() => safely('uptime', () => markUptime(db, Date.now(), config.timeZone)), 600_000);
```

    Tambahkan `readBriefingExecutions,` ke `buildServer`. Bila signature `safely` di `main.ts` berbeda (`safely(label, fn)`), sesuaikan pemanggilannya.
  - **`packages/setup/src/cli.ts`.** Kasus baru:

```ts
    case 'dogfood-report': {
      const days = Number(process.argv[3] ?? 14);
      const res = await fetch(`${coreUrl}/v1/dogfood?days=${days}`, { headers: { authorization: `Bearer ${required('AOS_UI_TOKEN')}` } });
      if (!res.ok) {
        console.error(`Laporan gagal: HTTP ${res.status}`);
        return 1;
      }
      const r = (await res.json()) as {
        from: string; to: string;
        briefing: { onDays: number; delivered: number; rate: number | null; perDay: Array<{ day: string; morningOn: boolean; delivered: boolean; late: boolean }> };
        security: { checked: number; violations: number };
        approvals: { decided: number; medianMinutes: number | null };
        adoption: { activeDays: number };
        gate: { enoughData: boolean; briefingOk: boolean | null; securityOk: boolean };
      };
      const pct = r.briefing.rate === null ? '-' : `${Math.round(r.briefing.rate * 100)}%`;
      console.log(`Dogfooding ${r.from} … ${r.to}`);
      for (const d of r.briefing.perDay) {
        const mark = !d.morningOn ? '·  PC mati pagi' : d.delivered ? (d.late ? '✓  terlambat' : '✓') : '✗  tidak terkirim';
        console.log(`  ${d.day}  ${mark}`);
      }
      console.log(`Briefing: ${r.briefing.delivered}/${r.briefing.onDays} hari PC menyala (${pct}; gate ≥ 95%)`);
      console.log(`Keamanan: ${r.security.violations} pelanggaran dari ${r.security.checked} keputusan (gate = 0)`);
      console.log(`Approval: ${r.approvals.decided} diputuskan, median ${r.approvals.medianMinutes === null ? '-' : `${r.approvals.medianMinutes.toFixed(1)} menit`} (target < 15)`);
      console.log(`Adopsi: ${r.adoption.activeDays} hari dipakai (Telegram/kantor)`);
      const verdict = !r.gate.enoughData ? 'BELUM CUKUP DATA (perlu 14 hari PC menyala)' : r.gate.briefingOk && r.gate.securityOk ? 'GATE F1 LULUS' : 'GATE F1 BELUM LULUS';
      console.log(verdict);
      return 0;
    }
```

- [ ] **Step 6: Test + typecheck.** `pnpm -F @aos/core test`, `pnpm -r typecheck` → PASS.

- [ ] **Step 7: Commit.** `git add apps/core/src/dogfood.ts apps/core/src/db.ts apps/core/src/server.ts apps/core/src/main.ts apps/core/test/dogfood.test.ts packages/setup/src/cli.ts` lalu `git commit -m "feat(core): uptime tracking and dogfooding gate report" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 6: Kantor — reduced motion (patch vendor P8)

**Files:**
- Modify: `apps/office/vendor/pixel-agents/webview-ui/src/office/engine/characters.ts`, `apps/office/vendor/pixel-agents/NOTICE.md`

- [ ] **Step 1: Patch.** Di `characters.ts`:
  - Setelah blok import, tambahkan:

```ts
// Agentic OS P8: honour prefers-reduced-motion — idle characters stay where they are instead of wandering.
const REDUCED_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

  - Di `case CharacterState.IDLE`, tepat sebelum komentar `// Countdown wander timer`, tambahkan:

```ts
      if (REDUCED_MOTION) break;
```

- [ ] **Step 2: NOTICE.** Tambahkan baris setelah P7:

```markdown
- P8 `webview-ui/src/office/engine/characters.ts`: bila `prefers-reduced-motion: reduce`, karakter idle tidak berkeliaran (tetap di tempat); animasi kerja (mengetik/membaca) tetap.
```

  Ubah kalimat upgrade menjadi "lalu terapkan ulang P1–P8."

- [ ] **Step 3: Verifikasi.** Jalankan `pnpm -F @aos/office typecheck`, `pnpm -F @aos/office test`, `pnpm office:build` → hijau. Muat preview dan pastikan karakter idle tetap berkeliaran (default tanpa reduced motion). Pengujian dengan reduced motion aktif butuh pengaturan sistem owner (Windows: Accessibility → Visual effects → Animation effects **Off**); minta owner bila ingin dicoba, jangan ubah pengaturan sistem sendiri.

- [ ] **Step 4: Commit.** `git add apps/office/vendor/pixel-agents/webview-ui/src/office/engine/characters.ts apps/office/vendor/pixel-agents/NOTICE.md` lalu `git commit -m "feat(office): keep idle characters still under prefers-reduced-motion (P8)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 7: Persona — reminder oleh chief

**Files:**
- Modify: `infra/profiles/soul/chief.md`, `infra/profiles/soul/secretary.md`

- [ ] **Step 1: chief.md.**
  - Di "Siapa mengerjakan apa", ganti baris secretary menjadi:
    `- secretary: catatan, jadwal, kerapian papan kanban, apa pun yang menyangkut data pribadi owner (reminder kamu buat sendiri, lihat di bawah).`
  - Tambahkan bagian baru sebelum "## Izin (approval)":

```markdown
## Reminder
- Hanya kamu yang punya Telegram, jadi reminder kamu buat sendiri (jangan didelegasikan).
- Jika owner meminta pengingat ("ingatkan aku ... <waktu>"): buat job dengan tool `cronjob` — jadwal sekali jalan pada waktu itu (zona Asia/Jakarta), `deliver` telegram, nama = isi pengingat singkat, prompt: `Kirim pengingat ini apa adanya ke owner: "<isi pengingat>"`.
- Untuk pengingat berulang ("tiap Senin jam 8") pakai jadwal cron yang sesuai.
- Balas owner satu baris: isi pengingat + waktu persisnya (hari, tanggal, jam).
- Jika waktu tidak jelas, tanya dulu; jangan menebak.
```

- [ ] **Step 2: secretary.md.** Ganti baris `- Reminder dibuat dengan tool cron (\`cronjob\`) memakai zona waktu Asia/Jakarta.` menjadi:
  `- Reminder dibuat oleh chief (hanya chief yang punya Telegram). Jika kartu memintamu membuat reminder, catat permintaannya di hasil kartu agar chief yang membuatnya.`
  Ubah juga kalimat pembuka menjadi "Kamu mengelola catatan, jadwal, dan kerapian papan kanban."

- [ ] **Step 3: Commit.** `git add infra/profiles/soul/chief.md infra/profiles/soul/secretary.md` lalu `git commit -m "feat(profiles): chief owns reminders because only chief has Telegram" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

---

### Task 8: Pemasangan, demo US-01…US-12 bersama owner, dokumentasi

- [ ] **Step 1: Siap merge.** Jalankan `pnpm -r test`, `pnpm -r typecheck`, `pnpm office:build`, `py -3 -m pytest packages tests/redteam -q` → hijau.

- [ ] **Step 2: Pasang (izin owner).**
  1. `pnpm aos apply-profiles` (SOUL baru + script `profiles\chief\scripts\briefing_context.py`).
  2. Restart gateway: `hermes gateway stop` lalu `explorer.exe ".../Hermes_Gateway_787a7c01.vbs"`.
  3. Ubah job briefing:

```bash
export HERMES_HOME='D:\agentic-os\hermes-home'; hermes -p chief cron edit c7efc0721f0e --script briefing_context.py --prompt "$(cat infra/profiles/cron/morning-briefing.md)"
```

  4. Restart Core via `explorer.exe` (rute + backup + alert + uptime).
  5. `pnpm aos doctor` → semua OK.

- [ ] **Step 3: Uji teknis.**
  - **B1 backup.** `pnpm aos backup` → file `D:\agentic-os\backups\aos-backup-<stamp>.zip`. Lalu:
    - `tar -tf <zip>` memuat `hermes-home/profiles/chief/SOUL.md` dan `core/core.db`;
    - tidak ada `.env`, `tools/`, `cache/`;
    - ukuran puluhan MB, bukan GB.
  - **B2 restore uji.** Ekstrak ke folder sementara; buka `hermes-home\kanban.db` dan `core\core.db` dengan better-sqlite3 (`SELECT count(*)`) → tidak korup. Hapus folder sementara.
  - **A1 alert.**
    - Hentikan 9Router sebentar (izin owner) → setelah ±90 detik Telegram menerima "⚠️ 9Router bermasalah…".
    - Nyalakan lagi lewat `9router.vbs` → "✅ 9Router pulih".
    - Bila owner tidak mau 9Router dimatikan, cukup bukti unit test.
  - **D1 laporan.** `pnpm aos dogfood-report 3` → tampil per hari (hari ini/kemarin), keamanan 0 pelanggaran, "BELUM CUKUP DATA".

- [ ] **Step 4: Demo US bersama owner.** Catat bukti tiap butir. Yang perlu aksi owner di Telegram ditandai (O).

  | US | Demo |
  |---|---|
  | US-01 | `hermes -p chief cron run c7efc0721f0e` (izin owner) → (O) owner menerima briefing dengan baris biaya kemarin, izin menunggu, dan penanda "(dijalankan manual)" |
  | US-02 | (O) owner: "ingatkan aku cek demo M6 <jam sekarang + 5 menit>" → chief membalas waktu persis → pengingat tiba di Telegram tepat waktu |
  | US-03/US-05 | (O) owner: "riset 3 alternatif open-source untuk Postiz, bikin tabel" → kartu `researcher` dengan acceptance criteria, `ready`, dikerjakan dispatcher |
  | US-04 | Bukti unit test `decide()` (terlambat sebelum 12:00 berlabel; setelah 12:00 / slot kemarin dilewati) + bukti V9 M1 (susulan Hermes). Simulasi PC mati 06:00–08:00 terjadi alami selama dogfooding dan tercatat di `dogfood-report` (`✓ terlambat`) |
  | US-06 | Kantor: karakter bekerja saat kartu US-03 berjalan; gelembung izin saat ada approval |
  | US-07 | Klik karakter → dock: Chat, Kartu, Aktivitas |
  | US-08 | Laci: seret kartu blocked → ready dengan instruksi |
  | US-09 | Approval dari HUD kantor dan dari Telegram (bukti M3/M5a + satu ulang bila owner mau) |
  | US-10 | Red-team 58/58 + `risk-audit` 0 pelanggaran |
  | US-11 | HUD biaya hari ini + panel rincian (per agent "shared", per model, per hari) |
  | US-12 | Sebagian: breaker jumlah tool call (red-team + uji M3); ambang token per kartu menunggu key per profile (keputusan owner) |

- [ ] **Step 5: Dokumentasi.**
  - **`docs/runbook.md`:**
    - §3: "Briefing pagi" (script, aturan terlambat/lewati, cara uji manual), "Backup & restore" (jadwal 23:30, retensi 14, isi, langkah restore lengkap termasuk mengisi ulang `.env` chief: `TELEGRAM_*` dan key lewat `set-local-secrets.ps1` + `apply-profiles`), "Alert", "Laporan dogfooding", reminder oleh chief.
    - §4: US-12 sebagian; reduced motion via pengaturan OS; backup tanpa `.env`.
    - §5: "Bukti M6 (teknis)" + tabel demo US.
  - **`docs/PRD-Agentic-OS.md`:**
    - §2.3 catatan US-02 (chief) dan US-12 (sebagian);
    - §5.4.1 modul `backup`, `alerts`, `dogfood`, `briefing`;
    - §5.4.2 rute baru;
    - §9 (backup terpasang; alert 9Router/kartu macet);
    - §13 M6: "kode selesai; dogfooding 14 hari berjalan sejak <tanggal>";
    - §16 butir 13 (demo US) terjawab.

- [ ] **Step 6: Commit docs**, lalu selesaikan branch (tawarkan opsi merge seperti milestone sebelumnya).

- [ ] **Step 7: Dogfooding 14 hari (di luar sesi ini).** Owner memakai sistem seperti biasa. Setelah 14 hari PC menyala: `pnpm aos dogfood-report 14` → bila "GATE F1 LULUS", tandai M6 ✅ di PRD §13 dan F1 rilis.

---

## Self-review

- **Cakupan spec:**
  - US-01 → T1+T2; US-02 → T7; US-04 → T2.
  - Backup §9 → T4; alert §9 → T3.
  - Reduced motion §5.5.6 → T6.
  - Gate §14 → T5.
  - Demo US → T8.
  - Playwright UI (§12) **tidak** dicakup (YAGNI untuk F1 personal; demo manual + unit test). Dicatat di §16 bila dibutuhkan.
- **Konsistensi tipe:**
  - `Briefing` (T1) dipakai script T2 dengan kunci yang sama (`today.byAgent`, `blocked.items`, `approvals.items`, `doneYesterday`, `costYesterday`).
  - `BackupResult` dipakai `server.ts`/`main.ts`/CLI.
  - `ExecutionRow`/`DogfoodReport` dipakai rute dan CLI.
