---
id: adr-20260330-lite-ui-controller-tracking
title: Lite UI Runtime and Controller Read Tracking
type: adr
status: implemented
date: 2026-03-30
affects: [packages/lite/src/scope.ts, packages/lite/src/index.ts, packages/lite-ui/package.json, packages/lite-ui/src/index.ts, packages/lite-ui/src/jsx-runtime.ts, packages/lite-ui/src/react.ts, packages/lite-ui/src/tracking.ts, packages/lite-ui/src/vnode.ts, packages/lite-ui/tests/jsx.test.tsx, packages/lite-ui/tests/react.test.ts, packages/lite-ui/tests/spec.test.ts]
---

# Lite UI Runtime and Controller Read Tracking

## Goal

Add a DOM/JSX renderer package that stays thin by reusing lite controller semantics, and expose the minimum lite hook needed for the renderer to observe `controller.get()` calls during reactive rendering.

## Work Breakdown

1. Introduce `@pumped-fn/lite-ui` as a private package with tagged-template, JSX/VNode, keyed-list, and optional React bridge entrypoints
2. Export `setControllerReadHook` from `@pumped-fn/lite` so UI integrations can observe controller reads instead of owning parallel controller wrappers
3. Keep hook registration stackable so multiple integrations can coexist without silently stomping each other
4. Verify with lite scope tests plus `packages/lite-ui` JSX/runtime tests

## Risks

- A global controller-read hook is cross-cutting and can become fragile if integrations assume exclusive ownership
- The renderer must stay downstream of lite semantics; duplicating controller or cache behavior would fork the runtime contract
- JSX/template child handling must treat lists, directives, and VNodes consistently or the UI layer will silently stringify reactive values
