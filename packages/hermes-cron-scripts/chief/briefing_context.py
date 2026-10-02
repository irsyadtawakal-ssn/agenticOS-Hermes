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
