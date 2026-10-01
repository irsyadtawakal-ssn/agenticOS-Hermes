import importlib.util
import json
from pathlib import Path

PLUGIN = Path(__file__).parent / "aos-office-tools" / "__init__.py"


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
        ["kanban", "create", "Riset A", "--assignee", "researcher", "--body", "Goal: x", "--workspace", f"dir:{workspace}"]
    ]
    assert calls[0][-2:] == ["--workspace", f"dir:{workspace}"]


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
    assert len(seen[0][2]) == 80


def test_workspaces_root_falls_back_to_hermes_home(monkeypatch, tmp_path):
    monkeypatch.delenv("AOS_WORKSPACES_ROOT", raising=False)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    mod = load()
    assert mod._workspaces_root() == tmp_path / "workspaces"


def test_list_passes_filters(monkeypatch):
    mod = load()
    calls = []
    monkeypatch.setattr(mod, "_run", lambda args: (calls.append(args) or (0, "t_1 ready", "")))
    out = json.loads(mod.handle_list({"status": "ready", "assignee": "researcher"}))
    assert out == {"success": True, "output": "t_1 ready"}
    assert calls == [["kanban", "list", "--status", "ready", "--assignee", "researcher"]]


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
