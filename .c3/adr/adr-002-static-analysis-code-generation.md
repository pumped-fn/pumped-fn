---
id: ADR-002-static-analysis-code-generation
title: Static Code Analysis and Bridge Optimization for Executors
summary: >
  Add Sucrose-inspired static analysis at executor creation time to optimize
  the resolution bridge (dependency resolution, controller creation) based on
  inference data. Original factory preserved - optimization targets infrastructure
  overhead, not the user's closure. Enables fail-fast validation, better error
  context with call site capture, and foundation for future devtools.
status: accepted
date: 2025-11-26
---

# [ADR-002] Static Code Analysis and Bridge Optimization for Executors

## Status {#adr-002-status}
**Accepted** - 2025-11-26

## Problem/Requirement {#adr-002-problem}

Current executor creation (`provide()`, `derive()`) creates factories that are executed as-is at runtime. This approach has limitations:

1. **Startup time** - No pre-analysis means resolution paths are computed at runtime
2. **Error context** - Errors lack creation-time information (where executor was defined)
3. **Visibility** - Cannot determine what's actually used vs. declared without runtime execution
4. **Optimization potential** - Generic wrapper overhead on every factory invocation

Inspired by ElysiaJS's Sucrose static analysis engine, we can analyze factory functions at creation time and generate optimized code.

## Exploration Journey {#adr-002-exploration}

**Initial hypothesis:** Change primarily affects c3-101 (Scope & Executor) where `provide()` and `derive()` are implemented.

**Explored:**

- **Isolated (c3-101):** `executor.ts` creates executors with `createExecutor()`. Factory is wrapped in a generic function that checks `dependencies === undefined` at runtime. This is the primary target.

- **Upstream (c3-103 Tag):** Tags are frozen at creation time - `Tagged` values attached via executor creation. The `name` tag is already extracted via `getExecutorName()`. Tag metadata is available for code generation without additional work.

- **Adjacent (c3-105 Errors):** `ErrorContext` already has `executorName` and `dependencyChain`. Need to add `callSite` for debugging support.

- **Downstream (c3-1 Container):** Data Flow diagram needs update to show compilation step. Source Organization gains new file.

**Discovered:**

- Tags being frozen at creation is a key enabler - all metadata available at analysis time
- `getExecutorName()` already extracts `name` tag for errors - pattern exists
- No impact to Context level - contained within core library internals

**Confirmed:**

- Fail-fast at creation time is feasible since all needed information is available
- `name` tag sufficient for V1 error enrichment
- Call site capture via `new Error().stack` at creation time

## Solution {#adr-002-solution}

### Static Analysis (Sucrose-style)

At `provide()`/`derive()` call time, analyze the factory function via `fn.toString()`:

| Detection | Purpose |
|-----------|---------|
| `async` | Is factory async? |
| `usesCleanup` | Calls `ctl.cleanup()`? |
| `usesRelease` | Calls `ctl.release()`? |
| `usesReload` | Calls `ctl.reload()`? |
| `usesScope` | Accesses `ctl.scope`? |
| `dependencyShape` | `'single'` / `'array'` / `'record'` / `'none'` |
| `dependencyAccess` | Which dependencies are actually accessed |

### Bridge Optimization (Not JIT Compilation)

**Key insight:** `new Function()` cannot access closures or imports - it runs in a fresh global scope. Since most real-world factories use imported classes/modules, JIT compilation would skip 90%+ of executors.

**Correct approach:** Keep the original factory function, optimize the **bridge** between our infrastructure and the user's closure.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Resolution Path                            │
├─────────────────────────────────────────────────────────────────┤
│  Scope.resolve()                                                │
│       │                                                         │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              BRIDGE (optimize this)                      │   │
│  │  • Dependency resolution (skip if none needed)           │   │
│  │  • Controller creation (skip if not used)                │   │
│  │  • Argument preparation (match expected shape)           │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       ▼                                                         │
│  originalFactory(deps, ctl)  ← user's closure, untouched        │
└─────────────────────────────────────────────────────────────────┘
```

**What we optimize based on inference:**

| Inference | Bridge Optimization |
|-----------|---------------------|
| `dependencyShape: "none"` | Skip dependency resolution entirely |
| `usesCleanup/Release/Reload/Scope: false` | Don't create controller, pass `undefined` or skip arg |
| `dependencyAccess: []` | Dependencies declared but unused - skip resolution |
| All controller flags false | Call `fn(deps)` instead of `fn(deps, ctl)` |

**Example transformations:**

```typescript
// User writes:
provide(() => new Service())
// Inference: dependencyShape=none, all uses*=false
// Optimized call: originalFactory() - no args needed

// User writes:
derive([db], ([db]) => new Repository(db))
// Inference: dependencyShape=array, all uses*=false
// Optimized call: originalFactory([resolvedDb]) - no controller

