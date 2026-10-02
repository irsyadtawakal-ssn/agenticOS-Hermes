"""Agentic OS bridge: enforces the tool policy in pre_tool_call and forwards lifecycle events to OS Core.

Never raises into Hermes. Fails closed for non-read tools when the policy check cannot run.
Never forwards message/result content.
"""
import atexit
import hashlib
import importlib.util
import json
import os
import queue
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

READ_TOOLS = {
    "web_search", "web_extract", "read_file", "search_files", "session_search", "vision_analyze",
    "skills_list", "skill_view", "kanban_show", "kanban_list", "kanban_attachments", "office_list_tasks",
    "office_list_approvals", "browser_snapshot", "browser_get_images", "browser_vision", "browser_console",
}
WRITE_TOOLS = {
    "write_file", "patch", "memory", "todo_list", "skill_manage", "cronjob_manage", "office_create_task", "office_approve",
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
            key_str = str(k).lower()
            if any(sk in key_str for sk in _SENSITIVE_KEYS):
                result[k] = "[REDACTED]"
            elif isinstance(v, dict):
                result[k] = _redact_keys(v)
            elif isinstance(v, list):
                result[k] = [_redact_keys(item) if isinstance(item, (dict, list)) else item for item in v]
            else:
                result[k] = v
        return result
    elif isinstance(obj, list):
        return [_redact_keys(item) if isinstance(item, (dict, list)) else item for item in obj]
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


_SESSION_PLATFORMS = {}


def remember_platform(session_id, platform, platforms=None):
    platforms = _SESSION_PLATFORMS if platforms is None else platforms
    if not session_id or not platform:
        return
    if session_id not in platforms and len(platforms) >= 1000:
        platforms.pop(next(iter(platforms)))
    platforms[session_id] = str(platform)


def make_event(event_type, payload, profile, session_id, platform=None, env=None, ts_ms=None):
    env = os.environ if env is None else env
    task_id = env.get("HERMES_KANBAN_TASK") or None
    mode = "kanban" if task_id else (str(platform) if platform else "interactive")
    return {
        "id": uuid.uuid4().hex,
        "ts": int(time.time() * 1000) if ts_ms is None else ts_ms,
        "type": event_type,
        "profile": profile,
        "session_id": session_id,
        "task_id": task_id,
        "mode": mode,
        "payload": payload,
    }


_POLICY_FIELDS = ("decision", "rule_id", "args_hash", "approval_id")


def build_event(hook, kwargs, profile, env=None, ts_ms=None, policy=None, platforms=None):
    built = _payload(hook, kwargs)
    if built is None:
        return None
    event_type, payload = built
    if policy and hook == "pre_tool_call":
        payload["policy"] = {k: policy[k] for k in _POLICY_FIELDS if policy.get(k) is not None}
    platforms = _SESSION_PLATFORMS if platforms is None else platforms
    session_id = kwargs.get("session_id")
    platform = kwargs.get("platform") or platforms.get(session_id)
    return make_event(event_type, payload, profile, session_id, platform, env, ts_ms)


DEFAULT_CORE_URL = "http://127.0.0.1:7400"
HOOKS = ["on_session_start", "on_session_end", "pre_llm_call", "post_llm_call", "pre_tool_call", "post_tool_call"]
_MAX_SPOOL_BYTES = 5 * 1024 * 1024
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def _load_sibling(name):
    path = Path(__file__).resolve().parent / f"{name}.py"
    module_name = f"aos_os_bridge_{name}_{hashlib.sha1(str(path).encode('utf-8')).hexdigest()[:10]}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


try:
    _policy = _load_sibling("policy")
except Exception:
    _policy = None


class CoreUnavailable(Exception):
    pass


class CoreClient:
    """Synchronous approval calls to OS Core (bridge token). Any failure raises CoreUnavailable."""

    def __init__(self, url, token, timeout=3.0):
        self._base = url.rstrip("/")
        self._token = token
        self._timeout = timeout

    def _call(self, method, path, body=None):
        data = None if body is None else json.dumps(body, ensure_ascii=False, default=str).encode("utf-8")
        req = urllib.request.Request(
            self._base + path, data=data, method=method,
            headers={"content-type": "application/json", "x-aos-bridge-token": self._token},
        )
        try:
            with _OPENER.open(req, timeout=self._timeout) as resp:
                return json.loads(resp.read().decode("utf-8") or "null")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise CoreUnavailable(f"HTTP {e.code}") from e
        except Exception as e:
            raise CoreUnavailable(str(e)) from e

    def create_approval(self, record):
        result = self._call("POST", "/v1/approvals", record)
        if not isinstance(result, dict) or not result.get("id"):
            raise CoreUnavailable("unexpected approval response")
        return result

    def consume(self, task_id, tool, args_hash):
        result = self._call("POST", "/v1/approvals/consume", {"task_id": task_id, "tool": tool, "args_hash": args_hash})
        if not isinstance(result, dict) or "status" not in result:
            raise CoreUnavailable("unexpected consume response")
        return result

    def get_approval(self, approval_id):
        result = self._call("GET", "/v1/approvals/" + urllib.parse.quote(approval_id, safe=""))
        return result if isinstance(result, dict) else None


class Breaker:
    def __init__(self, max_tool_calls=150, max_repeat=5):
        self._max_calls = max_tool_calls
        self._max_repeat = max_repeat
        self._lock = threading.Lock()
        self._state = {}

    def check(self, key, signature):
        """Count one tool call for `key`; return (reason or None, newly_tripped)."""
        with self._lock:
            st = self._state.get(key)
            if st is None:
                if len(self._state) >= 500:
                    self._state.pop(next(iter(self._state)))
                st = self._state[key] = {"calls": 0, "last": None, "repeat": 0, "tripped": None}
            if st["tripped"]:
                return st["tripped"], False
            st["calls"] += 1
            st["repeat"] = st["repeat"] + 1 if signature == st["last"] else 1
            st["last"] = signature
            if st["calls"] > self._max_calls:
                st["tripped"] = f"more than {self._max_calls} tool calls in one run"
            elif st["repeat"] > self._max_repeat:
                st["tripped"] = f"same tool call repeated more than {self._max_repeat} times in a row"
            return st["tripped"], st["tripped"] is not None


def _block(message):
    return {"action": "block", "message": message}


def _signature(tool, args):
    blob = json.dumps({"tool": tool, "args": args}, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


class Gate:
    def __init__(self, policy, client, profile, env=None, breaker=None, platforms=None):
        self.policy = policy
        self.client = client
        self.profile = profile
        self.env = os.environ if env is None else env
        limits = (policy or {}).get("breaker") or {}
        self.breaker = breaker or Breaker(limits.get("max_tool_calls", 150), limits.get("max_repeat", 5))
        self.platforms = _SESSION_PLATFORMS if platforms is None else platforms

    def mode(self, session_id):
        if self.env.get("HERMES_KANBAN_TASK"):
            return "kanban"
        if self.platforms.get(session_id) == "cron" or str(session_id or "").startswith("cron_"):
            return "cron"
        return "interactive"

    def decide(self, kwargs):
        """Return (directive or None, info). Never raises: unexpected errors block non-read tools."""
        tool = str(kwargs.get("tool_name") or "?")
        try:
            return self._decide(tool, kwargs)
        except Exception as e:
            if tool in READ_TOOLS:
                return None, {"decision": "allow", "rule_id": None, "error": type(e).__name__}
            return (
                _block(f"DENIED_BRIDGE_ERROR: the os-bridge policy check failed ({type(e).__name__}); the action was not run."),
                {"decision": "deny", "rule_id": "bridge-error"},
            )

    def _decide(self, tool, kwargs):
        args = kwargs.get("args") if isinstance(kwargs.get("args"), dict) else {}
        session_id = kwargs.get("session_id")
        mode = self.mode(session_id)
        info = {"decision": "allow", "rule_id": None, "mode": mode}
        reason, new_trip = self.breaker.check(session_id or f"pid-{os.getpid()}", _signature(tool, args))
        if reason:
            info.update(decision="breaker", rule_id="circuit-breaker", reason=reason, new_trip=new_trip)
            return _block(
                f"CIRCUIT_OPEN: {reason}. Stop using tools now; summarise your progress and end the run "
                "(on a kanban card: kanban_block with reason 'circuit_open')."
            ), info
        if self.policy is None or _policy is None:
            if tool in READ_TOOLS:
                return None, info
            info.update(decision="deny", rule_id="policy-unavailable")
            return _block("DENIED_POLICY_UNAVAILABLE: the Agentic OS policy is missing or invalid, so only read-only tools may run."), info
        ctx = {
            "profile": self.profile, "mode": mode,
            "workspace": self.env.get("HERMES_KANBAN_WORKSPACE"),
            "workspaces_root": self.policy["workspaces_root"],
        }
        verdict = _policy.evaluate(self.policy, tool, args, ctx)
        digest = _policy.args_hash(tool, args)
        info.update(rule_id=verdict["rule_id"], args_hash=digest)
        if verdict["action"] == "allow":
            return None, info
        if verdict["action"] == "deny":
            info["decision"] = "deny"
            return _block(
                f"DENIED_BY_POLICY:{verdict['rule_id']}: {verdict['reason']}. Do not retry this action; choose another approach or report it."
            ), info
        if mode == "kanban":
            return self._park(tool, args, digest, verdict, session_id, info)
        return self._native(tool, args, digest, verdict, info)

    def _park(self, tool, args, digest, verdict, session_id, info):
        task_id = self.env.get("HERMES_KANBAN_TASK")
        try:
            grant = self.client.consume(task_id, tool, digest)
            if grant.get("status") == "consumed":
                info.update(decision="granted", approval_id=grant.get("id"))
                return None, info
            if grant.get("status") == "denied":
                info.update(decision="deny", approval_id=grant.get("id"))
                note = grant.get("instruction") or "no reason given"
                return _block(
                    f"DENIED_BY_OWNER:{grant.get('id')}: {note}. Do not retry this action; finish the card without it "
                    "and explain in kanban_complete."
                ), info
            created = self.client.create_approval({
                "profile": self.profile, "task_id": task_id, "session_id": session_id,
                "rule_id": verdict["rule_id"], "tool": tool, "args_hash": digest,
                "args_preview": preview(args, limit=400), "reason": verdict["reason"],
            })
        except CoreUnavailable:
            info["decision"] = "deny"
            return _block(
                f"DENIED_CORE_UNAVAILABLE:{verdict['rule_id']}: the approval service is unreachable, so this risky action "
                "was refused (fail-closed). Call kanban_block with reason 'core_unavailable' and stop."
            ), info
        approval_id = created["id"]
        info.update(decision="park", approval_id=approval_id)
        return _block(
            f"PENDING_APPROVAL:{approval_id}: owner approval is required ({verdict['reason']}). Call kanban_block now "
            f"with reason 'awaiting_approval:{approval_id}' and kind 'needs_input', write a short progress note to the "
            "workspace, then stop. After the owner approves, the card returns to ready and you may repeat exactly the same call."
        ), info

    def _native(self, tool, args, digest, verdict, info):
        message = f"{self.profile} → {tool} {preview(args, limit=300)} — {verdict['reason']} (aturan {verdict['rule_id']})"
        if tool == "office_approve":
            approval_id = str(args.get("approval_id") or "").strip().lower()
            try:
                record = self.client.get_approval(approval_id) if approval_id else None
            except CoreUnavailable:
                info["decision"] = "deny"
                return _block("DENIED_CORE_UNAVAILABLE:approve-decision: cannot load the approval request; nothing was approved."), info
            if not record or record.get("status") != "pending":
                info["decision"] = "deny"
                return _block(f"UNKNOWN_APPROVAL:{approval_id}: there is no pending approval with this id; nothing was approved."), info
            message = (
                f"Setujui izin {approval_id}: {record.get('profile')} ingin {record.get('tool')} {record.get('args_preview')} "
                f"(kartu {record.get('task_id')}, aturan {record.get('rule_id')})"
            )
        info["decision"] = "native"
        return {"action": "approve", "message": message, "rule_key": f"aos:{verdict['rule_id']}:{digest[:16]}"}, info


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
        self._next_attempt = 0.0
        self._backoff_delay = 1.0

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
        """Read spool file, skipping corrupt lines. Returns (events, ok)."""
        try:
            if not path.exists():
                return [], True
            events = []
            text = path.read_text(encoding="utf-8", errors="replace")
            for line in text.splitlines():
                if not line.strip():
                    continue
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
            return events, True
        except (OSError, IOError):
            return [], False
        except Exception:
            return [], False

    def _write_spool_file(self, path, events):
        """Atomically write spool file; delete if empty."""
        try:
            if not events:
                if path.exists():
                    path.unlink()
                return True
            self._spool_dir.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".tmp")
            with tmp.open("w", encoding="utf-8") as f:
                for event in events:
                    f.write(json.dumps(event, ensure_ascii=False, default=str) + "\n")
            os.replace(tmp, path)
            return True
        except Exception:
            return False

    def _append_to_spool(self, path, events):
        """Append events to spool file if total spool size allows."""
        try:
            total_size = sum(f.stat().st_size for f in self._spool_dir.glob("*.jsonl") if f.exists())
            if total_size > _MAX_SPOOL_BYTES:
                return False
            self._spool_dir.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as f:
                for event in events:
                    f.write(json.dumps(event, ensure_ascii=False, default=str) + "\n")
            return True
        except Exception:
            return False

    def _adopt_orphan(self, wall):
        """Adopt oldest orphan file using wall-clock time (mtime > 60s old)."""
        try:
            own_pid = os.getpid()
            own_pid_str = str(own_pid)
            for f in sorted(self._spool_dir.glob("*.jsonl")):
                stem = f.stem
                if stem == own_pid_str or stem.startswith(f"{own_pid_str}-adopt-"):
                    continue
                mtime = f.stat().st_mtime
                age = wall - mtime
                if age >= 60:
                    adopt_num = 0
                    new_name = self._spool_dir / f"{own_pid_str}-adopt-{adopt_num}.jsonl"
                    while new_name.exists():
                        adopt_num += 1
                        new_name = self._spool_dir / f"{own_pid_str}-adopt-{adopt_num}.jsonl"
                    try:
                        os.replace(f, new_name)
                        return new_name
                    except (OSError, FileExistsError):
                        continue
        except Exception:
            pass
        return None

    def flush_once(self, now=None, wall=None):
        if now is None:
            now = time.monotonic()
        if wall is None:
            wall = time.time()

        with self._lock:
            if now < self._next_attempt:
                batch = []
                while len(batch) < self._batch_size:
                    try:
                        batch.append(self._queue.get_nowait())
                    except queue.Empty:
                        break
                if batch:
                    self._append_to_spool(self._own, batch)
                return 0

            spooled, read_ok = self._read_spool_file(self._own)

            if not spooled:
                adopted = self._adopt_orphan(wall)
                if adopted:
                    spooled, _ = self._read_spool_file(adopted)
                    if spooled:
                        self._own = adopted

            replayed = spooled[:self._batch_size]
            remaining = spooled[self._batch_size:]
            room = self._batch_size - len(replayed)
            batch = []
            while len(batch) < room:
                try:
                    batch.append(self._queue.get_nowait())
                except queue.Empty:
                    break

            events = replayed + batch
            if not events:
                return 0

            try:
                delivered = bool(self._send(events))
            except Exception:
                delivered = False

            if delivered:
                if read_ok:
                    self._write_spool_file(self._own, remaining)
                self._backoff_delay = 1.0
                return len(events)
            else:
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


_GATES = {}
_GATES_LOCK = threading.Lock()


def _gate(profile):
    gate = _GATES.get(profile)
    if gate is None:
        with _GATES_LOCK:
            gate = _GATES.get(profile)
            if gate is None:
                plugin_dir = Path(__file__).resolve().parent
                settings = load_settings(plugin_dir)
                compiled = None
                if _policy is not None:
                    try:
                        compiled = _policy.load_policy(plugin_dir / "policy.json")
                    except Exception:
                        compiled = None
                gate = Gate(compiled, CoreClient(settings["core_url"], settings["token"]), profile)
                _GATES[profile] = gate
    return gate


def _make_hook(hook, profile):
    def callback(*args, **kwargs):
        try:
            if hook == "on_session_start":
                remember_platform(kwargs.get("session_id"), kwargs.get("platform"))
            event = build_event(hook, kwargs, profile)
            if event is not None:
                _transport().enqueue(event)
        except Exception:
            pass
        return None

    return callback


def _make_pre_tool_hook(profile):
    def callback(*args, **kwargs):
        tool = kwargs.get("tool_name")
        try:
            directive, info = _gate(profile).decide(kwargs)
        except Exception:
            if tool in READ_TOOLS:
                directive, info = None, {"decision": "allow", "rule_id": None}
            else:
                directive = _block("DENIED_BRIDGE_ERROR: the os-bridge policy check could not start; the action was not run.")
                info = {"decision": "deny", "rule_id": "bridge-error"}
        try:
            event = build_event("pre_tool_call", kwargs, profile, policy=info)
            if event is not None:
                _transport().enqueue(event)
            if info.get("new_trip"):
                session_id = kwargs.get("session_id")
                _transport().enqueue(make_event(
                    "breaker.tripped", {"tool": tool, "reason": info.get("reason")}, profile, session_id,
                    _SESSION_PLATFORMS.get(session_id),
                ))
        except Exception:
            pass
        return directive

    return callback


def register(ctx):
    profile = profile_name(str(Path(__file__).resolve()))
    for hook in HOOKS:
        try:
            callback = _make_pre_tool_hook(profile) if hook == "pre_tool_call" else _make_hook(hook, profile)
            ctx.register_hook(hook, callback)
        except Exception:
            pass
