# Native Star Office UI in Agentic OS

The **Star Office asli** mode embeds the complete pinned upstream frontend and Flask backend:
Phaser 3.80.1, original room, lobster, six guest sprites, props, animations,
language controls, notes panel and protected asset editor. The earlier Odyssey
adaptation remains in source. The default view is now Odyssey 2.5D; see isometric-office.md.

Run `pnpm star-office:start`. Python 3.11 with the py launcher is required.
Source: https://github.com/ringhyacinth/Star-Office-UI
Revision: f29c107e9728a72f2635f10b4e8203b29b37221d
Runtime and mutable editor assets: D:/agentic-os/star-office (outside Git).
run.py wraps Flask and injects bridge.js without changing upstream files.
packages/star-office/install-autostart.ps1 enables hidden Windows login startup.
This installation has the startup launcher enabled.
The service is local to this Windows computer. Remote deployment requires its
own runtime/proxy and updated iframe URL and allowed origins. Flask's development
server is for local preview, not production hosting.

The adapter reads .env.local server-side (AOS_CORE_URL and AOS_UI_TOKEN), polling
agents and pending approvals every two seconds. Native frontend polling remains.
The Core token is never sent to the iframe. Ten profiles come from office-roster.json:
chief occupies the lobster, nine guests share six native skins. This does not
add a new character skin editor. Thinking maps to researching; active work to
executing; approval/error to the alert area; standby/offline to the rest area.
Offline guests are dimmed and the list shows exact AOS status. Core polling
failure clears stale activity to Offline. Native simulation and membership
mutations return 409 because Core manages these. Character/visitor Chat opens
the existing Dock after origin, iframe source, type and profile validation.
AOS approvals and Kanban remain available. Standalone native view has no chat Dock.

Decorate Room retains native authenticated editing. Its generated password is
the editor_password field in D:/agentic-os/star-office/editor-credentials.json;
keep that file private. Uploads, positions, defaults and favorites persist in
the runtime. Notes use the native memo service, not a Hermes memory connector.
Gemini room generation needs separate credentials and upstream helper, which
are not configured. No paid generation is started.

Upstream code is MIT. Its art assets and fonts are noncommercial only;
commercial use requires replacing them. See the preserved upstream LICENSE.

Runtime Python tests: `-m unittest discover -s packages/star-office -p 'test_*.py'`.
These cover state/approval mapping, disconnection, native HTML/assets, protected
editor auth and managed-state rejection. Office typecheck, 42 tests and build
also run. UI checks do not send chat or trigger LLM work.

Native guests change area when their state changes; they do not freely wander
or support click-to-walk. Those require an additional movement/pathfinding layer.
