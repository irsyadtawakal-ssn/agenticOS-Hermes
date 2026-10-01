import importlib.util
import json
import subprocess
from pathlib import Path

import pytest

PLUGIN = Path(__file__).parent / "aos-office-tools" / "__init__.py"


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for name in ("AOS_HERMES_HOME", "HERMES_HOME", "AOS_WORKSPACES_ROOT"):
        monkeypatch.delenv(name, raising=False)


def load():
    spec = importlib.util.spec_from_file_location("aos_office_tools", PLUGIN)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_create_calls_hermes_kanban_create_with_persistent_workspace(monkeypatch, tmp_path):
    monkeypatch.setenv("AOS_WORKSPACES_ROOT", str(tmp_path))
    mod = load()
    calls = []
    monkeypatch.setattr(mod, "_run", lambda args: (calls.append(args) or (0, "created t_x1", "")))
    out = json.loads(mod.handle_create({"title": "Riset A", "assignee": "researcher", "body": "Goal: x"}))
    dirs = [p for p in tmp_path.iterdir() if p.is_dir()]
    assert len(dirs) == 1
    workspace = dirs[0]
    assert workspace.name.endswith("-riset-a")
    assert out == {"success": True, "output": "created t_x1", "workspace": str(workspace)}
    assert calls == [
        ["kanban", "create", "--assignee", "researcher", "--body=Goal: x", "--workspace", f"dir:{workspace}", "--", "Riset A"]
    ]


def test_create_rejects_unknown_assignee(monkeypatch, tmp_path):
    monkeypatch.setenv("AOS_WORKSPACES_ROOT", str(tmp_path))
    mod = load()
    monkeypatch.setattr(mod, "_run", lambda args: (_ for _ in ()).throw(AssertionError("must not run")))
    out = json.loads(mod.handle_create({"title": "X", "assignee": "hacker", "body": ""}))
    assert out["success"] is False and "assignee" in out["error"]
    assert list(tmp_path.iterdir()) == []


def test_create_truncates_title_and_reports_cli_errors(monkeypatch, tmp_path):
    monkeypatch.setenv("AOS_WORKSPACES_ROOT", str(tmp_path))
    mod = load()
    seen = []
    monkeypatch.setattr(mod, "_run", lambda args: (seen.append(args) or (1, "", "no board")))
    out = json.loads(mod.handle_create({"title": "x" * 120, "assignee": "dev", "body": "b"}))
    assert out == {"success": False, "error": "no board"}
    assert len(seen[0][-1]) == 80
    assert list(tmp_path.iterdir()) == []


def test_workspaces_root_falls_back_to_hermes_home(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    mod = load()
    mod.__file__ = str(tmp_path / "nolayout" / "x" / "__init__.py")
    assert mod._workspaces_root() == tmp_path / "workspaces"


def test_list_passes_filters(monkeypatch):
    mod = load()
    calls = []
    monkeypatch.setattr(mod, "_run", lambda args: (calls.append(args) or (0, "t_1 ready", "")))
    out = json.loads(mod.handle_list({"status": "ready", "assignee": "researcher"}))
    assert out == {"success": True, "output": "t_1 ready"}
    assert calls == [["kanban", "list", "--status=ready", "--assignee=researcher"]]


def test_register_exposes_both_tools():
    mod = load()
    registered = []

    class Ctx:
        def register_tool(self, name, toolset, schema, handler):
            registered.append((name, toolset, schema["name"]))

    mod.register(Ctx())
    assert registered == [
        ("office_create_task", "aos_office", "office_create_task"),
        ("office_list_tasks", "aos_office", "office_list_tasks"),
    ]


def test_create_treats_user_text_as_data_not_flags(monkeypatch, tmp_path):
    monkeypatch.setenv("AOS_WORKSPACES_ROOT", str(tmp_path))
    mod = load()
    calls = []
    monkeypatch.setattr(mod, "_run", lambda args: (calls.append(args) or (0, "created t_x2", "")))
    mod.handle_create({"title": "--help", "assignee": "dev", "body": "--foo"})
    args = calls[0]
    assert args[-2:] == ["--", "--help"]
    assert "--body=--foo" in args
    assert "--foo" not in args


def test_create_success_ignores_stderr_warning(monkeypatch, tmp_path):
    monkeypatch.setenv("AOS_WORKSPACES_ROOT", str(tmp_path))
    mod = load()
    monkeypatch.setattr(mod, "_run", lambda args: (0, "created t_x3", "hermes: source-update completion failed: boom"))
    out = json.loads(mod.handle_create({"title": "T", "assignee": "dev", "body": "b"}))
    assert out["success"] is True and out["output"] == "created t_x3"


def test_create_reports_workspace_failure_without_cli_call(monkeypatch, tmp_path):
    blocker = tmp_path / "afile"
    blocker.write_text("x")
    monkeypatch.setenv("AOS_WORKSPACES_ROOT", str(blocker))
    mod = load()
    monkeypatch.setattr(mod, "_run", lambda args: (_ for _ in ()).throw(AssertionError("must not run")))
    out = json.loads(mod.handle_create({"title": "T", "assignee": "dev", "body": "b"}))
    assert out["success"] is False and "cannot create workspace" in out["error"]


def test_workspaces_root_is_absolute(monkeypatch):
    monkeypatch.setenv("AOS_WORKSPACES_ROOT", "relative/root")
    mod = load()
    assert mod._workspaces_root().is_absolute()


def test_handlers_reject_non_dict_params():
    mod = load()
    for handler in (mod.handle_create, mod.handle_list):
        out = json.loads(handler("nope"))
        assert out == {"success": False, "error": "params must be an object"}


def test_list_rejects_invalid_status_without_cli_call(monkeypatch):
    mod = load()
    monkeypatch.setattr(mod, "_run", lambda args: (_ for _ in ()).throw(AssertionError("must not run")))
    out = json.loads(mod.handle_list({"status": "--json"}))
    assert out["success"] is False and "status" in out["error"]


def test_list_uses_equals_form_for_filters(monkeypatch):
    mod = load()
    calls = []
    monkeypatch.setattr(mod, "_run", lambda args: (calls.append(args) or (0, "", "")))
    mod.handle_list({"status": "ready", "assignee": "researcher"})
    assert calls == [["kanban", "list", "--status=ready", "--assignee=researcher"]]


def test_run_converts_timeout_to_error_tuple(monkeypatch, tmp_path):
    monkeypatch.setenv("AOS_HERMES_HOME", str(tmp_path))
    mod = load()
    monkeypatch.setattr(mod.shutil, "which", lambda name: "hermes")

    def boom(*a, **k):
        raise subprocess.TimeoutExpired(cmd="hermes", timeout=60)

    monkeypatch.setattr(mod.subprocess, "run", boom)
    assert mod._run(["kanban", "list"]) == (124, "", "hermes timed out after 60s")
    out = json.loads(mod.handle_list({}))
    assert out == {"success": False, "error": "hermes timed out after 60s"}


def test_run_converts_oserror_to_error_tuple(monkeypatch, tmp_path):
    monkeypatch.setenv("AOS_HERMES_HOME", str(tmp_path))
    mod = load()
    monkeypatch.setattr(mod.shutil, "which", lambda name: "hermes")

    def boom(*a, **k):
        raise OSError("exec failed")

    monkeypatch.setattr(mod.subprocess, "run", boom)
    assert mod._run(["kanban", "list"]) == (1, "", "exec failed")


def test_run_pins_hermes_home_from_aos_hermes_home(monkeypatch, tmp_path):
    monkeypatch.setenv("AOS_HERMES_HOME", str(tmp_path))
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "other"))
    mod = load()
    monkeypatch.setattr(mod.shutil, "which", lambda name: "hermes")
    seen = {}

    class Proc:
        returncode = 0
        stdout = "ok"
        stderr = ""

    def fake_run(cmd, **kwargs):
        seen["env"] = kwargs.get("env")
        return Proc()

    monkeypatch.setattr(mod.subprocess, "run", fake_run)
    assert mod._run(["kanban", "list"]) == (0, "ok", "")
    assert seen["env"]["HERMES_HOME"] == str(tmp_path)


