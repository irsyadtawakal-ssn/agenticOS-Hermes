import importlib.util
import json
import os
import time
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
    t = mod.Transport("http://x", "tok", tmp_path / "spool", send=lambda evs: sent.append(list(evs)) or True)
    t.enqueue(_ev(mod, 1))
    t.enqueue(_ev(mod, 2))
    assert t.flush_once() == 2
    assert [e["ts"] for e in sent[0]] == [1, 2]
    assert t.flush_once() == 0


def test_transport_spools_on_failure_and_replays(tmp_path):
    mod = load()
    spool_dir = tmp_path / "spool"
    ok = {"value": False}
    sent = []
    t = mod.Transport("http://x", "tok", spool_dir, send=lambda evs: (sent.append(list(evs)) or True) if ok["value"] else False)
    t.enqueue(_ev(mod, 1))
    assert t.flush_once(now=0) == 0
    own_file = spool_dir / f"{os.getpid()}.jsonl"
    assert own_file.exists() and len(own_file.read_text(encoding="utf-8").splitlines()) == 1
    ok["value"] = True
    t.enqueue(_ev(mod, 2))
    # Need to pass now=2 to bypass the backoff delay (which is 1s)
    assert t.flush_once(now=2) == 2
    assert [e["ts"] for e in sent[-1]] == [1, 2]
    # Empty spool files are deleted, not left behind
    assert not own_file.exists()


def test_transport_never_raises(tmp_path):
    mod = load()

    def boom(_events):
        raise RuntimeError("network down")

    t = mod.Transport("http://x", "tok", tmp_path / "spool", send=boom)
    t.enqueue(_ev(mod, 1))
    assert t.flush_once() == 0
    # The undelivered event is preserved on disk, not dropped
    own_file = tmp_path / "spool" / f"{os.getpid()}.jsonl"
    assert [json.loads(l)["ts"] for l in own_file.read_text(encoding="utf-8").splitlines()] == [1]


def test_load_settings_prefers_env_then_config_file(tmp_path):
    mod = load()
    (tmp_path / "config.json").write_text('{"core_url": "http://127.0.0.1:7400", "token": "file-tok"}', encoding="utf-8")
    s = mod.load_settings(tmp_path, env={})
    assert s["core_url"] == "http://127.0.0.1:7400" and s["token"] == "file-tok"
    assert s["spool"] == tmp_path / "spool"
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


# ---------------------------------------------------------------------------
# Durability: per-process spool, tolerant replay, batching, backoff, adoption
# ---------------------------------------------------------------------------

