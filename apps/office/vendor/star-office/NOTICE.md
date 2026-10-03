# Star Office UI

Source: https://github.com/ringhyacinth/Star-Office-UI
Pinned revision: f29c107e9728a72f2635f10b4e8203b29b37221d
Copyright (c) 2026 Ring Hyacinth & Simon Lee.

Code/logic is MIT; see LICENSE. Art assets and fonts are noncommercial only.
The default Native Office runs the full frontend and Flask backend in the external
runtime installed by packages/star-office/start.ps1. The adapter replaces status
and membership endpoints with a read-only Core bridge, injects chat callbacks,
disables simulation, dims offline agents and adds a ninth placement slot.
Native assets and editor are retained. Upstream files are not overwritten.

upstream-index.html preserves the source for review. guestRenderer.js is the
earlier extracted/adapted renderer used by optional Odyssey Starship: injected
scene/roster/placement, disabled demo visitors, custom sprites and label/depth
edits. Odyssey artwork is original to Agentic OS. Six native guest WebPs retained
in src/starship/assets/star-office carry the same noncommercial art terms.
See docs/star-office-integration.md for runtime and feature limitations.
