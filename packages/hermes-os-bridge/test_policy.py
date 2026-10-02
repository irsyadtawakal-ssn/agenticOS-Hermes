import importlib.util
import json
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
PLUGIN = HERE / "os-bridge" / "policy.py"
POLICY_JSON = HERE.parents[1] / "infra" / "policy" / "policy.json"
ROOT = "D:\\agentic-os\\hermes-home\\workspaces"
WS = ROOT + "\\20261002-x"


def load():
    spec = importlib.util.spec_from_file_location("aos_policy_test", PLUGIN)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def real(mod):
    doc = json.loads(POLICY_JSON.read_text(encoding="utf-8"))
    return mod.compile_policy({**doc, "workspaces_root": ROOT})


def ctx(profile="dev", mode="kanban", workspace=WS):
    return {"profile": profile, "mode": mode, "workspace": workspace, "workspaces_root": ROOT}


def rules(*items):
    return {"version": 1, "default": "allow", "rules": list(items)}


def test_compile_rejects_invalid_documents():
    mod = load()
    with pytest.raises(mod.PolicyError):
        mod.compile_policy({"version": 2, "rules": []})
    with pytest.raises(mod.PolicyError):
        mod.compile_policy(rules({"id": "x", "action": "maybe", "match": {}}))
    with pytest.raises(mod.PolicyError):
        mod.compile_policy(rules({"id": "x", "action": "deny", "match": {"tools": ["a"]}}))
    with pytest.raises(mod.PolicyError):
        mod.compile_policy(rules({"id": "x", "action": "deny", "match": {"command_regex": ["("]}}))
    with pytest.raises(mod.PolicyError):
        mod.load_policy(HERE / "does-not-exist.json")


def test_compile_defaults_breaker_and_root():
    mod = load()
    p = mod.compile_policy(rules())
    assert p["breaker"] == {"max_tool_calls": 150, "max_repeat": 5}
    assert p["workspaces_root"] == "" and p["default"] == "allow"


def test_strictest_matching_rule_wins_and_default_applies():
    mod = load()
    p = mod.compile_policy(rules(
        {"id": "a", "action": "approve", "match": {"tool": ["terminal"]}},
        {"id": "d", "action": "deny", "reason": "never", "match": {"tool": ["term*"], "command_regex": ["shutdown"]}},
    ))
    assert mod.evaluate(p, "terminal", {"command": "ls"}, ctx()) == {"action": "approve", "rule_id": "a", "reason": "a"}
    assert mod.evaluate(p, "terminal", {"command": "shutdown now"}, ctx()) == {"action": "deny", "rule_id": "d", "reason": "never"}
    assert mod.evaluate(p, "web_search", {"q": "x"}, ctx()) == {"action": "allow", "rule_id": None, "reason": "default"}


def test_unless_mode_profile_and_args_conditions():
    mod = load()
    p = mod.compile_policy(rules(
        {"id": "cron", "action": "approve", "match": {"tool": ["cronjob_manage"]}, "unless": {"profile": ["chief"]}},
        {"id": "only-kanban", "action": "deny", "match": {"tool": ["execute_code"], "mode": ["kanban"]}},
        {"id": "dec", "action": "approve", "match": {"tool": ["office_approve"], "args": {"decision": ["approve"]}}},
    ))
    assert mod.evaluate(p, "cronjob_manage", {}, ctx(profile="chief"))["action"] == "allow"
    assert mod.evaluate(p, "cronjob_manage", {}, ctx(profile="dev"))["rule_id"] == "cron"
    assert mod.evaluate(p, "execute_code", {}, ctx(mode="interactive"))["action"] == "allow"
    assert mod.evaluate(p, "execute_code", {}, ctx(mode="kanban"))["action"] == "deny"
    assert mod.evaluate(p, "office_approve", {"decision": "approve"}, ctx())["action"] == "approve"
    assert mod.evaluate(p, "office_approve", {"decision": "deny"}, ctx())["action"] == "allow"
    assert mod.evaluate(p, "office_approve", {}, ctx())["action"] == "allow"


def test_command_text_prefers_command_then_code_then_cmd():
    mod = load()
    assert mod.command_text({"command": "ls", "code": "x"}) == "ls"
    assert mod.command_text({"code": "print(1)"}) == "print(1)"
    assert mod.command_text({"cmd": "dir"}) == "dir"
    assert mod.command_text({"command": "  "}) is None
    assert mod.command_text({}) is None