def test_agentic_root_detects_installed_plugin_layout(monkeypatch, tmp_path):
    (tmp_path / "profiles" / "chief" / "plugins" / "aos-office-tools").mkdir(parents=True)
    mod = load()
    mod.__file__ = str(tmp_path / "profiles" / "chief" / "plugins" / "aos-office-tools" / "__init__.py")
    assert mod._agentic_root() == tmp_path.resolve()


def test_agentic_root_prefers_aos_hermes_home_over_layout_and_hermes_home(monkeypatch, tmp_path):
    (tmp_path / "profiles" / "chief" / "plugins" / "aos-office-tools").mkdir(parents=True)
    monkeypatch.setenv("AOS_HERMES_HOME", str(tmp_path / "explicit"))
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "other"))
    mod = load()
    mod.__file__ = str(tmp_path / "profiles" / "chief" / "plugins" / "aos-office-tools" / "__init__.py")
    assert mod._agentic_root() == tmp_path / "explicit"


def test_unknown_home_returns_error_without_running_hermes(monkeypatch, tmp_path):
    mod = load()
    mod.__file__ = str(tmp_path / "a" / "b" / "c" / "d" / "__init__.py")
    monkeypatch.setattr(mod.shutil, "which", lambda name: "hermes")
    monkeypatch.setattr(mod.subprocess, "run", lambda *a, **k: (_ for _ in ()).throw(AssertionError("must not run")))
    assert mod._agentic_root() is None
    out = json.loads(mod.handle_list({}))
    assert out["success"] is False and "AOS_HERMES_HOME" in out["error"]
    monkeypatch.setenv("AOS_WORKSPACES_ROOT", str(tmp_path / "ws"))
    out = json.loads(mod.handle_create({"title": "T", "assignee": "dev", "body": "b"}))
    assert out["success"] is False and "AOS_HERMES_HOME" in out["error"]
    assert list((tmp_path / "ws").iterdir()) == []


def test_nul_byte_in_title_returns_error_and_removes_workspace(monkeypatch, tmp_path):
    monkeypatch.setenv("AOS_HERMES_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("AOS_WORKSPACES_ROOT", str(tmp_path / "ws"))
    mod = load()
    monkeypatch.setattr(mod.shutil, "which", lambda name: "hermes")

    def boom(*a, **k):
        raise ValueError("embedded null byte")

    monkeypatch.setattr(mod.subprocess, "run", boom)
    assert mod._run(["x"]) == (1, "", "embedded null byte")
    out = json.loads(mod.handle_create({"title": "bad\u0000title", "assignee": "dev", "body": "b"}))
    assert out == {"success": False, "error": "embedded null byte"}
    assert list((tmp_path / "ws").iterdir()) == []


def test_workspaces_root_defaults_under_agentic_root(monkeypatch, tmp_path):
    monkeypatch.setenv("AOS_HERMES_HOME", str(tmp_path))
    mod = load()
    assert mod._workspaces_root() == (tmp_path / "workspaces").absolute()
