# Extension wrap() Scope Parameter

## Problem

Current `Extension.wrap()` signature:
```ts
wrap?<T>(
  context: Tag.Store,
  next: () => Promised<T>,
  operation: Operation
): Promise<T> | Promised<T>
```

Issues:
- `context` parameter not always relevant (resolve operations have no flow context)
- No direct `scope` access - must read from `operation.scope` (only available on "resolve" kind)
- Inconsistent - extensions need scope more than raw context

## Solution

Change first parameter from `context: Tag.Store` to `scope: Core.Scope`:

```ts
wrap?<T>(
  scope: Core.Scope,
  next: () => Promised<T>,
  operation: Operation
): Promise<T> | Promised<T>
```

Flow operations already have `operation.context` for tag access.

## Implementation Tasks

### 1. Update Extension Interface Type

**File:** `packages/next/src/types.ts`

**Change:** Line 692-696

```ts
// Before
wrap?<T>(
  context: import("./tag-types").Tag.Store,
  next: () => Promised<T>,
  operation: Operation
): Promise<T> | Promised<T>;

// After
wrap?<T>(
  scope: Core.Scope,
  next: () => Promised<T>,
  operation: Operation
): Promise<T> | Promised<T>;
```

### 2. Update wrapWithExtensions Implementation (Flow)

**File:** `packages/next/src/flow.ts`

**Function:** `wrapWithExtensions` (line 16-36)

**Change:**
```ts
// Before
function wrapWithExtensions<T>(
  extensions: Extension.Extension[] | undefined,
  baseExecutor: () => Promised<T>,
  dataStore: Tag.Store,
  operation: Extension.Operation
): () => Promised<T> {
  if (!extensions || extensions.length === 0) {
    return baseExecutor;
  }
  let executor = baseExecutor;
  for (let i = extensions.length - 1; i >= 0; i--) {
    const extension = extensions[i];
    if (extension.wrap) {
      const current = executor;
      executor = () => {
        const result = extension.wrap!(dataStore, current, operation);
        return result instanceof Promised ? result : Promised.create(result);
      };
    }
  }
  return executor;
}

// After
function wrapWithExtensions<T>(
  extensions: Extension.Extension[] | undefined,
  baseExecutor: () => Promised<T>,
  scope: Core.Scope,
  operation: Extension.Operation
): () => Promised<T> {
  if (!extensions || extensions.length === 0) {
    return baseExecutor;
  }
  let executor = baseExecutor;
  for (let i = extensions.length - 1; i >= 0; i--) {
    const extension = extensions[i];
    if (extension.wrap) {
      const current = executor;
      executor = () => {
        const result = extension.wrap!(scope, current, operation);
        return result instanceof Promised ? result : Promised.create(result);
      };
    }
  }
  return executor;
}
```

**Update call sites** (find with `wrapWithExtensions\(`):
- Line 590: `context.wrapWithExtensions` - pass `context.scope` instead of `dataStore`
- Line 712: `wrapWithExtensions` - pass `context.scope` instead of `context` parameter

### 3. Update FlowContext.wrapWithExtensions Method

**File:** `packages/next/src/flow.ts`

**Method:** `FlowContext.wrapWithExtensions` (line 205-220)

**Change:**
```ts
// Before
private wrapWithExtensions<T>(
  baseExecutor: () => Promised<T>,
  operation: Extension.Operation
): () => Promised<T> {
  let executor = baseExecutor;
  for (const extension of this.reversedExtensions) {
    if (extension.wrap) {
      const current = executor;
      executor = () => {
        const result = extension.wrap!(this, current, operation);
        return result instanceof Promised ? result : Promised.create(result);
      };
    }
  }
  return executor;
}

// After
private wrapWithExtensions<T>(
  baseExecutor: () => Promised<T>,
  operation: Extension.Operation
): () => Promised<T> {
  let executor = baseExecutor;
  for (const extension of this.reversedExtensions) {
    if (extension.wrap) {
      const current = executor;
      executor = () => {
        const result = extension.wrap!(this.scope, current, operation);
        return result instanceof Promised ? result : Promised.create(result);
      };
    }
  }
  return executor;
}
```

