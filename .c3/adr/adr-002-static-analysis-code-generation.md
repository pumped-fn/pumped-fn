---
id: ADR-002-static-analysis-code-generation
title: Static Code Analysis and JIT Compilation for Executors
summary: >
  Add Sucrose-inspired static analysis at executor creation time to generate
  optimized factory functions via new Function(), enabling fail-fast validation,
  better error context with call site capture, and foundation for future devtools.
status: accepted
date: 2025-11-26
---

# [ADR-002] Static Code Analysis and JIT Compilation for Executors

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

### Code Generation

Generate optimized factory via `new Function()`:

**Unified signature:** `(deps, ctl) => result`

**Supported function syntax:**
- Arrow functions: `(x) => expr`, `(x) => { ... }`
- Regular functions: `function(x) { ... }`
- Named functions: `function name(x) { ... }`
- Async variants of all above

```typescript
// provide((ctl) => new Service())
new Function('deps', 'ctl', `"use strict"; return new Service()`)

// derive(dbExecutor, (db, ctl) => new Repo(db))
new Function('deps', 'ctl', `"use strict"; return new Repo(deps)`)

// derive([dbExecutor, cache], ([db, c], ctl) => new Repo(db, c))
new Function('deps', 'ctl', `"use strict"; return new Repo(deps[0], deps[1])`)

// derive({ db: dbExec }, ({ db }, ctl) => new Repo(db))
new Function('deps', 'ctl', `"use strict"; return new Repo(deps.db)`)
```

### Compilation Skip Reasons

Compilation may be skipped when the factory cannot be safely compiled. Skip information is stored in metadata:

| Skip Reason | When | Example |
|-------------|------|---------|
| `free-variables` | Factory references closure variables | `const x = 1; provide(() => x)` |
| `unsupported-syntax` | Function parsing failed | Edge case syntax |
| `compilation-error` | `new Function()` threw | Invalid generated code |

**Free variable detection:**
- Parses function body to identify identifiers
- Allows known globals (Object, Array, Promise, JSON, Math, etc.)
- Allows declared local variables (`const`, `let`, `var`)
- Skips property access (`.foo` not counted as variable)
- First detected free variable triggers skip with detail message

When compilation is skipped:
- `metadata.compiled` is `undefined`
- `metadata.skipReason` explains why
- `metadata.skipDetail` provides specific detail (e.g., variable name)
- Original factory is still used at runtime (no performance gain, but works)

### Error Handling

Runtime wrapper (not in generated code) enriches errors:

```typescript
const resolve = (deps, ctl) => {
  try {
    return compiled(deps, ctl)
  } catch (e) {
    throw enrichError(e, {
      name: meta.name,        // from name() tag
      callSite: meta.callSite,
      originalFactory: meta.original
    })
  }
}
```

### Debugging Support (V1)

- **Call site capture:** `new Error().stack` at `provide()`/`derive()` time
- **Original factory:** Reference preserved for debugging
- **sourceURL:** `//# sourceURL=pumped-fn://executorName.js` in generated code
- **API designed for future source map support**

### Storage

- Original factory preserved
- Compiled function + metadata stored in WeakMap keyed by executor
- Both accessible for debugging/devtools

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

- [x] `provide()` analyzes factory and generates compiled function
- [x] `derive()` handles all dependency shapes (single, array, record)
- [x] Analysis correctly detects: async, usesCleanup, usesRelease, usesReload, usesScope
- [x] Generated code has `//# sourceURL` comment
- [x] Call site captured at creation time
- [x] Original factory preserved and accessible
- [x] Error enrichment includes `name` tag value
- [x] Error enrichment includes `callSite`
- [x] Generated functions are testable in isolation
- [x] Existing tests continue to pass (backward compatible)
- [x] Skip reasons (`free-variables`, `unsupported-syntax`, `compilation-error`) documented
- [x] Free variable detection prevents closure compilation
- [x] Regular function syntax supported (not just arrow functions)
- [x] Compiled function actually used at resolution time (verified via spy test)

## Future Considerations {#adr-002-future}

- **Real source maps:** API designed to add source map generation later
- **Devtools integration:** Analysis metadata enables dependency graph visualization
- **Dead code detection:** Know which dependencies are declared but unused
- **Performance profiling:** Per-executor compilation metrics

## Alternatives Considered {#adr-002-alternatives}

### A) Analysis at scope creation time
- Pro: Full graph visibility
- Con: Delays startup, can't fail-fast at definition site
- **Rejected:** Fail-fast is a key requirement

### B) JIT compilation at first resolution (like Elysia)
- Pro: Zero startup cost until needed
- Con: Errors surface later, first resolution slower
- **Rejected:** Fail-fast and better error context are priorities

### C) Inline error handling in generated code
- Pro: Single code path
- Con: Multiple code versions to maintain, larger generated code
- **Rejected:** Separation of concerns, single generated code path preferred

## Related {#adr-002-related}

- [c3-1 Core Library](../c3-1-core/README.md) - Container affected
- [c3-101 Scope & Executor](../c3-1-core/c3-101-scope.md) - Primary component
- [c3-103 Tag System](../c3-1-core/c3-103-tag.md) - Tag metadata source
- [c3-105 Error Classes](../c3-1-core/c3-105-errors.md) - Error enrichment
- [ElysiaJS Sucrose](https://saltyaom.com/blog/elysia-sucrose/) - Inspiration for approach
