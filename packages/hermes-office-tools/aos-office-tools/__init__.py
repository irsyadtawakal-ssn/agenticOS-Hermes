"""Agentic OS office tools: create/list kanban tasks through the official `hermes kanban` CLI."""
import json
import os
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ALLOWED_ASSIGNEES = ("chief", "researcher", "secretary", "content", "dev")
try:
    _office_config = json.loads((Path(__file__).parent / "config.json").read_text(encoding="utf-8"))
    _assignees = _office_config.get("assignees")
    if isinstance(_assignees, list) and _assignees and all(isinstance(p, str) and re.fullmatch(r"[a-z][a-z0-9_-]{0,63}", p) for p in _assignees):
        ALLOWED_ASSIGNEES = tuple(_assignees)
except (OSError, ValueError):
    pass
ALLOWED_STATUSES = ("triage", "todo", "ready", "running", "blocked", "review", "done", "archived")

CREATE_SCHEMA = {
    "name": "office_create_task",
    "description": "Create a kanban task on the office board and assign it to a teammate. Returns CLI output containing the task id (t_...).",
    "parameters": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Verb + object, max 80 characters"},
            "assignee": {"type": "string", "enum": list(ALLOWED_ASSIGNEES)},
            "body": {"type": "string", "description": "Goal / Acceptance criteria / Inputs / Risk"},
        },
        "required": ["title", "assignee", "body"],
    },
}

LIST_SCHEMA = {
    "name": "office_list_tasks",
    "description": "List kanban tasks on the office board, optionally filtered by status or assignee.",
    "parameters": {
        "type": "object",
        "properties": {
            "status": {"type": "string", "description": "triage|todo|ready|running|blocked|review|done|archived"},
            "assignee": {"type": "string", "enum": list(ALLOWED_ASSIGNEES)},
        },
    },
}


def _agentic_root():
    """The Agentic OS HERMES_HOME this plugin is installed under (never the owner's other Hermes install)."""
    explicit = os.environ.get("AOS_HERMES_HOME")
    if explicit:
        return Path(explicit)
    # Installed layout: <root>/profiles/<profile>/plugins/aos-office-tools/__init__.py
    candidate = Path(__file__).resolve().parents[4]
    if (candidate / "profiles").is_dir():
        return candidate
    fallback = os.environ.get("HERMES_HOME")
    if fallback:
        return Path(fallback)
    return None


def _run(args):
    root = _agentic_root()
    if root is None:
        return 1, "", "cannot determine the Agentic OS HERMES_HOME (set AOS_HERMES_HOME)"
    exe = shutil.which("hermes")
    if not exe:
        return 127, "", "hermes executable not found on PATH"
    try:
        proc = subprocess.run(
            [exe, *args],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            env={**os.environ, "HERMES_HOME": str(root)},
        )
    except subprocess.TimeoutExpired:
        return 124, "", "hermes timed out after 60s"
    except (OSError, ValueError) as e:
        return 1, "", str(e)
    return proc.returncode, proc.stdout, proc.stderr


def _result(code, out, err):
    if code != 0:
        return json.dumps({"success": False, "error": (err or out).strip()[:500]})
    return json.dumps({"success": True, "output": out.strip()[:2000]})


def _workspaces_root():
    root = os.environ.get("AOS_WORKSPACES_ROOT")
    if root:
        return Path(root).absolute()
    root = _agentic_root()
    return ((root / "workspaces") if root else (Path.home() / "aos-workspaces")).absolute()


def _new_workspace(title):
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40] or "task"
    path = _workspaces_root() / f"{time.strftime('%Y%m%d-%H%M%S')}-{slug}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _bad_params():
    return json.dumps({"success": False, "error": "params must be an object"})


def handle_create(params, **kwargs):
    if not isinstance(params, dict):
        return _bad_params()
    title = str(params.get("title", "")).strip()[:80]
    assignee = params.get("assignee")
    body = str(params.get("body", ""))
    if not title:
        return json.dumps({"success": False, "error": "title is required"})
    if assignee not in ALLOWED_ASSIGNEES:
        return json.dumps({"success": False, "error": f"assignee must be one of {', '.join(ALLOWED_ASSIGNEES)}"})
    try:
        workspace = _new_workspace(title)
    except OSError as e:
        return json.dumps({"success": False, "error": f"cannot create workspace: {e}"})
    code, out, err = _run(
        ["kanban", "create", "--assignee", assignee, f"--body={body}", "--workspace", f"dir:{workspace}", "--", title]
    )
    if code != 0:
        try:
            os.rmdir(workspace)
        except OSError:
            pass
        return _result(code, out, err)
    return json.dumps({"success": True, "output": out.strip()[:2000], "workspace": str(workspace)})


