# UI Lane

## Purpose

`pkg/ui/` holds graph-composed UI authoring packages.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `ui/` | `@pumped-fn/ui` | Succinct graph-handle UI authoring over render contracts. |

## Naming

Keep public package names short. Use `@pumped-fn/ui` for the primary UI authoring surface.

## Boundaries

UI authoring packages compose graph handles into portable render plans or host adapters. Runtime state,
flows, resources, tags, and environment capabilities still belong to Lite and implementation packs.