def test_inside_root_is_strict_normalised_and_case_insensitive():
    mod = load()
    assert mod.inside_root(ROOT + "\\a", ROOT)
    assert mod.inside_root("d:/AGENTIC-OS/hermes-home/workspaces/a/b", ROOT)
    assert not mod.inside_root(ROOT, ROOT)
    assert not mod.inside_root(ROOT + "\\..\\profiles\\dev", ROOT)
    assert not mod.inside_root("D:\\agentic-os\\hermes-home", ROOT)
    assert not mod.inside_root("workspaces\\a", ROOT)
    assert not mod.inside_root("/workspace/a", ROOT)
    assert not mod.inside_root(ROOT + "\\a", "")
    assert not mod.inside_root("", ROOT)


def test_inside_workspace_accepts_relative_container_and_host_workspace_paths():
    mod = load()
    assert mod.inside_workspace("notes.md", WS)
    assert mod.inside_workspace("out/report.md", WS)
    assert mod.inside_workspace("/workspace/out/x.md", WS)
    assert mod.inside_workspace(WS + "\\x.md", WS)
    assert not mod.inside_workspace("../../.env.local", WS)
    assert not mod.inside_workspace("/etc/cron.d/x", WS)
    assert not mod.inside_workspace("/workspace/../root/x", WS)
    assert not mod.inside_workspace("~/.ssh/authorized_keys", WS)
    assert not mod.inside_workspace("D:\\agentic-os\\hermes-home\\profiles\\chief\\.env", WS)
    assert not mod.inside_workspace("C:\\x.txt", None)


def test_args_hash_is_canonical_for_commands_and_order_insensitive():
    mod = load()
    a = mod.args_hash("terminal", {"command": "git  push   origin main", "timeout": 60})
    b = mod.args_hash("terminal", {"command": "git push origin main"})
    c = mod.args_hash("terminal", {"command": "git push origin main --force"})
    assert a == b and a != c and len(a) == 64
    assert mod.args_hash("write_file", {"path": "a", "content": "b"}) == mod.args_hash("write_file", {"content": "b", "path": "a"})
    assert mod.args_hash("write_file", {"path": "a"}) != mod.args_hash("patch", {"path": "a"})


def test_real_policy_has_expected_rules_and_spot_decisions():
    mod = load()
    p = real(mod)
    assert {r["id"] for r in p["rules"]} == {
        "payments", "workspace-injection", "workspace-kind", "execute-code-unattended", "execute-code",
        "external-interaction", "git-push", "delete", "network-egress", "write-outside-workspace",
        "cron-manage", "skill-manage", "approve-decision-unattended", "approve-decision",
    }
    assert p["workspaces_root"] == ROOT
    ev = lambda tool, args, **kw: mod.evaluate(p, tool, args, ctx(**kw))
    assert ev("terminal", {"command": "git push origin main"})["rule_id"] == "git-push"
    assert ev("terminal", {"command": "npm install lodash"})["action"] == "allow"
    assert ev("terminal", {"command": "pnpm test"})["action"] == "allow"
    assert ev("terminal", {"command": "curl https://x.example"})["rule_id"] == "network-egress"
    assert ev("terminal", {"command": "rm -rf /workspace/src"})["rule_id"] == "delete"
    assert ev("kanban_create", {"title": "x", "workspace_kind": "dir", "workspace_path": "D:\\agentic-os\\hermes-home"})["action"] == "deny"
    assert ev("kanban_create", {"title": "x", "workspace_kind": "dir", "workspace_path": ROOT + "\\20261002-y"})["action"] == "allow"
    assert ev("kanban_create", {"title": "x"})["action"] == "allow"
    assert ev("execute_code", {"code": "print(1)"})["action"] == "deny"
    assert ev("execute_code", {"code": "print(1)"}, mode="interactive")["action"] == "approve"
    assert ev("office_approve", {"approval_id": "abc234", "decision": "approve"}, profile="chief", mode="interactive")["rule_id"] == "approve-decision"
    assert ev("office_approve", {"approval_id": "abc234", "decision": "deny"}, profile="chief", mode="interactive")["action"] == "allow"
    assert ev("write_file", {"path": "notes.md", "content": "x"})["action"] == "allow"
    assert ev("write_file", {"path": "notes.md", "content": "x"}, mode="interactive")["action"] == "allow"
    assert ev("stripe_create_payment", {})["action"] == "deny"
