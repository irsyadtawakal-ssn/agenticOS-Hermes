import importlib.util
import json
from pathlib import Path

PLUGIN = Path(__file__).parent / "os-bridge" / "__init__.py"


def load():
    spec = importlib.util.spec_from_file_location("aos_os_bridge", PLUGIN)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_tool_categories():
    mod = load()
    assert mod.tool_category("web_search") == "read"
    assert mod.tool_category("write_file") == "write"
    assert mod.tool_category("office_create_task") == "write"
    assert mod.tool_category("terminal") == "run"
    assert mod.tool_category("something_new") == "other"


def test_redact_masks_known_secret_shapes():
    mod = load()
    text = (
        "key sk-9df0123456789abcdef and ghp_abcdefghijklmnopqrstuvwxyz0123 "
        "Bearer abcdefghijklmnop1234 tok 1234567890:AAHabcdefghijklmnopqrstuvwxyz012345 "
        "hex 0123456789abcdef0123456789abcdef"
    )
    out = mod.redact(text)
    for secret in ("sk-9df0123456789abcdef", "ghp_abcdefghijklmnopqrstuvwxyz0123", "abcdefghijklmnop1234",
                   "AAHabcdefghijklmnopqrstuvwxyz012345", "0123456789abcdef0123456789abcdef"):
        assert secret not in out
    assert "Bearer [REDACTED]" in out


def test_preview_serialises_redacts_and_truncates():
    mod = load()
    assert mod.preview({"q": "http/3"}) == '{"q": "http/3"}'
    assert "[REDACTED]" in mod.preview({"token": "sk-abcdefghijklmnop"})
    long = mod.preview("x" * 500, limit=50)
    assert len(long) == 50 and long.endswith("…")


def test_profile_name_from_plugin_location():
    mod = load()
    path = r"D:\agentic-os\hermes-home\profiles\researcher\plugins\os-bridge\__init__.py"
    assert mod.profile_name(path) == "researcher"
    assert mod.profile_name("/tmp/elsewhere/__init__.py") == "unknown"


def test_build_event_tool_started_in_kanban_mode():
    mod = load()
    ev = mod.build_event(
        "pre_tool_call",
        {"tool_name": "web_search", "args": {"query": "http/3"}, "session_id": "s1", "tool_call_id": "c1"},
        "researcher",
        env={"HERMES_KANBAN_TASK": "t_abc"},
        ts_ms=1790000000000,
    )
    assert ev["type"] == "tool.started"
    assert ev["profile"] == "researcher" and ev["session_id"] == "s1"
    assert ev["task_id"] == "t_abc" and ev["mode"] == "kanban" and ev["ts"] == 1790000000000
    assert ev["payload"] == {"tool": "web_search", "category": "read", "tool_call_id": "c1", "args_preview": '{"query": "http/3"}'}
    assert len(ev["id"]) == 32


def test_build_event_modes_and_privacy():
    mod = load()
    start = mod.build_event("on_session_start", {"session_id": "s", "model": "COMBO-SS", "platform": "cli"}, "chief", env={})
    assert start["type"] == "session.started" and start["mode"] == "cli" and start["task_id"] is None
    assert start["payload"] == {"model": "COMBO-SS", "platform": "cli"}
    llm = mod.build_event("post_llm_call", {"session_id": "s", "turn_id": "t1", "user_message": "SECRET", "assistant_response": "SECRET"}, "chief", env={})
    assert llm["type"] == "llm.finished" and "SECRET" not in json.dumps(llm)
    done = mod.build_event("post_tool_call", {"tool_name": "terminal", "result": "SECRET", "duration_ms": 12, "status": "ok", "error_type": None, "tool_call_id": "c"}, "dev", env={})
    assert done["payload"] == {"tool": "terminal", "category": "run", "tool_call_id": "c", "duration_ms": 12, "status": "ok", "error_type": None}
    assert "SECRET" not in json.dumps(done)
    end = mod.build_event("on_session_end", {"session_id": "s", "completed": True, "failed": False, "interrupted": False, "turn_exit_reason": "done"}, "chief", env={})
    assert end["type"] == "session.ended" and end["payload"]["completed"] is True
    assert end["mode"] == "interactive"
    assert mod.build_event("pre_auxiliary_call", {}, "chief", env={}) is None
