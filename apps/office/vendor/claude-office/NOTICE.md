# Claude Office frontend basis

Source: https://github.com/W17ant/Claude-Office
Pinned revision: 291e7608aa3beb614aca80fe86077ef8c0cbc21d
Copyright (c) 2026 W17ANT. MIT license preserved in LICENSE.

Retained native Character, FurnitureRenderer, SpeechBubble, EffectBubble,
room coordinates/waypoints, movement helpers, theme/effects, and rendering CSS.
Default room art and standard sprites are in apps/office/public/claude-office.

Adaptations: base-relative resource URLs, type-only imports for strict TypeScript,
local boss config, exported unused helpers, character keyboard/chat callback,
dimmed offline characters, disabled unused legacy floor URL, and removed the
external Google Fonts import. Default CSS is supplemented by an AOS wrapper.

The new ClaudeOfficeView and model are fresh integration code. They consume
Core/Hermes states and approvals, map all ten profiles to native desk spots,
support native waypoint motion, and keep visual movement separate from tasks.
The upstream App, Slack AI watcher, Express server, Electron packaging, hooks,
auto-permission settings, simulation scenarios, and TV-themed assets are not
installed or executed. Chat uses the existing Agentic OS relay and Dock.