def _spool_ts(path):
    return [json.loads(line)["ts"] for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _age(path, seconds):
    old = time.time() - seconds
    os.utime(path, (old, old))


def test_transport_per_process_spool_directory(tmp_path):
    mod = load()
    spool_dir = tmp_path / "spool"
    t = mod.Transport("http://x", "tok", spool_dir, send=lambda evs: False)
    t.enqueue(_ev(mod, 1))
    assert t.flush_once(now=0) == 0
    own_file = spool_dir / f"{os.getpid()}.jsonl"
    assert [p.name for p in spool_dir.iterdir()] == [own_file.name]
    assert _spool_ts(own_file) == [1]


def test_transport_corrupt_line_skipped(tmp_path):
    mod = load()
    spool_dir = tmp_path / "spool"
    spool_dir.mkdir()
    own_file = spool_dir / f"{os.getpid()}.jsonl"
    own_file.write_text(
        json.dumps(_ev(mod, 1)) + "\n" + "{ corrupt json\n" + json.dumps(_ev(mod, 2)) + "\n",
        encoding="utf-8",
    )
    sent = []
    t = mod.Transport("http://x", "tok", spool_dir, send=lambda evs: sent.append(list(evs)) or True)
    assert t.flush_once(now=0) == 2
    assert [e["ts"] for e in sent[0]] == [1, 2]
    assert not own_file.exists()


def test_profile_name_logic():
    mod = load()
    assert mod.profile_name(r"D:\agentic-os\hermes-home\profiles\researcher\plugins\os-bridge\__init__.py") == "researcher"
    assert mod.profile_name(r"D:\h\plugins\os-bridge\__init__.py") == "default"
    assert mod.profile_name("/tmp/x/__init__.py") == "unknown"


def test_preview_redacts_sensitive_keys():
    mod = load()
    result = mod.preview({"password": "secret_pass", "nested": {"api_key": "key123"}, "q": "ok"})
    assert json.loads(result) == {"password": "[REDACTED]", "nested": {"api_key": "[REDACTED]"}, "q": "ok"}


def test_redact_password_token_patterns():
    mod = load()
    assert mod.redact("pwd=abc123") == "pwd=[REDACTED]"
    assert mod.redact("secret=xyz token: abc") == "secret=[REDACTED] token=[REDACTED]"


def test_redaction_non_str_keys_and_nested_lists():
    mod = load()
    val = {1: "x", "outer": [[{"api_key": "SECRET1"}]], "token": "SECRET2"}
    result = mod.preview(val)
    assert "SECRET1" not in result and "SECRET2" not in result
    assert json.loads(result) == {"1": "x", "outer": [[{"api_key": "[REDACTED]"}]], "token": "[REDACTED]"}


def test_http_send_no_proxy_for_loopback(tmp_path, monkeypatch):
    import http.server
    import threading

    seen = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            seen["path"] = self.path
            seen["token"] = self.headers.get("x-aos-bridge-token")
            seen["body"] = json.loads(self.rfile.read(int(self.headers["content-length"])))
            payload = b'{"accepted": 1}'
            self.send_response(200)
            self.send_header("content-length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, *args):
            pass

    for name in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        monkeypatch.setenv(name, "http://127.0.0.1:9")  # nothing listens on port 9
    mod = load()  # loaded after the env is set: a default opener would capture these proxies at import
    server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        event = _ev(mod, 1)
        t = mod.Transport(f"http://127.0.0.1:{port}", "tok", tmp_path / "spool")
        assert t._http_send([event]) is True
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
    assert seen["path"] == "/v1/events"
    assert seen["token"] == "tok"
    assert isinstance(seen["body"], list) and seen["body"][0]["id"] == event["id"]


def test_transport_thread_safe_singleton(monkeypatch):
    import threading

    mod = load()
    created = []

    class CountingTransport:
        def __init__(self, *args, **kwargs):
            time.sleep(0.05)  # widen the race window so an unlocked check-then-create would duplicate
            created.append(self)

        def start(self):
            pass

    monkeypatch.setattr(mod, "Transport", CountingTransport)
    mod._TRANSPORT = None
    barrier = threading.Barrier(5)
    results = []

    def call_transport():
        barrier.wait(timeout=5)
        results.append(mod._transport())

    threads = [threading.Thread(target=call_transport) for _ in range(5)]
    for th in threads:
        th.start()
    for th in threads:
        th.join(timeout=10)

    assert len(results) == 5
    assert len(created) == 1
    assert all(r is created[0] for r in results)


def test_load_settings_invalid_config_json(tmp_path):
    mod = load()
    (tmp_path / "config.json").write_text("not valid json", encoding="utf-8")
    s = mod.load_settings(tmp_path, env={})
    assert s["core_url"] == "http://127.0.0.1:7400" and s["token"] == ""


def test_load_settings_non_dict_config(tmp_path):
    mod = load()
    (tmp_path / "config.json").write_text("[]", encoding="utf-8")
    s = mod.load_settings(tmp_path, env={})
    assert s["core_url"] == "http://127.0.0.1:7400" and s["token"] == ""
    assert s["spool"] == tmp_path / "spool"


# ---------------------------------------------------------------------------
# Orphan adoption
# ---------------------------------------------------------------------------

def test_orphan_adoption_with_wall_clock(tmp_path):
    mod = load()
    spool_dir = tmp_path / "spool"
    spool_dir.mkdir()
    orphan = spool_dir / "999999.jsonl"
    orphan.write_text(json.dumps(_ev(mod, 1)) + "\n", encoding="utf-8")
    _age(orphan, 120)
    sent = []
    t = mod.Transport("http://x", "tok", spool_dir, send=lambda evs: sent.append(list(evs)) or True)
    assert t.flush_once() == 1  # no now/wall arguments: real clocks
    assert [e["ts"] for e in sent[0]] == [1]
    # Orphan was renamed to an adopted file, then deleted once drained
    assert list(spool_dir.iterdir()) == []


def test_fresh_orphan_not_adopted(tmp_path):
    mod = load()
    spool_dir = tmp_path / "spool"
    spool_dir.mkdir()
    orphan = spool_dir / "999999.jsonl"
    content = json.dumps(_ev(mod, 1)) + "\n"
    orphan.write_text(content, encoding="utf-8")
    sent = []
    t = mod.Transport("http://x", "tok", spool_dir, send=lambda evs: sent.append(list(evs)) or True)
    t.enqueue(_ev(mod, 2))
    assert t.flush_once() == 1
    assert [e["ts"] for e in sent[0]] == [2]  # only the queued event
    assert orphan.read_text(encoding="utf-8") == content


def test_pid_stem_ownership(tmp_path, monkeypatch):
    """pid 12 must not treat 123.jsonl as its own file: it is an adoptable orphan."""
    mod = load()
    spool_dir = tmp_path / "spool"
    spool_dir.mkdir()
    monkeypatch.setattr(os, "getpid", lambda: 12)
    orphan = spool_dir / "123.jsonl"
    orphan.write_text(json.dumps(_ev(mod, 1)) + "\n", encoding="utf-8")
    _age(orphan, 120)
    sent = []
    t = mod.Transport("http://x", "tok", spool_dir, send=lambda evs: sent.append(list(evs)) or True)
    assert t.flush_once() == 1
    assert [e["ts"] for e in sent[0]] == [1]
    assert list(spool_dir.iterdir()) == []


def test_adopted_orphan_with_remainder_then_deleted(tmp_path):
    mod = load()
    spool_dir = tmp_path / "spool"
    spool_dir.mkdir()
    orphan = spool_dir / "999999.jsonl"
    orphan.write_text("".join(json.dumps(_ev(mod, n)) + "\n" for n in (1, 2, 3)), encoding="utf-8")
    _age(orphan, 120)
    sent = []
    t = mod.Transport("http://x", "tok", spool_dir, send=lambda evs: sent.extend(evs) or True, batch_size=2)
    assert t.flush_once() == 2
    adopted = spool_dir / f"{os.getpid()}-adopt-0.jsonl"
    assert not orphan.exists()
    assert _spool_ts(adopted) == [3]
    assert t.flush_once() == 1
    assert [e["ts"] for e in sent] == [1, 2, 3]
    assert not adopted.exists()


# ---------------------------------------------------------------------------
# Data safety: read failure, room-limited drain, rewrite failure, empty files
# ---------------------------------------------------------------------------

def test_read_failure_keeps_data(tmp_path, monkeypatch):
    """An unreadable own spool file must be left byte-for-byte untouched."""
    mod = load()
    spool_dir = tmp_path / "spool"
    spool_dir.mkdir()
    own_file = spool_dir / f"{os.getpid()}.jsonl"
    own_file.write_text(json.dumps(_ev(mod, 1)) + "\n" + json.dumps(_ev(mod, 2)) + "\n", encoding="utf-8")
    original_bytes = own_file.read_bytes()

    real_read_text = Path.read_text

    def read_fail(self, *args, **kwargs):
        if self == own_file:
            raise PermissionError("cannot read")
        return real_read_text(self, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", read_fail)
    sent = []
    t = mod.Transport("http://x", "tok", spool_dir, send=lambda evs: sent.append(list(evs)) or True)
    t.enqueue(_ev(mod, 3))
    assert t.flush_once() == 1
    monkeypatch.undo()

    assert own_file.read_bytes() == original_bytes
    assert [[e["ts"] for e in batch] for batch in sent] == [[3]]


def _room_limited_setup(mod, tmp_path, sent_ids):
    """3 spooled events (ts 1-3) + 2 queued (ts 4-5), batch_size 2."""
    spool_dir = tmp_path / "spool"
    spool_dir.mkdir()
    own_file = spool_dir / f"{os.getpid()}.jsonl"
    spooled = [_ev(mod, n) for n in (1, 2, 3)]
    own_file.write_text("".join(json.dumps(e) + "\n" for e in spooled), encoding="utf-8")
    t = mod.Transport(
        "http://x", "tok", spool_dir,
        send=lambda evs: sent_ids.extend(e["id"] for e in evs) or True, batch_size=2,
    )
    queued = [_ev(mod, 4), _ev(mod, 5)]
    for e in queued:
        t.enqueue(e)
    return t, own_file, [e["id"] for e in spooled], [e["id"] for e in queued]


def test_room_limited_drain(tmp_path):
    mod = load()
    sent_ids = []
    t, own_file, spooled_ids, queued_ids = _room_limited_setup(mod, tmp_path, sent_ids)

    assert t.flush_once() == 2
    assert sent_ids == spooled_ids[:2]  # exactly the first two spooled events, nothing from the queue
    assert _spool_ts(own_file) == [3]
    assert t._queue.qsize() == 2

    assert t.flush_once() == 2
    assert sent_ids[2:] == [spooled_ids[2], queued_ids[0]]
    assert t.flush_once() == 1
    assert sent_ids[4:] == [queued_ids[1]]
    assert t.flush_once() == 0

    assert len(sent_ids) == 5
    assert set(sent_ids) == set(spooled_ids + queued_ids)
    assert not own_file.exists()


def test_room_limited_drain_survives_replace_failure(tmp_path, monkeypatch):
    """If rewriting the remainder fails, the spool file stays intact (duplicates ok, loss not)."""
    mod = load()
    sent_ids = []
    t, own_file, spooled_ids, queued_ids = _room_limited_setup(mod, tmp_path, sent_ids)
    original_bytes = own_file.read_bytes()

    def replace_fail(src, dst):
        raise PermissionError("replace denied")

    monkeypatch.setattr(os, "replace", replace_fail)
    assert t.flush_once() == 2
    assert sent_ids == spooled_ids[:2]
    assert own_file.read_bytes() == original_bytes
    assert t._queue.qsize() == 2  # queued events were not drained into a remainder that could be lost

    monkeypatch.undo()
    for _ in range(10):  # bounded drain
        if t.flush_once() == 0:
            break

    assert set(sent_ids) == set(spooled_ids + queued_ids)  # all 5 unique ids delivered
    assert not own_file.exists()


def test_empty_spool_files_deleted_own(tmp_path):
    mod = load()
    spool_dir = tmp_path / "spool"
    sent = []
    t = mod.Transport("http://x", "tok", spool_dir, send=lambda evs: sent.append(list(evs)) or True)
    own_file = spool_dir / f"{os.getpid()}.jsonl"

    t.enqueue(_ev(mod, 1))
    assert t.flush_once() == 1
    assert not own_file.exists()

    spool_dir.mkdir(exist_ok=True)
    own_file.write_text(json.dumps(_ev(mod, 2)) + "\n", encoding="utf-8")
    assert t.flush_once() == 1  # replayed entirely from the spool
    assert not own_file.exists()


# ---------------------------------------------------------------------------
# Backoff
# ---------------------------------------------------------------------------

def test_backoff_counts_send_calls(tmp_path):
    mod = load()
    spool_dir = tmp_path / "spool"
    send_calls = []

    def counting_send(evs):
        send_calls.append([e["ts"] for e in evs])
        return len(send_calls) > 1  # fail the first call only

    t = mod.Transport("http://x", "tok", spool_dir, send=counting_send, batch_size=50)
    own_file = spool_dir / f"{os.getpid()}.jsonl"

    t.enqueue(_ev(mod, 1))
    assert t.flush_once(now=0) == 0
    assert send_calls == [[1]]  # one call at t

    t.enqueue(_ev(mod, 2))
    assert t.flush_once(now=0.5) == 0
    assert send_calls == [[1]]  # still one call at t+0.5 (backing off)
    assert _spool_ts(own_file) == [1, 2]  # the backoff-period event landed in the own spool file
    assert t._queue.qsize() == 0

    assert t.flush_once(now=1.5) == 2
    assert send_calls == [[1], [1, 2]]  # second call at t+1.5 replays both
    assert not own_file.exists()
