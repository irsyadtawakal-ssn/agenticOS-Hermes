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
    (re.compile(r"(?i)(password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*\S+"), r"\1=[REDACTED]"),
]

_SENSITIVE_KEYS = {"key", "token", "secret", "password", "passwd", "authorization", "cookie"}


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


def _redact_keys(obj):
    """Recursively redact values of sensitive keys in dicts before JSON serialization."""
    if isinstance(obj, dict):
        result = {}
        for k, v in obj.items():
            if any(sk in k.lower() for sk in _SENSITIVE_KEYS):
                result[k] = "[REDACTED]"
            elif isinstance(v, dict):
                result[k] = _redact_keys(v)
            elif isinstance(v, list):
                result[k] = [_redact_keys(item) if isinstance(item, dict) else item for item in v]
            else:
                result[k] = v
        return result
    return obj


def preview(value, limit=200):
    if isinstance(value, dict):
        value = _redact_keys(value)
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    text = redact(text)
    return text if len(text) <= limit else text[: limit - 1] + "…"


def profile_name(plugin_file):
    parts = Path(plugin_file).parts
    if len(parts) >= 5 and parts[-3].lower() == "plugins" and parts[-5].lower() == "profiles":
        return parts[-4]
    if len(parts) >= 4 and parts[-3].lower() == "plugins":
        return "default"
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
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class Transport:
    def __init__(self, url, token, spool_dir, send=None, batch_size=50):
        self._url = url.rstrip("/") + "/v1/events"
        self._token = token
        self._spool_dir = Path(spool_dir)
        self._own = self._spool_dir / f"{os.getpid()}.jsonl"
        self._send = send or self._http_send
        self._batch_size = batch_size
        self._queue = queue.Queue(maxsize=5000)
        self._lock = threading.Lock()
        self._thread = None
        self._next_attempt = 0.0  # Backoff time
        self._backoff_delay = 1.0  # Start at 1s

    def enqueue(self, event):
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            pass

    def _http_send(self, events):
        body = json.dumps(events, ensure_ascii=False, default=str).encode("utf-8")
        req = urllib.request.Request(
            self._url, data=body, method="POST",
            headers={"content-type": "application/json", "x-aos-bridge-token": self._token},
        )
        try:
            resp = _OPENER.open(req, timeout=2)
            result = 200 <= resp.status < 300
            resp.close()
            return result
        except Exception:
            return False

    def _read_spool_file(self, path):
        """Read spool file, skipping corrupt lines."""
        try:
            if not path.exists():
                return []
            events = []
            for line in path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    pass  # Skip corrupt lines
            return events
        except Exception:
            return []

    def _write_spool_file(self, path, events):
        """Atomically write spool file."""
        try:
            if not events:
                path.write_text("", encoding="utf-8")
                return
            self._spool_dir.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            with tmp.open("w", encoding="utf-8") as f:
                for event in events:
                    f.write(json.dumps(event, ensure_ascii=False, default=str) + "\n")
            os.replace(tmp, path)
        except Exception:
            pass

    def _append_to_spool(self, path, events):
        """Append events to spool file if total spool size allows."""
        try:
            total_size = sum(f.stat().st_size for f in self._spool_dir.glob("*.jsonl") if f.exists())
            if total_size > _MAX_SPOOL_BYTES:
                return
            self._spool_dir.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as f:
                for event in events:
                    f.write(json.dumps(event, ensure_ascii=False, default=str) + "\n")
        except Exception:
            pass

    def _adopt_orphan(self, now):
        """Adopt oldest orphan file (mtime > 60s old)."""
        try:
            own_pid = os.getpid()
            for f in sorted(self._spool_dir.glob("*.jsonl")):
                # Skip own files (pid or pid-adopt)
                if f.name.startswith(f"{own_pid}"):
                    continue
                mtime = f.stat().st_mtime
                age = now - mtime
                if age >= 60:
                    # Adopt this file
                    adopt_num = 0
                    new_name = self._spool_dir / f"{own_pid}-adopt-{adopt_num}.jsonl"
                    while new_name.exists():
                        adopt_num += 1
                        new_name = self._spool_dir / f"{own_pid}-adopt-{adopt_num}.jsonl"
                    try:
                        os.replace(f, new_name)
                        return new_name
                    except (OSError, FileExistsError):
                        continue
        except Exception:
            pass
        return None

    def flush_once(self, now=None):
        if now is None:
            now = time.monotonic()

        with self._lock:
            # Check backoff
            if now < self._next_attempt:
                # Still backing off; move queued events to spool and return 0
                batch = []
                while len(batch) < self._batch_size:
                    try:
                        batch.append(self._queue.get_nowait())
                    except queue.Empty:
                        break
                if batch:
                    self._append_to_spool(self._own, batch)
                return 0

            # Collect batch from queue
            batch = []
            while len(batch) < self._batch_size:
                try:
                    batch.append(self._queue.get_nowait())
                except queue.Empty:
                    break

            # Read own spool file
            spooled = self._read_spool_file(self._own)

            # Try to adopt an orphan if own spool is empty
            if not spooled:
                adopted = self._adopt_orphan(now)
                if adopted:
                    spooled = self._read_spool_file(adopted)
                    if spooled:
                        self._own = adopted

            # Collect events: spooled + new batch, up to batch_size
            events = (spooled + batch)[: self._batch_size]
            remaining = (spooled + batch)[self._batch_size :]

            if not events:
                return 0

            # Try to send
            try:
                delivered = bool(self._send(events))
            except Exception:
                delivered = False

            if delivered:
                # Success: rewrite spool with remaining events
                if remaining:
                    self._write_spool_file(self._own, remaining)
                else:
                    self._write_spool_file(self._own, [])
                self._backoff_delay = 1.0  # Reset backoff
                return len(events)
            else:
                # Failure: append new batch to spool, enter backoff
                if batch:
                    self._append_to_spool(self._own, batch)
                self._next_attempt = now + self._backoff_delay
                self._backoff_delay = min(self._backoff_delay * 2, 30.0)
                return 0

    def start(self):
        if self._thread is not None:
            return

        def loop():
            while True:
                try:
                    time.sleep(0.5)
                    self.flush_once()
                except Exception:
                    pass

        self._thread = threading.Thread(target=loop, name="aos-os-bridge", daemon=True)
        self._thread.start()

        def drain_at_exit():
            start_time = time.monotonic()
            while time.monotonic() - start_time < 3:
                if self.flush_once() == 0:
                    break
                time.sleep(0.1)
            # Append any remaining queue to own spool
            remaining = []
            while True:
                try:
                    remaining.append(self._queue.get_nowait())
                except queue.Empty:
                    break
            if remaining:
                self._append_to_spool(self._own, remaining)

        atexit.register(drain_at_exit)


def load_settings(plugin_dir, env=None):
    env = os.environ if env is None else env
    plugin_dir = Path(plugin_dir)
    file_cfg = {}
    try:
        cfg = json.loads((plugin_dir / "config.json").read_text(encoding="utf-8"))
        if isinstance(cfg, dict):
            file_cfg = cfg
    except Exception:
        file_cfg = {}
    return {
        "core_url": env.get("AOS_CORE_URL") or file_cfg.get("core_url") or DEFAULT_CORE_URL,
        "token": env.get("AOS_BRIDGE_TOKEN") or file_cfg.get("token") or "",
        "spool": plugin_dir / "spool",
    }


_TRANSPORT = None
_TRANSPORT_LOCK = threading.Lock()


def _transport():
    global _TRANSPORT
    if _TRANSPORT is None:
        with _TRANSPORT_LOCK:
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
