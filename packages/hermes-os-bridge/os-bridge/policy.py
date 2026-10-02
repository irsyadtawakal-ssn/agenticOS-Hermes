"""Agentic OS tool policy: pure rule evaluation (stdlib only). Callers fail closed on PolicyError."""
import fnmatch
import hashlib
import json
import ntpath
import posixpath
import re
from pathlib import Path

ACTIONS = ("allow", "approve", "deny")
_RANK = {"allow": 0, "approve": 1, "deny": 2}
COMMAND_KEYS = ("command", "code", "cmd")
COMMAND_TOOLS = ("terminal", "process_manage", "execute_code")
CONTAINER_WORKSPACE = "/workspace"
_COND_KEYS = {"tool", "mode", "profile", "command_regex", "args", "path_outside_root", "path_outside_workspace"}


class PolicyError(ValueError):
    pass


def _as_list(value):
    if value is None:
        return []
    return list(value) if isinstance(value, (list, tuple)) else [value]


def _compile_cond(cond, rule_id):
    if not isinstance(cond, dict):
        raise PolicyError(f"rule {rule_id}: condition must be an object")
    unknown = set(cond) - _COND_KEYS
    if unknown:
        raise PolicyError(f"rule {rule_id}: unknown condition keys {sorted(unknown)}")
    try:
        regexes = [re.compile(str(p), re.IGNORECASE) for p in _as_list(cond.get("command_regex"))]
    except re.error as e:
        raise PolicyError(f"rule {rule_id}: bad regex: {e}") from e
    args = cond.get("args") or {}
    if not isinstance(args, dict):
        raise PolicyError(f"rule {rule_id}: args must be an object")
    return {
        "tool": [str(t) for t in _as_list(cond.get("tool"))],
        "mode": [str(m) for m in _as_list(cond.get("mode"))],
        "profile": [str(p) for p in _as_list(cond.get("profile"))],
        "command_regex": regexes,
        "args": {str(k): [str(v) for v in _as_list(vals)] for k, vals in args.items()},
        "path_outside_root": [str(k) for k in _as_list(cond.get("path_outside_root"))],
        "path_outside_workspace": [str(k) for k in _as_list(cond.get("path_outside_workspace"))],
    }


def compile_policy(doc):
    if not isinstance(doc, dict) or doc.get("version") != 1:
        raise PolicyError("policy version must be 1")
    default = doc.get("default", "allow")
    if default not in ACTIONS:
        raise PolicyError(f"invalid default {default!r}")
    compiled_rules = []
    for raw in doc.get("rules") or []:
        if not isinstance(raw, dict) or not raw.get("id") or raw.get("action") not in ACTIONS:
            raise PolicyError(f"invalid rule {raw!r}")
        compiled_rules.append({
            "id": str(raw["id"]),
            "action": raw["action"],
            "reason": str(raw.get("reason") or raw["id"]),
            "match": _compile_cond(raw.get("match") or {}, raw["id"]),
            "unless": _compile_cond(raw["unless"], raw["id"]) if raw.get("unless") else None,
        })
    breaker = doc.get("breaker") or {}
    try:
        breaker_cfg = {
            "max_tool_calls": int(breaker.get("max_tool_calls", 150)),
            "max_repeat": int(breaker.get("max_repeat", 5)),
        }
    except (TypeError, ValueError) as e:
        raise PolicyError(f"invalid breaker: {e}") from e
    return {
        "default": default,
        "workspaces_root": str(doc.get("workspaces_root") or ""),
        "breaker": breaker_cfg,
        "rules": compiled_rules,
    }


def load_policy(path):
    try:
        doc = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e:
        raise PolicyError(f"cannot read policy: {e}") from e
    return compile_policy(doc)


def command_text(args):
    for key in COMMAND_KEYS:
        value = args.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return None


def _norm_host(path):
    return ntpath.normcase(ntpath.normpath(str(path).replace("/", "\\")))


def _under(path, base, allow_equal):
    p, b = _norm_host(path), _norm_host(base).rstrip("\\")
    return (allow_equal and p == b) or p.startswith(b + "\\")


def inside_root(path, root):
    """Strictly below the workspaces root (the root itself would expose every card)."""
    if not root or not isinstance(path, str) or not path.strip():
        return False
    if not ntpath.splitdrive(path.strip().replace("/", "\\"))[0]:
        return False
    return _under(path.strip(), root, allow_equal=False)


def inside_workspace(path, workspace):
    """Relative paths, /workspace/... (sandbox) and host paths under the card workspace are inside."""
    if not isinstance(path, str) or not path.strip():
        return True
    p = path.strip()
    if p.startswith("~"):
        return False
    if p.startswith("/"):
        norm = posixpath.normpath(p)
        return norm == CONTAINER_WORKSPACE or norm.startswith(CONTAINER_WORKSPACE + "/")
    if ntpath.splitdrive(p.replace("/", "\\"))[0]:
        return bool(workspace) and _under(p, workspace, allow_equal=True)
    norm = posixpath.normpath(p.replace("\\", "/"))
    return not (norm == ".." or norm.startswith("../"))


def _cond_matches(cond, tool, args, ctx):
    if cond["tool"] and not any(fnmatch.fnmatchcase(tool, pat) for pat in cond["tool"]):
        return False
    if cond["mode"] and ctx.get("mode") not in cond["mode"]:
        return False
    if cond["profile"] and ctx.get("profile") not in cond["profile"]:
        return False
    if cond["command_regex"]:
        text = command_text(args)
        if text is None or not any(rx.search(text) for rx in cond["command_regex"]):
            return False
    for key, allowed in cond["args"].items():
        if key not in args or str(args.get(key)) not in allowed:
            return False
    if cond["path_outside_root"]:
        present = [args.get(k) for k in cond["path_outside_root"] if args.get(k)]
        if not present or all(inside_root(p, ctx.get("workspaces_root")) for p in present):
            return False
    if cond["path_outside_workspace"]:
        present = [args.get(k) for k in cond["path_outside_workspace"] if args.get(k)]
        if not present or all(inside_workspace(p, ctx.get("workspace")) for p in present):
            return False
    return True


def evaluate(policy, tool, args, ctx):
    """deny beats approve beats allow; the policy default applies when no rule matches."""
    args = args if isinstance(args, dict) else {}
    best = None
    for rule in policy["rules"]:
        if not _cond_matches(rule["match"], tool, args, ctx):
            continue
        if rule["unless"] is not None and _cond_matches(rule["unless"], tool, args, ctx):
            continue
        if best is None or _RANK[rule["action"]] > _RANK[best["action"]]:
            best = rule
    if best is None:
        return {"action": policy["default"], "rule_id": None, "reason": "default"}
    return {"action": best["action"], "rule_id": best["id"], "reason": best["reason"]}


def canonical_args(tool, args):
    args = args if isinstance(args, dict) else {}
    text = command_text(args)
    if tool in COMMAND_TOOLS and text is not None:
        return {"command": " ".join(text.split())}
    return args


def args_hash(tool, args):
    blob = json.dumps({"tool": tool, "args": canonical_args(tool, args)}, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()
