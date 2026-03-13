---
id: c3-601
c3-version: 4
title: Server State
type: component
category: foundation
parent: c3-6
goal: Accept remote devtools events over HTTP, maintain the bounded event buffer, and expose the programmatic server surface.
summary: >
  Hono server and shared lite state for the standalone devtools dashboard.
---

# Server State

## Goal

Accept remote devtools events over HTTP, maintain the bounded event buffer, and expose
the programmatic server surface.

## Container Connection

This component owns the application's stateful backend side. Without it, the container
would have no HTTP ingestion path, no event buffering policy, and no stable programmatic
entrypoint for embedding the server outside the packaged CLI.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Devtools event contract | c3-401 |
| IN (uses) | Lite scope and controller semantics | c3-2 |
| OUT (provides) | Shared state and HTTP server surface | c3-6 |

## Code References

| File | Purpose |
|------|---------|
| `packages/lite-devtools-server/src/index.ts` | Public exports for embedding the server |
| `packages/lite-devtools-server/src/server.ts` | Hono routes and bounded event ingestion |
| `packages/lite-devtools-server/src/state.ts` | Shared scope and event atom |

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
