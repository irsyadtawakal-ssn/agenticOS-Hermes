"""Agentic OS bridge: forwards Hermes lifecycle and tool events to OS Core.

Never blocks a tool, never raises into Hermes, never forwards message/result content.
"""
import atexit
import json
import os
import queue
import re
import threading
import time
import urllib.request
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


DEFAULT_CORE_URL = "http://127.0.0.1:7400"
HOOKS = ["on_session_start", "on_session_end", "pre_llm_call", "post_llm_call", "pre_tool_call", "post_tool_call"]
_MAX_SPOOL_BYTES = 5 * 1024 * 1024


class Transport:
    def __init__(self, url, token, spool_path, send=None, batch_size=50):
        self._url = url.rstrip("/") + "/v1/events"
        self._token = token
        self._spool = Path(spool_path)
        self._send = send or self._http_send
        self._batch_size = batch_size
        self._queue = queue.Queue(maxsize=5000)
        self._lock = threading.Lock()
        self._thread = None

    def enqueue(self, event):
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            pass

    def _http_send(self, events):
        body = json.dumps(events, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            self._url, data=body, method="POST",
            headers={"content-type": "application/json", "x-aos-bridge-token": self._token},
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            return 200 <= resp.status < 300

    def _read_spool(self):
        try:
            if not self._spool.exists():
                return []
            return [json.loads(line) for line in self._spool.read_text(encoding="utf-8").splitlines() if line.strip()]
        except Exception:
            return []

    def _append_spool(self, events):
        try:
            if self._spool.exists() and self._spool.stat().st_size > _MAX_SPOOL_BYTES:
                return
            self._spool.parent.mkdir(parents=True, exist_ok=True)
            with self._spool.open("a", encoding="utf-8") as f:
                for event in events:
                    f.write(json.dumps(event, ensure_ascii=False) + "\n")
        except Exception:
            pass

    def _clear_spool(self):
        try:
            self._spool.write_text("", encoding="utf-8")
        except Exception:
            pass

    def flush_once(self):
        with self._lock:
            batch = []
            while len(batch) < self._batch_size:
                try:
                    batch.append(self._queue.get_nowait())
                except queue.Empty:
                    break
            spooled = self._read_spool()
            events = spooled + batch
            if not events:
                return 0
            try:
                delivered = bool(self._send(events))
            except Exception:
                delivered = False
            if delivered:
                if spooled:
                    self._clear_spool()
                return len(events)
            if batch:
                self._append_spool(batch)
            return 0

    def start(self):
        if self._thread is not None:
            return

        def loop():
            while True:
                time.sleep(0.5)
                self.flush_once()

        self._thread = threading.Thread(target=loop, name="aos-os-bridge", daemon=True)
        self._thread.start()
        atexit.register(self.flush_once)


def load_settings(plugin_dir, env=None):
    env = os.environ if env is None else env
    plugin_dir = Path(plugin_dir)
    file_cfg = {}
    try:
        file_cfg = json.loads((plugin_dir / "config.json").read_text(encoding="utf-8"))
    except Exception:
        file_cfg = {}
    return {
        "core_url": env.get("AOS_CORE_URL") or file_cfg.get("core_url") or DEFAULT_CORE_URL,
        "token": env.get("AOS_BRIDGE_TOKEN") or file_cfg.get("token") or "",
        "spool": plugin_dir / "spool.jsonl",
    }


_TRANSPORT = None


def _transport():
    global _TRANSPORT
    if _TRANSPORT is None:
        settings = load_settings(Path(__file__).resolve().parent)
        _TRANSPORT = Transport(settings["core_url"], settings["token"], settings["spool"])
        _TRANSPORT.start()
    return _TRANSPORT


def _make_hook(hook, profile):
    def callback(*args, **kwargs):
        try:
            event = build_event(hook, kwargs, profile)
            if event is not None:
                _transport().enqueue(event)
        except Exception:
            pass
        return None

    return callback


def register(ctx):
    profile = profile_name(str(Path(__file__).resolve()))
    for hook in HOOKS:
        try:
            ctx.register_hook(hook, _make_hook(hook, profile))
        except Exception:
            pass
