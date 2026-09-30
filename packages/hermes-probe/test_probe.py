import importlib.util
import json
from pathlib import Path

PLUGIN = Path(__file__).parent / "aos-probe" / "__init__.py"


def load():
    spec = importlib.util.spec_from_file_location("aos_probe", PLUGIN)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Ctx:
    def __init__(self):
        self.hooks = {}

    def register_hook(self, name, fn):
        self.hooks[name] = fn


def test_registers_all_known_hooks():
    mod = load()
    ctx = Ctx()
    mod.register(ctx)
    assert sorted(ctx.hooks) == sorted(mod.HOOKS)


def test_logs_payload_shape_not_values(tmp_path, monkeypatch):
    log = tmp_path / "probe.jsonl"
    monkeypatch.setenv("AOS_PROBE_LOG", str(log))
    monkeypatch.setenv("HERMES_KANBAN_TASK", "t_1")
    mod = load()
    ctx = Ctx()
    mod.register(ctx)
    result = ctx.hooks["pre_tool_call"]("terminal", {"command": "secret-value"}, session_id="s1")
    assert result is None
    record = json.loads(log.read_text(encoding="utf-8").splitlines()[0])
    assert record["hook"] == "pre_tool_call"
    assert record["args"] == ["str", {"command": "str"}]
    assert record["kwargs"] == {"session_id": "str"}
    assert record["tool_name"] == "terminal"
    assert record["env_task"] == "t_1"
    assert "secret-value" not in log.read_text(encoding="utf-8")


def test_blocks_the_configured_tool(tmp_path, monkeypatch):
    monkeypatch.setenv("AOS_PROBE_LOG", str(tmp_path / "p.jsonl"))
    monkeypatch.setenv("AOS_PROBE_BLOCK", "terminal")
    mod = load()
    ctx = Ctx()
    mod.register(ctx)
    assert ctx.hooks["pre_tool_call"](tool_name="terminal", params={}) == {
        "action": "block",
        "message": "blocked by aos-probe (AOS_PROBE_BLOCK)",
    }
    assert ctx.hooks["pre_tool_call"](tool_name="web_search", params={}) is None


def test_describes_objects_by_public_attributes(tmp_path, monkeypatch):
    monkeypatch.setenv("AOS_PROBE_LOG", str(tmp_path / "p.jsonl"))
    mod = load()

    class Usage:
        def __init__(self):
            self.prompt_tokens = 1
            self.completion_tokens = 2

    described = mod._describe(Usage())
    assert described["__type__"] == "Usage"
    assert {"completion_tokens", "prompt_tokens"} <= set(described["attrs"])