// User writes:
provide((ctl) => {
  ctl.cleanup(() => connection.close())
  return new Connection()
})
// Inference: dependencyShape=none, usesCleanup=true
// Optimized call: originalFactory(controller) - controller needed
```

**No `new Function()` compilation** - the original factory is always called directly. Optimization happens in the resolution infrastructure, not the factory itself.

### Error Handling

Resolution wrapper enriches errors with call site and executor name:

```typescript
const resolve = () => {
  try {
    return originalFactory(deps, ctl)
  } catch (e) {
    throw enrichError(e, {
      name: meta.name,        // from name() tag
      callSite: meta.callSite,
      originalFactory: meta.original
    })
  }
}
```

### Debugging Support

- **Call site capture:** `new Error().stack` at `provide()`/`derive()` time
- **Original factory:** Always preserved (no JIT replacement)
- **Inference data:** Available via `getMetadata(executor)` for devtools

### Storage

- Original factory preserved in metadata
- Inference + metadata stored in WeakMap keyed by executor
- Accessible for debugging/devtools

## Changes Across Layers {#adr-002-changes}

### Container Level

**c3-1 (Core Library):**

- **Data Flow:** Add compilation step between `provide/derive` and `Executor`
- **Source Organization:** Add new file `sucrose.ts` (or `compiler.ts`)
- **Component Relationships:** `provide/derive` now flows through analysis before creating `Executor`

### Component Level

**c3-101 (Scope & Executor):**

- **Concepts > Executor:** Document that factories are analyzed and compiled at creation
- **Source Files:** Add `sucrose.ts` - static analysis and code generation
- **Testing:** Add tests for analysis detection and generated code output

**c3-103 (Tag System):**

- No changes required - tag extraction at creation already supported

**c3-105 (Error Classes):**

- **Error Context:** Add `callSite` field to `ErrorContext`
- **Helper Functions:** Document that `callSite` is captured at executor creation

## Verification {#adr-002-verification}

### Static Analysis
- [x] `provide()` analyzes factory at creation time
- [x] `derive()` handles all dependency shapes (single, array, record)
- [x] Analysis correctly detects: usesCleanup, usesRelease, usesReload, usesScope
- [x] Call site captured at creation time
- [x] Original factory preserved and accessible
- [x] Error enrichment includes `name` tag value and `callSite`

### Bridge Optimization
- [ ] Skip dependency resolution when `dependencyShape === "none"`
- [ ] Use NOOP_CONTROLLER when no controller methods used
- [ ] Skip controller argument when not needed
- [ ] Lazy variant getters (lazy/reactive/static on-demand)

### Compatibility
- [x] Existing tests continue to pass (backward compatible)
- [x] Regular function syntax supported (not just arrow functions)

## Bridge Optimization Details {#adr-002-bridge-optimization}

The inference data enables optimizations in the resolution bridge:

### 1. Controller Creation Strategy

**Pre-computed at analyze time:**
```typescript
type ControllerFactory =
  | "none"           // No controller needed
  | "cleanup-only"   // Only ctl.cleanup used
  | "full"           // Multiple controller methods used
  | (scope, exec) => Controller  // Custom factory
```

**At resolution time:**
- `"none"` → pass `undefined` or omit controller argument
- `"cleanup-only"` → minimal object with just cleanup method
- `"full"` → create complete controller

**Impact:** Most executors (`provide(() => value)`) need no controller.

### 2. Dependency Resolution Short-circuit

**When `dependencyShape === "none"`:**
- Skip `resolveDependencies()` entirely
- No Promise creation
- No function call overhead

**Impact:** Eliminates unnecessary work for `provide()` executors.

### 3. Lazy Variant Creation

**Current:** Eagerly creates `lazy`, `reactive`, `static` variants.

**Optimized:** Property getters for on-demand creation:
```typescript
Object.defineProperty(executor, 'lazy', {
  get() { return this._lazy ??= createLazyExecutor(this); }
});
```

**Impact:** 75% memory reduction for executors whose variants aren't used.

### 4. Thenable Detection

**Use `isThenable()` instead of `instanceof Promise`:**
- Cross-realm safe
- Handles custom thenables (Bluebird, Q, etc.)
- Correct behavior for all Promise-like objects

### Optimization Priority Matrix

| Optimization | Memory | CPU | Risk | Complexity |
|-------------|--------|-----|------|------------|
| NOOP_CONTROLLER | High | Low | Low | Low |
| Dependency Short-circuit | Medium | Medium | Low | Low |
| Lazy Variants | Medium | Low | Low | Low |
| isThenable | Low | Low | Low | Low |

## Future Considerations {#adr-002-future}

- **Devtools integration:** Analysis metadata enables dependency graph visualization
- **Dead code detection:** Know which dependencies are declared but unused
- **Performance profiling:** Per-executor resolution metrics

## Alternatives Considered {#adr-002-alternatives}

### A) JIT Compilation via `new Function()`
- Pro: Could eliminate wrapper overhead entirely
- Con: `new Function()` runs in fresh global scope - cannot access closures or imports
- Con: Most real-world factories use imported classes, so 90%+ would skip compilation
- **Rejected:** Optimization benefit limited to trivial cases (inline literals, built-in globals)

### B) Analysis at scope creation time
- Pro: Full graph visibility
- Con: Delays startup, can't fail-fast at definition site
- **Rejected:** Fail-fast is a key requirement

### C) JIT compilation at first resolution (like Elysia)
- Pro: Zero startup cost until needed
- Con: Errors surface later, first resolution slower
- **Rejected:** Fail-fast and better error context are priorities

### D) Bridge optimization (chosen)
- Pro: Works with all factories including closures and imports
- Pro: Optimizes infrastructure overhead (controller, dependency resolution)
- Pro: Original factory preserved - no debugging issues
- Con: Less aggressive than full JIT, but applies to 100% of cases
- **Accepted:** Universal applicability beats theoretical maximum optimization

## Related {#adr-002-related}

- [c3-1 Core Library](../c3-1-core/README.md) - Container affected
- [c3-101 Scope & Executor](../c3-1-core/c3-101-scope.md) - Primary component
- [c3-103 Tag System](../c3-1-core/c3-103-tag.md) - Tag metadata source
- [c3-105 Error Classes](../c3-1-core/c3-105-errors.md) - Error enrichment
- [ElysiaJS Sucrose](https://saltyaom.com/blog/elysia-sucrose/) - Inspiration for approach
