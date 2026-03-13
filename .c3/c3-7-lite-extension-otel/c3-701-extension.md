---
id: c3-701
c3-version: 4
title: OTel Extension
type: component
category: foundation
parent: c3-7
goal: Configure tracer provider lifecycle from lite tags and wrap flow execution with AsyncLocalStorage-backed OpenTelemetry spans.
summary: >
  Single-file OpenTelemetry extension for the lite package family.
---

# OTel Extension

## Goal

Configure tracer provider lifecycle from lite tags and wrap flow execution with
AsyncLocalStorage-backed OpenTelemetry spans.

## Container Connection

This component is the entire runtime of the container. Without it, the package would
not have tag-driven tracing configuration, managed exporter lifecycle, or execution
context propagation across nested flows.

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Lite extension hooks, tags, and atoms | c3-2 |
| IN (uses) | Telemetry APIs and exporters | |
| OUT (provides) | Tag-configured tracing extension | c3-7 |

## Code References

| File | Purpose |
|------|---------|
| `packages/lite-extension-otel/src/index.ts` | Extension implementation, tag config, provider lifecycle, and span wrapping |

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
