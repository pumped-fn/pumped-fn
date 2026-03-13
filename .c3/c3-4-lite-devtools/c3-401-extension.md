---
id: c3-401
c3-version: 4
title: Extension Runtime
type: component
category: foundation
parent: c3-4
goal: Capture lite resolve and exec activity, normalize it into devtools events, and batch those events for transport delivery without blocking application work.
summary: >
  Extension entrypoint and event schema for the lite-devtools package.
---

# Extension Runtime

## Goal

Capture lite resolve and exec activity, normalize it into devtools events, and batch
those events for transport delivery without blocking application work.

## Container Connection

This component is the package's runtime entrypoint. Without it, the container would
have no extension hook implementation, no shared event schema, and no batching bridge
between lite lifecycle events and the transport adapters.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Lite extension hooks and execution metadata | c3-2 |
| IN (uses) | Transport implementations | c3-402 |
| OUT (provides) | `createDevtools()` and event contracts | c3-4 |

## Code References

| File | Purpose |
|------|---------|
| `packages/lite-devtools/src/index.ts` | Public exports for the package runtime |
| `packages/lite-devtools/src/extension.ts` | `createDevtools()` implementation and event batching |
| `packages/lite-devtools/src/types.ts` | Event, transport, and options contracts |
| `packages/lite-devtools/src/symbols.ts` | Internal symbols shared with transports |

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
