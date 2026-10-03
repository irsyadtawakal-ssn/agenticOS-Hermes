# Claude Office integration

The default frontend uses native W17ant/Claude-Office React Character and FurnitureRenderer components and MIT-licensed directional character/furniture sprites. The selected upstream version and local modifications are recorded in apps/office/vendor/claude-office/NOTICE.md. Original App, watcher, Slack simulation, and servers are not mounted.

## One connected layout

Workspace, Meeting, Research Lab, and Lounge are all rendered on one 1000 x 700 isometric floor. The unified day/night SVG illustration is original local artwork. The previous native background and separate wing artwork are retained as unused assets; they are not layered into the default view. There are no room tabs, separate scenes, or doorway teleports.

All furniture, agent positions, floor hit testing, and area labels use the same projection. One connected waypoint graph routes agents through aisles and divider openings. Deterministic graph traversal avoids the upstream random route jitter. Area names are destination buttons: they move the selected agent and do not change the scene. Floor clicks snap to safe graph nodes; characters open the existing Core–Hermes chat dock. Location labels derive from current floor coordinates. Movement is visual and never sends Hermes messages or changes Core status.

Character choices persist in browser storage; visual positions reset on reload. Offline agents stay dimmed. Approval/error states do not show false typing. requestAnimationFrame updates motion; a subtle 0.5px step replaces the native 2px bounce and rotation. Reduced-motion removes sprite animations and settles movement immediately.

Tests cover directional assets, distinct desk assignments, shipped floor artwork, connected route nodes, continuous movement across all areas without teleporting, offline/approval state semantics, click bounds, and visual override expiry. Existing shell/adapter/scene regression tests remain in the office suite.
