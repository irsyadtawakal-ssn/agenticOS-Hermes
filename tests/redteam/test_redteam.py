import importlib.util
import json
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
BRIDGE = REPO / "packages" / "hermes-os-bridge" / "os-bridge" / "__init__.py"
POLICY = REPO / "infra" / "policy" / "policy.json"
SCENARIOS = json.loads((Path(__file__).parent / "scenarios.json").read_text(encoding="utf-8"))
ROOT = "D:\\agentic-os\\hermes-home\\workspaces"
KANBAN_ENV = {"HERMES_KANBAN_TASK": "t_rt", "HERMES_KANBAN_WORKSPACE": ROOT + "\\20261002-rt"}
RISKY = ("native", "park", "deny", "breaker")


def load_bridge():
    spec = importlib.util.spec_from_file_location("aos_os_bridge_redteam", BRIDGE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeCore:
    def __init__(self, mod, scenario):
        self.mod = mod
        self.state = scenario.get("core", "up")
        grant_args = scenario.get("grant_args", scenario["args"])
        self.grant_hash = mod._policy.args_hash(scenario["tool"], grant_args)

    def _check(self):
        if self.state == "down":
            raise self.mod.CoreUnavailable("core down")
        if self.state == "explode":
            raise RuntimeError("unexpected client bug")

    def consume(self, task_id, tool, args_hash):
        self._check()
        if self.state == "grant" and args_hash == self.grant_hash:
            return {"status": "consumed", "id": "rtgrnt"}
        if self.state == "denied" and args_hash == self.grant_hash:
            return {"status": "denied", "id": "rtdeny", "instruction": "jangan"}
        return {"status": "none"}

    def create_approval(self, record):
        self._check()
        return {"id": "rtpark", "status": "pending", "created": True}

    def get_approval(self, approval_id):
        self._check()
        if self.state == "pending-approval":
            return {"id": approval_id, "status": "pending", "profile": "dev", "tool": "terminal", "args_preview": "{}", "task_id": "t_x", "rule_id": "git-push"}
        return None


def run(scenario):
    mod = load_bridge()
    policy = None
    if scenario.get("policy", "real") == "real":
        policy = mod._policy.compile_policy({**json.loads(POLICY.read_text(encoding="utf-8")), "workspaces_root": ROOT})
    env = KANBAN_ENV if scenario["mode"] == "kanban" else {}
    session_id = "cron_rt_20261002_070000" if scenario["mode"] == "cron" else "s_rt"
    gate = mod.Gate(policy, FakeCore(mod, scenario), scenario["profile"], env=env, platforms={})
    result = (None, {})
    for i in range(scenario.get("repeat", 1)):
        args = dict(scenario["args"])
        if scenario.get("distinct"):
            args["command"] = f"{args['command']} {i}"
        result = gate.decide({"tool_name": scenario["tool"], "args": args, "session_id": session_id, "tool_call_id": f"c{i}"})
    return result


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[s["id"] for s in SCENARIOS])
def test_scenario(scenario):
    directive, info = run(scenario)
    assert info.get("decision") == scenario["expect"], f"{scenario['id']} {scenario['title']}: {directive}"
    if scenario.get("rule"):
        assert info.get("rule_id") == scenario["rule"]
    if scenario["expect"] in ("allow", "granted"):
        assert directive is None
    elif scenario["expect"] == "native":
        assert directive["action"] == "approve" and directive["rule_key"].startswith("aos:")
    else:
        assert directive["action"] == "block" and directive["message"]


def test_suite_has_at_least_30_risky_scenarios_and_covers_every_rule():
    ids = [s["id"] for s in SCENARIOS]
    assert len(ids) == len(set(ids))
    risky = [s for s in SCENARIOS if s["expect"] in RISKY]
    assert len(risky) >= 30
    rule_ids = {r["id"] for r in json.loads(POLICY.read_text(encoding="utf-8"))["rules"]}
    covered = {s.get("rule") for s in SCENARIOS}
    assert rule_ids <= covered, f"rules without a scenario: {sorted(rule_ids - covered)}"
    sources = {s["source"] for s in risky}
    for needed in ("web-injection", "file-injection", "telegram-forward", "core-down", "workspace-injection", "message-other", "runaway"):
        assert needed in sources
