# UI Lane

## Purpose

`pkg/ui/` holds graph-composed UI authoring packages.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `ui/` | `@pumped-fn/ui` | Succinct TSX and graph-handle UI authoring. |

## Naming

Keep public package names short. Use `@pumped-fn/ui` for the primary UI authoring surface.

## Boundaries

UI authoring packages compose graph handles into portable plans. Runtime state, flows, resources, tags,
environment capabilities, and target renderers still belong to Lite and implementation packs.

Implementation packs should expose their own small binding vocabulary for target components, actions, state
drivers, scope tags, and adapter capabilities. The spec vocabulary stays in `@pumped-fn/ui`; React, Vue,
React Native, json-render, and test runtimes decide how to bind and execute it.
