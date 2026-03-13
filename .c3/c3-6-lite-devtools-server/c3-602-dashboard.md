---
id: c3-602
c3-version: 4
title: Terminal Dashboard
type: component
category: foundation
parent: c3-6
goal: Render the terminal dashboard and bootstrap the CLI process that wires the UI to the shared devtools state.
summary: >
  OpenTUI dashboard and CLI bootstrap for the standalone server.
---

# Terminal Dashboard

## Goal

Render the terminal dashboard and bootstrap the CLI process that wires the UI to the
shared devtools state.

## Container Connection

This component makes the server observable to a human operator. Without it, the
container would still receive events but would lose the packaged CLI experience and the
terminal rendering that turns buffered state into a usable dashboard.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Shared event state and server bootstrap | c3-601 |
| IN (uses) | Lite React observer hooks | c3-301 |
| OUT (provides) | CLI entrypoint and terminal rendering | c3-6 |

## Code References

| File | Purpose |
|------|---------|
| `packages/lite-devtools-server/src/bin.tsx` | CLI bootstrap and process wiring |
| `packages/lite-devtools-server/src/ui.tsx` | OpenTUI dashboard components |

## Related Refs

No component-specific refs are documented for this surface yet.

## Layer Constraints

This component operates within these boundaries:

**MUST:**
- Focus on single responsibility within its domain
- Cite refs for patterns instead of re-implementing
- Hand off cross-component concerns to container

**MUST NOT:**
- Import directly from other containers (use container linkages)
- Define system-wide configuration (context responsibility)
- Orchestrate multiple peer components (container responsibility)
- Redefine patterns that exist in refs
