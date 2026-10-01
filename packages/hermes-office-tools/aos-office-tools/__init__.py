"""Agentic OS office tools: create/list kanban tasks through the official `hermes kanban` CLI."""
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

ALLOWED_ASSIGNEES = ("chief", "researcher", "secretary", "content", "dev")
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


def _run(args):
    exe = shutil.which("hermes")
    if not exe:
        return 127, "", "hermes executable not found on PATH"
    try:
        proc = subprocess.run(
            [exe, *args], capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60
        )
    except subprocess.TimeoutExpired:
        return 124, "", "hermes timed out after 60s"
    except OSError as e:
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
    home = os.environ.get("HERMES_HOME")
    return ((Path(home) / "workspaces") if home else (Path.home() / "aos-workspaces")).absolute()


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


def register(ctx):
    ctx.register_tool(name="office_create_task", toolset="aos_office", schema=CREATE_SCHEMA, handler=handle_create)
    ctx.register_tool(name="office_list_tasks", toolset="aos_office", schema=LIST_SCHEMA, handler=handle_list)
