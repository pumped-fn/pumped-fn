# Bridge Optimization Design

## Overview

Optimize the **bridge** between scope infrastructure and user's factory using static inference data. Original factory preserved - optimization targets resolution overhead, not the user's closure.

## Key Insight

`new Function()` cannot access closures/imports - it runs in a fresh global scope. Since most real-world factories use imported classes, we use **inference-based direct calls** instead of generated wrapper functions:

- Analyze factory at creation time (once)
- At resolution, use inference to call original factory with minimal arguments
- Skip controller creation when not needed
- Skip dependency resolution when shape is "none"

## Architecture

```
scope.resolve(executor)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Scope Layer                                                │
│  • Check value cache                                        │
│  • Apply preset substitutions                               │
│  • Extension wrap/onError                                   │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Inference-based Optimized Call (scope.ts:executeFactory)   │
│  • Skip dependency resolution if shape is "none"            │
│  • Create controller (NOOP or real based on inference)      │
│  • Call originalFn with optimized argument list             │
│  • Error enrichment (callSite, name)                        │
│  • Thenable check for async errors                          │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
originalFn(deps?, ctl?) ← user's closure, untouched
```

## Call Patterns

Based on inference data, the factory is called with minimal arguments:

| dependencyShape | usesController | Call |
|-----------------|----------------|------|
| `"none"` | `false` | `originalFn()` |
| `"none"` | `true` | `originalFn(ctl)` |
| other | `false` | `originalFn(resolvedDeps)` |
| other | `true` | `originalFn(resolvedDeps, ctl)` |

## Controller Strategy

```typescript
const controller = usesController
  ? controllerFactory(scope, executor, registerCleanup)
  : NOOP_CONTROLLER  // shared frozen object, zero allocation
```

## Inference Detection

At `provide()`/`derive()` time, analyze factory via `fn.toString()`:

| Detection | Purpose |
|-----------|---------|
| `usesCleanup` | Calls `ctl.cleanup()`? |
| `usesRelease` | Calls `ctl.release()`? |
| `usesReload` | Calls `ctl.reload()`? |
| `usesScope` | Accesses `ctl.scope`? |
| `dependencyShape` | `'single'` / `'array'` / `'record'` / `'none'` |

## Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Compilation target | Original factory with inference | Closures/imports work |
| Async handling | Runtime `isThenable()` | Cannot reliably detect async at compile time |
| Controller creation | NOOP_CONTROLLER for simple factories | Zero allocation overhead |
| Argument passing | Inference-based | Skip unused args |
| Error enrichment | At call site in scope.ts | No wrapper overhead |

## Performance Benefits

- **NOOP_CONTROLLER** for simple executors - no allocation
- **Skip controller argument** when not used - fewer args passed
- **Skip dependency resolution** when shape is "none" - no Promise.all overhead
- **Lazy variant getters** - memory reduction for unused variants
- **Original factory preserved** - debugging stack traces work correctly

## Files Changed

1. `sucrose.ts` - Static analysis, inference, metadata storage
2. `scope.ts` - Inference-based optimized calls in executeFactory
3. `executor.ts` - Lazy variant getters
