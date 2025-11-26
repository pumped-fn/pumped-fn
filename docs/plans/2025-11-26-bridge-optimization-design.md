# Bridge Optimization Design

## Overview

Generate execution wrappers via `new Function()` that optimize the **bridge** between scope infrastructure and user's factory. Original factory preserved - optimization targets resolution overhead, not the user's closure.

## Key Insight

`new Function()` cannot access closures/imports. Instead of compiling user code (which fails for 90%+ of real factories), we compile the **execution wrapper** that:
- Resolves dependencies (based on shape)
- Creates controller (if needed)
- Calls original factory with optimized arguments
- Handles errors (sync + async)

## Architecture

```
scope.resolve(executor)
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Scope Layer                                                │
│  • Check value cache                                        │
│  • Check execution cache (generated wrapper)                │
│  • Apply preset substitutions                               │
│  • Extension wrap/onError                                   │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Generated Wrapper (per executor, cached on scope)          │
│  • Resolve dependencies (Promise.all or sequential)         │
│  • Create controller (NOOP or real)                         │
│  • Call originalFn(deps?, ctl?)                             │
│  • Error enrichment (callSite, name)                        │
│  • Thenable check for async errors                          │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
originalFn(deps?, ctl?) ← user's closure, untouched
```

## Generated Wrapper Template

### Parameters

- `scope` - scope instance
- `originalFn` - user's factory (closure-safe)
- `deps` - executor references (after preset substitution)
- `ctlFactory` - controller factory (`"none"` or function)
- `meta` - metadata for error enrichment
- `enrichError` - error enrichment function
- `isThenable` - thenable check function
- `NOOP_CONTROLLER` - shared noop controller
- `registerCleanup` - cleanup registration function

### Base Template

```typescript
new Function(
  "scope", "originalFn", "deps", "ctlFactory", "meta",
  "enrichError", "isThenable", "NOOP_CONTROLLER", "registerCleanup",
  `
  return async function execute() {
    try {
      ${RESOLVE_DEPS}
      ${CREATE_CONTROLLER}
      const result = ${CALL_FACTORY}
      if (isThenable(result)) {
        return result.catch(err => { throw enrichError(err, meta) })
      }
      return result
    } catch (err) {
      throw enrichError(err, meta)
    }
  }
  `
)
```

### RESOLVE_DEPS Variations

| dependencyShape | Generated Code |
|-----------------|----------------|
| `"none"` | *(empty)* |
| `"single"` | `const resolved = await scope.resolve(deps)` |
| `"array"` | `const resolved = await Promise.all(deps.map(d => scope.resolve(d)))` |
| `"record"` | `const entries = await Promise.all(Object.entries(deps).map(async ([k,v]) => [k, await scope.resolve(v)])); const resolved = Object.fromEntries(entries)` |

### CREATE_CONTROLLER Variations

| usesController | Generated Code |
|----------------|----------------|
| `false` | *(empty)* |
| `true` | `const ctl = ctlFactory(scope, meta.executor, registerCleanup)` |

### CALL_FACTORY Variations

| dependencyShape | usesController | Generated Code |
|-----------------|----------------|----------------|
| `"none"` | `false` | `originalFn()` |
| `"none"` | `true` | `originalFn(ctl)` |
| other | `false` | `originalFn(resolved)` |
| other | `true` | `originalFn(resolved, ctl)` |

## Scope Integration

### Scope Creation

```typescript
createScope({ presets: [testDb, mockCache] })

// Builds preset map (immutable):
this.presetMap = new Map([
  [dbExec, testDb],
  [cacheExec, mockCache]
])
```

### Resolution Flow

```typescript
scope.resolve(executor)

// 1. Check value cache
if (this.cache.has(executor)) return cached

// 2. Check/build execution cache
if (!this.executionCache.has(executor)) {
  const meta = getMetadata(executor)
  const resolvedDeps = this.applyPresets(executor.dependencies)
  const wrapper = generateWrapper(meta, resolvedDeps, ...)
  this.executionCache.set(executor, wrapper)
}

// 3. Execute with extensions
const execute = this.executionCache.get(executor)
let wrapped = () => execute()
for (const ext of this.extensions) {
  if (ext.wrap) wrapped = ext.wrap(executor, wrapped)
}

try {
  const result = await wrapped()
  this.cache.set(executor, result)
  return result
} catch (err) {
  for (const ext of this.extensions) ext.onError?.(err, executor)
  throw err
}
```

### applyPresets

```typescript
applyPresets(deps) {
  if (!deps) return undefined
  if (Array.isArray(deps)) return deps.map(d => this.presetMap.get(d) ?? d)
  if (isExecutor(deps)) return this.presetMap.get(deps) ?? deps
  // record
  return Object.fromEntries(
    Object.entries(deps).map(([k, v]) => [k, this.presetMap.get(v) ?? v])
  )
}
```

## Extension Integration

Extensions stay in scope layer (not baked into generated code):
- Extensions are scope-level, not executor-level
- Same executor, different scopes = different extensions
- Keeps generation simple

| Layer | Responsibility |
|-------|----------------|
| Generated wrapper | Deps resolution, controller, factory call, error enrichment |
| Scope | Extension wrap/onError, caching, preset substitution |

## Design Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Compilation target | Execution wrapper, not user code | User code has closures/imports |
| Async handling | Runtime `isThenable()` | Cannot reliably detect async at compile time |
| Dependency resolution | Resolve all declared | User declared them for a reason |
| Presets | Fixed at scope creation | Simplifies resolution path caching |
| Extensions | Scope layer, not generated | Extensions are scope-specific |
| Error enrichment | Passed as function | Avoids duplication in generated code |

## Files to Change

1. `sucrose.ts` - Replace `generate()` with `generateWrapper()`
2. `scope.ts` - Add execution cache, update resolution flow
3. `primitives.ts` - Ensure `isThenable` exported
4. Remove old JIT compilation code

## Performance Benefits

- **No runtime conditionals** in hot path - all decisions baked at first resolve
- **NOOP_CONTROLLER** for simple executors - no allocation
- **Preset substitution** done once at wrapper generation
- **Cached execution path** - subsequent resolves skip all analysis
