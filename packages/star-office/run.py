"""Run the pinned, complete Star Office UI with a read-only Core adapter."""
import importlib.util
import json
import os
from pathlib import Path
import secrets
import sys
import threading
import time
from urllib.request import Request, urlopen

REPO = Path(__file__).resolve().parents[2]
SHA = 'f29c107e9728a72f2635f10b4e8203b29b37221d'
RUNTIME = Path(os.environ.get('AOS_STAR_RUNTIME', 'D:/agentic-os/star-office'))
SOURCE = RUNTIME / 'source' / ('Star-Office-UI-' + SHA)

def load_environment():
    env_file = REPO / '.env.local'
    if env_file.exists():
        for line in env_file.read_text(encoding='utf-8-sig').splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                os.environ.setdefault(key.strip(), value.strip().strip('\"\''))
    RUNTIME.mkdir(parents=True, exist_ok=True)
    secret_file = RUNTIME / 'editor-credentials.json'
    if not secret_file.exists():
        secret_file.write_text(json.dumps({'session_secret': secrets.token_urlsafe(32),
                                         'editor_password': secrets.token_urlsafe(16)}, indent=2), encoding='utf-8')
    credentials = json.loads(secret_file.read_text(encoding='utf-8'))
    os.environ.setdefault('FLASK_SECRET_KEY', credentials['session_secret'])
    os.environ.setdefault('ASSET_DRAWER_PASS', credentials['editor_password'])

def native_state(state, waiting=False):
    if waiting or state in ('waiting', 'blocked', 'awaiting_approval'):
        return 'error', 'Needs approval'
    if not state or state == 'offline':
        return 'idle', 'Offline'
    if state in ('idle', 'done', 'success'):
        return 'idle', 'Standby'
    if state in ('error', 'breaker', 'breaker_tripped'):
        return 'error', 'Attention'
    if state == 'thinking':
        return 'researching', 'Thinking'
    return 'executing', 'Working'

def roster_snapshot(roster, agents, approvals, connected):
    result = []
    for item in roster:
        profile = item['name']
        source = next((a for a in agents if a.get('profile') == profile), {})
        waiting = any(a.get('profile') == profile and a.get('status') == 'pending' for a in approvals)
        state, label = native_state(source.get('state') if connected else None, waiting if connected else False)
        result.append({'agentId': profile, 'name': profile, 'isMain': profile == 'chief',
                       'state': state, 'detail': label + (': ' + str(source['detail']) if source.get('detail') and connected else ''),
                       'area': 'error' if state == 'error' else 'breakroom' if state == 'idle' else 'writing',
                       'authStatus': 'approved', 'source': 'agentic-os',
                       'aosStatus': label, 'updated_at': source.get('updated_at'), 'connected': connected})
    return result

def create_app():
    load_environment()
    sys.path.insert(0, str(SOURCE / 'backend'))
    spec = importlib.util.spec_from_file_location('aos_native_star_office', SOURCE / 'backend/app.py')
    upstream = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(upstream)
    app = upstream.app
    roster = json.loads((REPO / 'infra/profiles/office-roster.json').read_text(encoding='utf-8'))
    snapshot = roster_snapshot(roster, [], [], False)
    lock = threading.Lock()
    core = os.environ.get('AOS_CORE_URL', 'http://127.0.0.1:7400').rstrip('/')
    token = os.environ.get('AOS_UI_TOKEN', '')
    def poll():
        nonlocal snapshot
        while True:
            try:
                def read(path):
                    req = Request(core + path, headers={'Authorization': 'Bearer ' + token})
                    with urlopen(req, timeout=3) as response:
                        return json.load(response)
                agents = read('/v1/agents')
                approvals = read('/v1/approvals?status=pending')
                current = roster_snapshot(roster, agents, approvals, True)
            except Exception:
                current = roster_snapshot(roster, [], [], False)
            with lock:
                snapshot = current
            time.sleep(2)
    from flask import jsonify, request
    def agents():
        with lock:
            return jsonify(snapshot)
    def status():
        with lock:
            chief = next(a for a in snapshot if a['isMain'])
            return jsonify(chief)
    def managed_readonly():
        return jsonify({'ok': False, 'msg': 'Agentic OS manages live agent states and membership. Use its chat and approvals.'}), 409
    app.view_functions['get_agents'] = agents
    app.view_functions['get_status'] = status
    # Native manual simulation must never override real Hermes activity.
    for rule in app.url_map.iter_rules():
        if rule.rule in ('/set_state', '/agent-push', '/join-agent', '/leave-agent', '/agent-approve', '/agent-reject'):
            app.view_functions[rule.endpoint] = managed_readonly
    injection = (Path(__file__).parent / 'bridge.js').read_text(encoding='utf-8')
    @app.after_request
    def integrate(response):
        if request.path == '/' and response.status_code == 200:
            response.set_data(response.get_data(as_text=True).replace('</body>', '<script>' + injection + '</script></body>'))
            response.headers['Cache-Control'] = 'no-store'
        return response
    threading.Thread(target=poll, daemon=True, name='core-status').start()
    return app

if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=19000, debug=False, use_reloader=False, threaded=True)
