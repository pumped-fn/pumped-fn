---
id: c3-901
c3-version: 4
title: Rendering Runtime
type: component
category: ui-runtime
parent: c3-9
goal: Parse template/JSX input into DOM nodes and keep them in sync with lite controller updates.
summary: >
  Runtime for mounting templates, VNodes, keyed lists, and optional React
  interop on top of lite controller semantics.
---

# Rendering Runtime

## Goal

Turn lite-backed template and JSX values into DOM output while preserving keyed identity, controller-driven updates, and cleanup ownership inside the mount lifecycle.

## Overview {#c3-901-overview}

This component spans:
- `src/index.ts` for template parsing, mount orchestration, and keyed list updates
- `src/vnode.ts` for VNode creation and JSX child handling
- `src/tracking.ts` for controller-read tracking hooks
- `src/react.ts` for optional React bridge entrypoints

## Dependencies

| Direction | What | From/To |
|-----------|------|---------|
| IN (uses) | Scope, controller reads, invalidation, cleanup | c3-201 |
| IN (uses) | React scope/controller helpers (optional) | c3-301 |
| OUT (provides) | DOM mount and JSX runtime behavior | c3-9 |

## Concepts {#c3-901-concepts}

### Template Runtime

`html` templates are parsed once, then cloned and hydrated with:
- attribute bindings
- event bindings
- slot comments for dynamic children

### VNode Runtime

The JSX runtime normalizes children into `VNode` records, then mounts them through the same binding/context model used by templates.

### Controller Tracking

Reactive bindings subscribe to the controllers touched during render-time reads. The runtime relies on the lite controller-read hook to observe `controller.get()` without duplicating controller logic.

### Keyed List Diffing

`list()` keeps a keyed map of rendered fragments and uses LIS-based move detection so DOM order can change without remounting stable items.

## Source Files {#c3-901-source}

- `packages/lite-ui/src/index.ts`
- `packages/lite-ui/src/vnode.ts`
- `packages/lite-ui/src/tracking.ts`
- `packages/lite-ui/src/react.ts`

## Testing {#c3-901-testing}

- `packages/lite-ui/tests/spec.test.ts`
- `packages/lite-ui/tests/jsx.test.tsx`
- `packages/lite-ui/tests/react.test.ts`
- `packages/lite-ui/tests/benchmark.test.ts`
- `packages/lite-ui/tests/perf.test.ts`

## Related {#c3-901-related}

- [c3-201](../c3-2-lite/c3-201-scope.md)
- [c3-301](../c3-3-lite-react/c3-301-hooks.md)
