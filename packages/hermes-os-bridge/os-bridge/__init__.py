"""Agentic OS bridge: forwards Hermes lifecycle and tool events to OS Core.

Never blocks a tool, never raises into Hermes, never forwards message/result content.
"""
import json
import os
import re
import time
import uuid
from pathlib import Path

READ_TOOLS = {
    "web_search", "web_extract", "read_file", "search_files", "session_search", "vision_analyze",
    "skills_list", "skill_view", "kanban_show", "kanban_list", "kanban_attachments", "office_list_tasks",
    "browser_snapshot", "browser_get_images", "browser_vision", "browser_console",
}
WRITE_TOOLS = {
    "write_file", "patch", "memory", "todo_list", "skill_manage", "cronjob_manage", "office_create_task",
    "kanban_complete", "kanban_block", "kanban_comment", "kanban_create", "kanban_link", "kanban_unblock",
    "kanban_attach", "kanban_attach_url", "kanban_heartbeat", "kanban_request_review", "kanban_request_changes",
}
RUN_TOOLS = {
    "terminal", "process_manage", "execute_code", "computer_use", "delegate_task",
    "browser_navigate", "browser_click", "browser_type", "browser_scroll", "browser_back",
    "browser_press", "browser_exec", "browser_cdp", "browser_dialog",
}

_SECRET_PATTERNS = [
    (re.compile(r"(?i)(bearer\s+)[A-Za-z0-9._\-]{16,}"), r"\1[REDACTED]"),
    (re.compile(r"sk-[A-Za-z0-9_\-]{8,}"), "[REDACTED]"),
    (re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"), "[REDACTED]"),
    (re.compile(r"xox[abprs]-[A-Za-z0-9\-]{10,}"), "[REDACTED]"),
    (re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"), "[REDACTED]"),
    (re.compile(r"\b\d{6,}:[A-Za-z0-9_\-]{30,}"), "[REDACTED]"),
    (re.compile(r"\b[a-fA-F0-9]{32,}\b"), "[REDACTED]"),
]


def tool_category(name):
    if name in READ_TOOLS:
        return "read"
    if name in WRITE_TOOLS:
        return "write"
    if name in RUN_TOOLS:
        return "run"
    return "other"


def redact(text):
    for pattern, replacement in _SECRET_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def preview(value, limit=200):
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    text = redact(text)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def profile_name(plugin_file):
    parts = Path(plugin_file).parts
    if len(parts) >= 4 and parts[-3].lower() == "plugins":
        return parts[-4]
    return "unknown"


def _payload(hook, kwargs):
    name = kwargs.get("tool_name") or "?"
    if hook == "on_session_start":
        return "session.started", {"model": kwargs.get("model"), "platform": kwargs.get("platform")}
    if hook == "on_session_end":
        keys = ("completed", "failed", "interrupted", "turn_exit_reason")
        return "session.ended", {k: kwargs.get(k) for k in keys}
    if hook == "pre_llm_call":
        return "llm.started", {"turn_id": kwargs.get("turn_id"), "model": kwargs.get("model")}
    if hook == "post_llm_call":
        return "llm.finished", {"turn_id": kwargs.get("turn_id")}
    if hook == "pre_tool_call":
        return "tool.started", {
            "tool": name,
            "category": tool_category(name),
            "tool_call_id": kwargs.get("tool_call_id"),
            "args_preview": preview(kwargs.get("args") or {}),
        }
    if hook == "post_tool_call":
        return "tool.finished", {
            "tool": name,
            "category": tool_category(name),
            "tool_call_id": kwargs.get("tool_call_id"),
            "duration_ms": kwargs.get("duration_ms"),
            "status": kwargs.get("status"),
            "error_type": kwargs.get("error_type"),
        }
    return None


def build_event(hook, kwargs, profile, env=None, ts_ms=None):
    built = _payload(hook, kwargs)
    if built is None:
        return None
    event_type, payload = built
    env = os.environ if env is None else env
    task_id = env.get("HERMES_KANBAN_TASK") or None
    platform = kwargs.get("platform")
    mode = "kanban" if task_id else (str(platform) if platform else "interactive")
    return {
        "id": uuid.uuid4().hex,
        "ts": int(time.time() * 1000) if ts_ms is None else ts_ms,
        "type": event_type,
        "profile": profile,
        "session_id": kwargs.get("session_id"),
        "task_id": task_id,
        "mode": mode,
        "payload": payload,
    }
