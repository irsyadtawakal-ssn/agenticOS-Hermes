# AI Town starship adaptation

Source: https://github.com/a16z-infra/ai-town
Revision: 8e05997f2409275669c8344b84a51692e83f3f33
License: MIT (see LICENSE).

Vendored geometry.ts and types.ts preserve AI Town's path interpolation and
orientation functions. types.ts replaces Convex runtime validators with equivalent
TypeScript types; geometry.ts uses explicit type imports and removes one unused local.

src/starship/Character.ts adapts the directional AnimatedSprite, nearest-neighbor
spritesheet, click interaction and selected-player indicator pattern from AI Town's
src/components/Character.tsx to imperative PixiJS 7. This avoids the upstream React
18 / @pixi/react 7 renderer in Agentic OS's React 19 application.

The starship map, pathfinding, UI and generated crew artwork are Agentic OS code.
AI Town's Convex backend, autonomous social simulation and third-party town artwork
are not bundled. Agent identities, status, tasks and conversations come from the
existing Hermes/Core runtime. This is an adapted AI Town visual mode, not a complete
deployment of the upstream simulation.
