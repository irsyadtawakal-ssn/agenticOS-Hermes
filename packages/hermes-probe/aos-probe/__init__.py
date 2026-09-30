"""Temporary probe: logs the SHAPE (types/keys, never values) of every hook payload."""
import json
import os
import time
from pathlib import Path

HOOKS = [
    "pre_tool_call",
    "post_tool_call",
    "pre_llm_call",
    "post_llm_call",
    "pre_auxiliary_call",
    "post_auxiliary_call",
    "on_session_start",
    "on_session_end",
]


def _describe(value, depth=0):
    if value is None or isinstance(value, (str, int, float, bool)):
        return type(value).__name__
    if isinstance(value, dict):
        if depth >= 2:
            return "dict"
        return {str(k): _describe(v, depth + 1) for k, v in list(value.items())[:40]}
    if isinstance(value, (list, tuple)):
        if depth >= 2 or not value:
            return type(value).__name__
        return [_describe(value[0], depth + 1)]
    attrs = sorted(a for a in dir(value) if not a.startswith("_"))[:60]
    return {"__type__": type(value).__name__, "attrs": attrs}


def _log_path():
    return Path(os.environ.get("AOS_PROBE_LOG", str(Path.home() / "aos-probe.jsonl")))


def _make(name):
    def callback(*args, **kwargs):
        tool_name = kwargs.get("tool_name") or (args[0] if name.endswith("tool_call") and args else None)
        record = {
            "ts": time.time(),
            "hook": name,
            "tool_name": tool_name if isinstance(tool_name, str) else None,
            "args": [_describe(a) for a in args],
            "kwargs": {k: _describe(v) for k, v in kwargs.items()},
            "env_task": os.environ.get("HERMES_KANBAN_TASK"),
        }
        try:
            with _log_path().open("a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
        except OSError:
            pass
        if name == "pre_tool_call" and tool_name and tool_name == os.environ.get("AOS_PROBE_BLOCK"):
            return {"action": "block", "message": "blocked by aos-probe (AOS_PROBE_BLOCK)"}
        return None

    return callback


def register(ctx):
    for hook in HOOKS:
        try:
            ctx.register_hook(hook, _make(hook))
        except Exception:  # unknown hook name on this Hermes version
            pass
