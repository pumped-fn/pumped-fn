# Documentation Review Findings

## Executive Summary

Reviewed core documentation files against actual implementation in `packages/next/src`. Found major discrepancies in Flow API documentation and Extension API documentation.

## Critical Issues

### 1. Flow API - Completely Outdated (docs/flow.md)

**Current Documentation Shows:**
```typescript
const handler = myFlow.handler(async (ctx, input) => {
  return ctx.ok({ userId: "123" });  // WRONG
  return ctx.ko({ code: "ERROR" });  // WRONG
});

await ctx.execute(subFlow, input);  // WRONG
await ctx.executeParallel([...]);   // WRONG
```

**Actual Implementation:**
```typescript
// Handler returns T directly, not ok/ko
const handler = flow(async (ctx, input: I): Promise<T> => {
  return { userId: "123" };  // Direct return
  // Errors thrown as exceptions, not ctx.ko()
});

// Context methods
await ctx.exec(subFlow, input);           // exec not execute
await ctx.run("key", () => operation);    // journaling support
const results = await ctx.parallel([...]);         // parallel
const results = await ctx.parallelSettled([...]);  // parallelSettled
```

**Files to Update:**
- `docs/flow.md` - Complete rewrite needed
- All flow examples throughout docs

**Source Reference:**
- `packages/next/src/types.ts:470-473` - Handler interface
- `packages/next/src/types.ts:525-569` - Context interface (Flow.C)
- `packages/next/tests/flow-expected.test.ts` - Working examples

---

### 2. Extension API - Outdated Methods (docs/extensions.md)

**Current Documentation Shows:**
```typescript
interface Extension {
  wrapResolve?(next: () => Promise<unknown>, context: ResolveContext): Promise<unknown>
  wrapExecute?<T>(context: DataStore, next: () => Promise<T>, execution: ExecutionContext): Promise<T>
}
```

**Actual Implementation:**
```typescript
interface Extension {
  wrap?<T>(
    context: Accessor.DataStore,
    next: () => Promise<T>,
    operation: Operation  // Union type
  ): Promise<T>
}

// Operation is a discriminated union:
type Operation =
  | { kind: "resolve"; executor; scope; operation: "resolve" | "update" }
  | { kind: "execute"; flow; flowName; depth; isParallel; ... }
  | { kind: "journal"; ... }
  | { kind: "subflow"; ... }
  | { kind: "parallel"; ... }
```

**Impact:** All extension examples need rewriting to use single `wrap` method with operation discrimination.

**Files to Update:**
- `docs/extensions.md` - All extension patterns
- Extension examples throughout docs

**Source Reference:**
- `packages/next/src/types.ts:586-660` - Extension namespace
- `packages/next/tests/extensions.test.ts` - Working examples

---

## Verified Correct APIs

### ✓ Core Executor API
- `provide(factory, ...metas)` - Correct
- `derive(dependencies, factory, ...metas)` - Correct
  - Supports single executor: `derive(executor, (value) => ...)`
  - Supports array: `derive([a, b], ([a, b]) => ...)`
  - Supports object: `derive({a, b}, ({a, b}) => ...)`
- `preset(executor, value)` - Correct
- `createScope(...presets)` - Correct
- `createScope(options)` - Correct

**Source:** `packages/next/src/executor.ts:113-134`

### ✓ Meta API
- `meta(key, schema)` - Returns MetaFn
- `metaFn(value)` - Creates Meta instance
- `metaFn.get(source)` - Throws if not found
- `metaFn.find(source)` - Returns T | undefined
- `metaFn.some(source)` - Returns T[]
- Usage in executors: `meta.get(ctl.scope)` - Correct

**Source:** `packages/next/src/meta.ts:3-96`

### ✓ Accessor API
- `accessor(key, schema)` - Basic accessor
- `accessor(key, schema, defaultValue)` - With default
- Methods: `get(source)`, `find(source)`, `set(source, value)`, `preset(value)`
- Accessor works with DataStore, MetaContainer, or Meta[]

**Source:** `packages/next/src/accessor.ts:125-145`, `packages/next/src/types.ts:675-689`

---

## Minor Issues & Clarifications

### Promised API
Documentation mentions ok/ko results, but actual implementation uses:
- `Promised<T>` class for flow results
- Methods: `map`, `switch`, `mapError`, `switchError`, `inDetails()`
- Error handling via exceptions and `.catch()`, not ok/ko pattern

**Source:** `packages/next/src/promises.ts`

### Flow Definition Patterns
Both patterns exist and work:
```typescript
// Pattern 1: Define then handler
const spec = flow.define({ name, input, output });
const handler = spec.handler(impl);

// Pattern 2: Inline (preferred for internal flows)
const handler = flow({ name, input, output }, impl);
const handler = flow({ name, input, output }, deps, impl);
```

**Source:** `packages/next/src/flow.ts:920-970`

---

## Recommended Update Order

### Priority 1 - Critical (Breaks Code)
1. **flow.md** - Complete rewrite
   - Handler signature
   - Context API (exec, run, parallel, parallelSettled)
   - Error handling (exceptions not ok/ko)
   - Remove all ok/ko references

2. **extensions.md** - Update to wrap() pattern
   - Single wrap method
   - Operation discrimination
   - Update all examples

### Priority 2 - Important (Misleading)
3. **index.md** - Verify code snippet references
4. **how-does-it-work.md** - Check if diagrams match flow changes
5. **authoring.md** - Verify meta patterns still accurate

### Priority 3 - Completeness
6. **api.md** - Add missing APIs (Promised, etc)
7. **accessor.md** - Add preset() method docs
8. **testings.md** - Update flow testing patterns

---

## Test Coverage Verification

All verified APIs have passing tests:
```
✓ tests/core.test.ts (11 tests)
✓ tests/flow-expected.test.ts (37 tests)
✓ tests/extensions.test.ts (4 tests)
✓ tests/meta.test.ts (8 tests)
```

Total: 93 tests passing

**Command:** `pnpm --filter @pumped-fn/core-next test`

---

## Action Items

- [ ] Update flow.md with correct API
- [ ] Update extensions.md with wrap() pattern
- [ ] Review and update all code examples
- [ ] Add Promised API documentation
- [ ] Verify mermaid diagrams in how-does-it-work.md
- [ ] Check cross-references between docs
