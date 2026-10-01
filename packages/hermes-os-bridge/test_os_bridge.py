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


def _ev(mod, n):
    return mod.build_event("on_session_start", {"session_id": f"s{n}", "platform": "cli"}, "chief", env={}, ts_ms=n)


def test_transport_sends_batches(tmp_path):
    mod = load()
    sent = []
    t = mod.Transport("http://x", "tok", tmp_path / "spool.jsonl", send=lambda evs: sent.append(list(evs)) or True)
    t.enqueue(_ev(mod, 1))
    t.enqueue(_ev(mod, 2))
    assert t.flush_once() == 2
    assert [e["ts"] for e in sent[0]] == [1, 2]
    assert t.flush_once() == 0


def test_transport_spools_on_failure_and_replays(tmp_path):
    mod = load()
    spool = tmp_path / "spool.jsonl"
    ok = {"value": False}
    sent = []
    t = mod.Transport("http://x", "tok", spool, send=lambda evs: (sent.append(list(evs)) or True) if ok["value"] else False)
    t.enqueue(_ev(mod, 1))
    assert t.flush_once() == 0
    assert spool.exists() and len(spool.read_text(encoding="utf-8").splitlines()) == 1
    ok["value"] = True
    t.enqueue(_ev(mod, 2))
    assert t.flush_once() == 2
    assert [e["ts"] for e in sent[-1]] == [1, 2]
    assert not spool.exists() or spool.read_text(encoding="utf-8") == ""


def test_transport_never_raises(tmp_path):
    mod = load()

    def boom(_events):
        raise RuntimeError("network down")

    t = mod.Transport("http://x", "tok", tmp_path / "spool.jsonl", send=boom)
    t.enqueue(_ev(mod, 1))
    assert t.flush_once() == 0


def test_load_settings_prefers_env_then_config_file(tmp_path):
    mod = load()
    (tmp_path / "config.json").write_text('{"core_url": "http://127.0.0.1:7400", "token": "file-tok"}', encoding="utf-8")
    s = mod.load_settings(tmp_path, env={})
    assert s["core_url"] == "http://127.0.0.1:7400" and s["token"] == "file-tok"
    assert s["spool"] == tmp_path / "spool.jsonl"
    s2 = mod.load_settings(tmp_path, env={"AOS_CORE_URL": "http://other", "AOS_BRIDGE_TOKEN": "env-tok"})
    assert s2["core_url"] == "http://other" and s2["token"] == "env-tok"
    s3 = mod.load_settings(tmp_path / "missing", env={})
    assert s3["core_url"] == "http://127.0.0.1:7400" and s3["token"] == ""


def test_register_wires_six_hooks_that_never_raise(tmp_path, monkeypatch):
    mod = load()
    queued = []

    class FakeTransport:
        def enqueue(self, event):
            queued.append(event)

    monkeypatch.setattr(mod, "_transport", lambda: FakeTransport())
    hooks = {}

    class Ctx:
        def register_hook(self, name, fn):
            hooks[name] = fn

    mod.register(Ctx())
    assert sorted(hooks) == sorted(mod.HOOKS)
    assert hooks["pre_tool_call"](tool_name="terminal", args={"command": "ls"}, session_id="s") is None
    assert queued and queued[0]["type"] == "tool.started"

    def broken():
        raise RuntimeError("boom")

    monkeypatch.setattr(mod, "_transport", broken)
    assert hooks["on_session_end"](session_id="s") is None