### 4. Update BaseScope.wrapWithExtensions Method

**File:** `packages/next/src/scope.ts`

**Method:** `BaseScope.wrapWithExtensions` (line 663-679)

**Change:**
```ts
// Before
private wrapWithExtensions<T>(
  baseExecutor: () => Promised<T>,
  dataStore: import("./tag-types").Tag.Store,
  operation: Extension.Operation
): () => Promised<T> {
  let executor = baseExecutor;
  for (const extension of this.reversedExtensions) {
    if (extension.wrap) {
      const current = executor;
      executor = () => {
        const result = extension.wrap!<T>(dataStore, current, operation);
        return result instanceof Promised ? result : Promised.create(result);
      };
    }
  }
  return executor;
}

// After
private wrapWithExtensions<T>(
  baseExecutor: () => Promised<T>,
  operation: Extension.Operation
): () => Promised<T> {
  let executor = baseExecutor;
  for (const extension of this.reversedExtensions) {
    if (extension.wrap) {
      const current = executor;
      executor = () => {
        const result = extension.wrap!<T>(this, current, operation);
        return result instanceof Promised ? result : Promised.create(result);
      };
    }
  }
  return executor;
}
```

**Update call sites:**
- Line 723: Remove `BaseScope.emptyDataStore` parameter
- Line 842: Remove `BaseScope.emptyDataStore` parameter

### 5. Update Tests

**File:** `packages/next/tests/extensions.test.ts`

**Changes:** Update all extension definitions

```ts
// Before
const ext = extension({
  name: 'test',
  wrap: (_ctx, next, operation) => {
    // ...
    return next();
  }
});

// After
const ext = extension({
  name: 'test',
  wrap: (scope, next, operation) => {
    // Access scope directly
    // Access context via operation.context (for flow operations)
    return next();
  }
});
```

Affected tests:
- Line 15-37: journal-capture extension
- Line 63-74: input-capture extension
- Line 116-146: comprehensive tracker extension

### 6. Update Examples

**File:** `examples/http-server/extension-logging.ts`

```ts
// Before
const loggingExtension = extension({
  name: 'logging',
  wrap: async (ctx, next, operation) => {
    const reqId = requestId.find(ctx) || 'no-id'
    // ...
  }
})

// After
const loggingExtension = extension({
  name: 'logging',
  wrap: async (scope, next, operation) => {
    const ctx = operation.kind === 'execute' ? operation.context : undefined
    const reqId = ctx ? requestId.find(ctx) : 'no-id'
    // ...
  }
})
```

### 7. Update Documentation

**File:** `docs/guides/09-extensions.md`

Update all extension examples to use `scope` parameter instead of `ctx`.

**File:** `docs/guides/extension-production-patterns.md`

Update all examples:
```ts
// Before
wrap: async (ctx, next, operation) => {
  const traceId = requestId.find(ctx) || generateId()
  // ...
}

// After
wrap: async (scope, next, operation) => {
  const ctx = 'context' in operation ? operation.context : undefined
  const traceId = ctx ? requestId.find(ctx) : generateId()
  // ...
}
```

## Verification

1. `pnpm -F @pumped-fn/core-next typecheck` - verify types
2. `pnpm -F @pumped-fn/core-next typecheck:full` - verify test types
3. `pnpm -F @pumped-fn/core-next test` - verify tests pass
4. `pnpm -F @pumped-fn/examples typecheck` - verify examples typecheck
5. `pnpm -F @pumped-fn/examples dev:extension-logging` - verify example runs

## Breaking Change

This is a breaking change to Extension.wrap() signature. Requires major version bump or documented migration.

Migration guide for users:
```ts
// Before
wrap: (ctx, next, operation) => {
  const value = myTag.find(ctx)
  // ...
}

// After
wrap: (scope, next, operation) => {
  const ctx = 'context' in operation ? operation.context : undefined
  const value = ctx ? myTag.find(ctx) : undefined
  // Can also use scope directly now
  const executors = scope.registeredExecutors()
  // ...
}
```
