---
id: c3-9
c3-version: 4
title: Lite UI Library (@pumped-fn/lite-ui)
type: container
boundary: library
parent: c3-0
goal: Provide a lightweight DOM and JSX renderer that reuses lite controller semantics instead of introducing a separate UI state store.
summary: >
  DOM renderer for @pumped-fn/lite with tagged templates, JSX/VNodes, keyed
  list rendering, and optional React island helpers.
---

# Lite UI Library (@pumped-fn/lite-ui)

## Goal

Provide a minimal rendering layer that turns lite controller updates into DOM mutations while keeping scope ownership, dependency semantics, and cache behavior inside `@pumped-fn/lite`.

## Overview {#c3-9-overview}

`@pumped-fn/lite-ui` adds a small UI surface on top of lite:
- `html` tagged templates for direct DOM rendering
- JSX/VNode support via `jsx-runtime`
- keyed `list()` diffing for stable collection updates
- optional `react.ts` helpers for React-hosted islands

The package is deliberately narrow. It uses lite controllers for reactivity and does not add a second application-state container.

## Responsibilities

- Translate lite controller reads into reactive DOM bindings
- Mount tagged-template and JSX output into real DOM nodes
- Preserve keyed list identity during list updates
- Offer optional React interop without reimplementing lite-react hooks

## Technology Stack {#c3-9-stack}

| Category | Technology |
|----------|------------|
| Language | TypeScript 5.9+ |
| Runtime | Browser DOM |
| React Interop | React 18+ / react-dom 18+ (optional peer) |
| Build/Test | Vite + Vitest |

## Public API {#c3-9-api}

| Export | Description |
|--------|-------------|
| `html` | Tagged-template DOM rendering entrypoint |
| `mount` | Mount a template or VNode into a container |
| `list` | Keyed list directive for stable collection updates |
| `createVNode` / `isVNode` / `mountVNode` | JSX runtime and VNode helpers |
| `jsx-runtime` / `jsx-dev-runtime` | JSX transform entrypoints |
| `react` | Optional React bridge helpers |

## Source Organization {#c3-9-source}

```
packages/lite-ui/
├── src/
│   ├── index.ts            # html, mount, list, template runtime
│   ├── vnode.ts            # VNode helpers and JSX child mounting
│   ├── jsx-runtime.ts      # JSX runtime entry
│   ├── jsx-dev-runtime.ts  # JSX dev runtime entry
│   ├── react.ts            # Optional React bridge helpers
│   └── tracking.ts         # Controller-read tracking integration
├── tests/
│   ├── jsx.test.tsx
│   ├── react.test.ts
│   ├── spec.test.ts
│   ├── benchmark.test.ts
│   └── perf.test.ts
└── vitest.config.ts
```

## Components

| ID | Component | Description |
|----|-----------|-------------|
| c3-901 | Rendering Runtime | Template parsing, JSX/VNodes, keyed list diffing, and controller-read tracking |

## Testing {#c3-9-testing}

- `packages/lite-ui/tests/spec.test.ts` covers template/runtime semantics
- `packages/lite-ui/tests/jsx.test.tsx` covers JSX/VNode behavior
- `packages/lite-ui/tests/react.test.ts` covers React island helpers
- `packages/lite-ui/tests/benchmark.test.ts` and `perf.test.ts` track performance-sensitive paths

## Related {#c3-9-related}

- Depends on [c3-201](../c3-2-lite/c3-201-scope.md) for controller semantics and invalidation
- Optionally composes with [c3-301](../c3-3-lite-react/c3-301-hooks.md) for React-hosted usage
