---
id: c3-402
c3-version: 4
title: Transport Adapters
type: component
category: foundation
parent: c3-4
goal: Deliver devtools event batches through concrete adapters for in-process, browser, console, and HTTP observers.
summary: >
  Transport implementations that consume devtools event batches.
---

# Transport Adapters

## Goal

Deliver devtools event batches through concrete adapters for in-process, browser,
console, and HTTP observers.

## Container Connection

This component gives the container its delivery boundary. Without it, the devtools
runtime could emit events internally but would have no concrete way to surface them to
tests, dashboards, browsers, or remote servers.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Event batches and transport contracts | c3-401 |
| OUT (provides) | Memory, broadcast, console, and HTTP delivery adapters | c3-4 |

## Code References

| File | Purpose |
|------|---------|
| `packages/lite-devtools/src/transports/index.ts` | Public transport exports |
| `packages/lite-devtools/src/transports/memory.ts` | In-process observer transport |
| `packages/lite-devtools/src/transports/broadcast.ts` | BroadcastChannel transport |
| `packages/lite-devtools/src/transports/console.ts` | Console logging transport |
| `packages/lite-devtools/src/transports/http.ts` | Fire-and-forget HTTP POST transport |

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
