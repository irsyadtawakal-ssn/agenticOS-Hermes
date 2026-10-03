# Star Office UI / Odyssey Starship

The default visual mode in `apps/office` is now a cutaway starship. The existing
Pixel Agents office remains available through **Pixel Office**; return through
**Starship**. The last selected mode is saved in this browser.

The current adaptation uses Star Office UI's actual guest renderer on Phaser 3.80.1,
with original generated starship artwork and customizable crew. AI Town's
MIT-licensed geometry/path interpolation continues to drive visual motion.
See `star-office-integration.md` and the vendor NOTICE files for exact provenance.
Artwork is bundled locally; displaying the scene requires no image-generation
service at runtime. The upstream Convex social simulation is not deployed.

## User behavior

- All profiles in `infra/profiles/office-roster.json` appear as crew.
- Core agent status and pending approvals determine crew state. Missing state is
  presented as offline, rather than as simulated work.
- Active crew route to command, science, communications, engineering or mission
  stations. Standby crew may move within the central promenade. These movements
  visualize status; they do not initiate Hermes work or agent conversations.
- Clicking a crew member opens the existing chat dock for that profile.
- Missions opens the existing kanban drawer. Approval and cost panels remain in
  the existing HUD. No Core, policy, credentials or Hermes profile changes occur.
- Mouse wheel zooms; right/middle drag pans; FIT restores the view.
- The crew list provides keyboard-accessible selection and character editing.
- Character editing supports uniform color, skin, hair color/style and headset,
  with a preview generated from the same spritesheet as the map character.
- Appearances are saved by profile ID in localStorage (`aos.starship.crew.v1`).
  They persist in the same browser/origin; they are not synchronized across devices
  or between development port 5173 and production port 7400.
- Reduced-motion preferences disable idle wandering and teleport status transitions.

## Previous PixiJS isometric iteration (3 October 2026)

The preceding PixiJS scene projected the logical deck into an isometric cutaway.
Original procedural artwork includes raised walls, recessed bridge windows,
console monitors/keyboards, lounge seating, doorway thresholds and a warp core.
Furniture and crew share a depth-sorted layer; walls are segmented to avoid
incorrect occlusion across a long diagonal. Camera fit uses the rendered bounds.

Navigation now blocks perimeter walls and console/sofa/core footprints. Doorway
geometry is shared by rendering and collision checks. All ten station positions
remain reachable. Mission bay stations were moved away from the perimeter.
The current Phaser view replaces that rendering path with a detailed original
background and calibrated lanes. Server-synced appearance and a layout editor
remain later milestones in `starship-combination-plan.md`.

## Checks

`pnpm -F @aos/office typecheck`, `pnpm -F @aos/office test`, and `pnpm office:build`.
Starship tests verify every roster profile can travel from the promenade to its
station inside the deck, strictly increasing AI Town motion timestamps and exact
arrival, approval-priority status, and safe recovery from malformed stored avatars.

The Vite preview at port 5173 uses the existing local dev proxy to Core. Production
remains at `/office/`; `pnpm aos office` opens it through the existing login flow.
