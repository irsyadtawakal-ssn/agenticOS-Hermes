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
