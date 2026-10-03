# Odyssey 2.5D

The default Office view is now a Phaser isometric scene. It projects the existing
logical navigation grid onto diamond floor tiles, raises walls and furniture,
and sorts characters/props by floor depth. It uses the six native Star Office
guest sprite sheets; the map and furniture are original procedural artwork.
This is a new scene in Phaser, not the upstream Star Office room projected by CSS.
The complete original frontend/editor remains under **Star Office asli**.

## Controls

- Select an agent in Crew Manifest or click its character.
- Click open floor to walk there; walls, desk footprints and unreachable cells
  are rejected. A destination ring and walking label confirm the movement.
- Double click a character or use its arrow in the roster to open AOS chat.
- Scroll to zoom, right/middle drag to pan, or press FIT to reset the camera.
- Choose one of six native characters per profile using the character selector.
  Choices persist in this browser. Native sheets only provide their existing
  animation frames; this does not create a new directional art pack.

Core/Hermes remains the source of agent status. Idle agents roam the promenade;
working/thinking/approval/error states route to their work stations. Offline
agents do not roam automatically. Manual movement is a visual override for 30
seconds and is canceled by a new Core status. It does not execute Hermes tools.
Reduced motion disables roaming and uses immediate placement for commands.
Agents avoid static blocked cells; this does not simulate crowd collision.

The shared grid and furniture footprints are in starship/model.ts. Projection
is in starship/isometric.ts. isoMotion.ts validates inverse-projected clicks,
and IsometricScene.ts owns the Phaser lifecycle. The native skin assets retain
upstream noncommercial terms; replace them for commercial distribution.

Verification: office typecheck, 44 tests and production build. Browser checks
cover walking/arrival, native skin selection, chat, scene switching, and cleanup.
No chat message is sent by these checks.