def handle_list(params, **kwargs):
    if not isinstance(params, dict):
        return _bad_params()
    args = ["kanban", "list"]
    status = params.get("status")
    if status:
        if status not in ALLOWED_STATUSES:
            return json.dumps({"success": False, "error": f"status must be one of {', '.join(ALLOWED_STATUSES)}"})
        args.append(f"--status={status}")
    assignee = params.get("assignee")
    if assignee:
        if assignee not in ALLOWED_ASSIGNEES:
            return json.dumps({"success": False, "error": f"assignee must be one of {', '.join(ALLOWED_ASSIGNEES)}"})
        args.append(f"--assignee={assignee}")
    return _result(*_run(args))


APPROVAL_STATUSES = ("pending", "approved", "denied", "expired", "consumed")
_APPROVAL_ID = re.compile(r"^[a-z2-9]{6}$")
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_APPROVAL_FIELDS = ("id", "profile", "task_id", "tool", "args_preview", "rule_id", "status", "created_at")

LIST_APPROVALS_SCHEMA = {
    "name": "office_list_approvals",
    "description": "List approval requests from agents that wait for the owner's decision (default: pending).",
    "parameters": {
        "type": "object",
        "properties": {"status": {"type": "string", "enum": list(APPROVAL_STATUSES)}},
    },
}

APPROVE_SCHEMA = {
    "name": "office_approve",
    "description": (
        "Record the owner's decision on an agent approval request. Use ONLY when the owner's latest message "
        "explicitly approves or denies this exact id. Approving shows the owner a confirmation button."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "approval_id": {"type": "string", "description": "6-character id from the notification, e.g. a7k2qd"},
            "decision": {"type": "string", "enum": ["approve", "deny"]},
            "note": {"type": "string", "description": "Optional instruction or reason from the owner"},
        },
        "required": ["approval_id", "decision"],
    },
}


def _plugin_dir():
    return Path(__file__).resolve().parent


def _core_settings():
    try:
        cfg = json.loads((_plugin_dir() / "config.json").read_text(encoding="utf-8"))
    except Exception:
        cfg = {}
    if not isinstance(cfg, dict):
        cfg = {}
    return str(cfg.get("core_url") or "http://127.0.0.1:7400").rstrip("/"), str(cfg.get("token") or "")


def _http(method, url, token, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method, headers={"content-type": "application/json", "authorization": f"Bearer {token}"})
    try:
        with _OPENER.open(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8") or "null")
    except urllib.error.HTTPError as e:
        try:
            payload = json.loads(e.read().decode("utf-8") or "null")
        except Exception:
            payload = None
        return e.code, payload
    except Exception as e:
        return 0, {"error": f"OS Core unreachable: {e}"}


def _core(method, path, body=None):
    base, token = _core_settings()
    if not token:
        return None, "approver token missing in aos-office-tools config.json (run pnpm aos apply-profiles)"
    code, payload = _http(method, base + path, token, body)
    if code == 200:
        return payload, None
    if code == 404:
        return None, "approval not found"
    if code == 409:
        return None, "approval is no longer pending"
    if code == 0:
        return None, str((payload or {}).get("error") or "OS Core unreachable")
    return None, f"OS Core returned HTTP {code}"


def handle_list_approvals(params, **kwargs):
    if not isinstance(params, dict):
        return _bad_params()
    status = params.get("status") or "pending"
    if status not in APPROVAL_STATUSES:
        return json.dumps({"success": False, "error": f"status must be one of {', '.join(APPROVAL_STATUSES)}"})
    payload, error = _core("GET", f"/v1/approvals?status={status}")
    if error:
        return json.dumps({"success": False, "error": error})
    items = [{k: a.get(k) for k in _APPROVAL_FIELDS} for a in (payload or []) if isinstance(a, dict)]
    return json.dumps({"success": True, "approvals": items}, ensure_ascii=False)


def handle_approve(params, **kwargs):
    if not isinstance(params, dict):
        return _bad_params()
    approval_id = str(params.get("approval_id") or "").strip().lower()
    decision = params.get("decision")
    if not _APPROVAL_ID.match(approval_id):
        return json.dumps({"success": False, "error": "approval_id must be the 6-character id from the notification"})
    if decision not in ("approve", "deny"):
        return json.dumps({"success": False, "error": "decision must be exactly 'approve' or 'deny'"})
    body = {"decision": decision}
    note = str(params.get("note") or "").strip()[:500]
    if note:
        body["note"] = note
    body["by"] = "chief"
    payload, error = _core("POST", f"/v1/approvals/{approval_id}/decision", body)
    if error:
        return json.dumps({"success": False, "error": error})
    return json.dumps({"success": True, "approval": {k: payload.get(k) for k in ("id", "status", "tool", "task_id")}}, ensure_ascii=False)


def register(ctx):
    ctx.register_tool(name="office_create_task", toolset="aos_office", schema=CREATE_SCHEMA, handler=handle_create)
    ctx.register_tool(name="office_list_tasks", toolset="aos_office", schema=LIST_SCHEMA, handler=handle_list)
    ctx.register_tool(name="office_list_approvals", toolset="aos_office", schema=LIST_APPROVALS_SCHEMA, handler=handle_list_approvals)
    ctx.register_tool(name="office_approve", toolset="aos_office", schema=APPROVE_SCHEMA, handler=handle_approve)
