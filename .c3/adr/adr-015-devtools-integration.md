---
id: adr-015
title: Devtools via Extension + Fire-and-Forget Transports
status: accepted
date: 2025-12-08
---

# [ADR-015] Devtools via Extension + Fire-and-Forget Transports

## Status
**Accepted** - 2025-12-09

## Decision

Create `@pumped-fn/lite-devtools` using the existing Extension system with fire-and-forget transports.

**Key constraints:**
1. Never block app code (fire-and-forget, no await)
2. Silent failure (transport errors caught, not thrown)
3. Batched emission (queue + microtask flush)

## Solution

```typescript
const scope = createScope({
  extensions: [createDevtools({ transports: [memory(), broadcastChannel()] })]
})
```

**Extension hooks:** `wrapResolve` captures atom timing/deps, `wrapExec` captures flow timing/input.

**Transports:** `memory()` for same-process, `broadcastChannel()` for browser tabs, `consoleTransport()` for debugging.

## Changes

- **c3-0:** Add devtools to Containers table
- **c3-4-lite-devtools:** New container at `packages/lite-devtools/`
- **c3-2-lite:** No changes (Extension system sufficient)
