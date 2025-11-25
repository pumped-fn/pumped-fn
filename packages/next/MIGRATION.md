# Migration Guide

## Breaking Changes in Core Compact v1

This release consolidates 21 source files to 11 and simplifies several APIs.

### ctx.exec() API Change

**Before:**
```typescript
ctx.exec(myFlow, input)
ctx.exec("key", myFlow, input)
ctx.fn(myFn, arg1, arg2)
```

**After:**
```typescript
ctx.exec({ flow: myFlow, input })
ctx.exec({ flow: myFlow, input, key: "key" })
ctx.exec({ fn: myFn, params: [arg1, arg2] })
```

### Promised Class Methods Removed

The following methods were removed from `Promised`:

| Removed Method | Migration |
|----------------|-----------|
| `switch(fn)` | Use `map()` with conditional logic |
| `switchError(fn)` | Use `mapError()` with conditional logic |
| `fulfilled()` | Use `partition().map(r => r.fulfilled)` |
| `rejected()` | Use `partition().map(r => r.rejected)` |
| `firstFulfilled()` | Use `partition().map(r => r.fulfilled[0])` |
| `findFulfilled(pred)` | Use `partition().map(r => r.fulfilled.find(pred))` |
| `mapFulfilled(fn)` | Use `partition().map(r => r.fulfilled.map(fn))` |
| `assertAllFulfilled()` | Use `partition()` and check `rejected.length === 0` |

**Example migration:**
```typescript
// Before
const users = await Promised.allSettled([...]).fulfilled()

// After
const { fulfilled: users, rejected } = await Promised.allSettled([...]).partition()
```

### Tag API Changes

**Removed:**
- `tag.injectTo(store, value)` - Use `tag.writeToStore(store, value)`
- `tag.partial(value)` - Use spread syntax: `{ ...existingTags, ...newTags }`

### Extension.ExecutionOperation Structure

**Before (nested target):**
```typescript
if (operation.target.type === "flow") {
  const flow = operation.target.flow
}
```

**After (flat structure):**
```typescript
if (operation.flow) {
  const flow = operation.flow
}
```

**New fields:**
- `mode: "sequential" | "parallel" | "parallel-settled"`
- `flow?: Flow.UFlow` (present for flow executions)
- `definition?: Flow.Definition` (present for flow executions)
- `params?: readonly unknown[]` (present for fn executions)
- `count?: number` (present for parallel executions)

### FlowDefinition Builder Removed

**Before:**
```typescript
const myFlow = flow({ name: "test" }).handler((ctx, input) => { ... })
```

**After:**
```typescript
const myFlow = flow({ name: "test" }, (ctx, input) => { ... })
```

### File Consolidation Reference

If you have imports from internal modules, update them:

| Old File | New Location |
|----------|--------------|
| `tag-types.ts` | `tag.ts` + `types.ts` |
| `tag-executors.ts` | `tag.ts` |
| `tags/merge.ts` | `tag.ts` |
| `promises.ts` | `primitives.ts` |
| `ssch.ts` | `primitives.ts` |
| `flow-execution.ts` | `flow.ts` |
| `extension.ts` | `helpers.ts` |
| `internal/*` | Inlined into main modules |
