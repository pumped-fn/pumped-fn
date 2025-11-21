# Tags Reference

## Tag Types

The `Tag` namespace provides types for working with tagged metadata:

```typescript
import { type Tag } from "@pumped-fn/core-next";

// Tag definition type
Tag.Tag<T, HasDefault>

// Storage interface for tag key-value pairs
Tag.Store

// Tagged value instance
Tag.Tagged<T>

// Tag container interface
Tag.Container

// Sources from which tag values can be extracted
Tag.Source

// Tag-based executor wrapper
Tag.TagExecutor<TOutput, TTag>
```

## Tag Write Operations

Tags provide explicit helpers for each target type:

- `tag.injectTo(store, value)` - Backwards compatible alias for writeToStore
- `tag.writeToStore(store, value)` - Explicit store write, validates and sets value
- `tag.writeToContainer(container, value)` - Appends to container.tags array, returns Tagged, invalidates cache
- `tag.writeToTags(tagArray, value)` - Appends to Tagged[] array, returns Tagged, invalidates cache

All tag writes validate via schema before mutation. Container and array writes invalidate the tagCacheMap to ensure subsequent reads reflect new values.

### When to Use Each Helper

**`writeToStore(store, value)`**
- ExecutionContext/Scope tag state management
- Isolated tag storage without container dependencies
- Testing tag extraction logic
- Example: `ctx.set(myTag, value)` internally uses writeToStore

**`writeToContainer(container, value)`**
- Adding metadata to flows, executors, or scopes
- Building container objects with tagged metadata
- Returns Tagged value for immediate use
- Side effect: initializes empty tags array if missing
- Example: Building flow with runtime tags

**`writeToTags(tagArray, value)`**
- Programmatic tag collection building
- Batch tag operations before container assignment
- Testing tag collection logic
- Returns Tagged value for immediate use
- Example: Building tags array to pass to scope constructor

ExecutionContext automatically seeds both scope tags and execution-provided tags into its tagStore during construction, ensuring all tag access methods (extractFrom, readFrom, get, find) work consistently.

## Execution Context Tag Resolution

When flows resolve tags from their dependencies, tags are resolved from the **execution context**, not the scope:

```typescript
const value = tag(custom<string>());
const scope = createScope({ tags: [value("scope-value")] });

const myFlow = flow([value], ([v]) => v);

const ctx = scope.createExecution({ tags: [value("context-value")] });
const result = await ctx.exec(myFlow, undefined);
// result === "context-value" (from execution context, NOT scope)
```

### Tag Resolution Hierarchy

1. **Execution context tags** - Highest priority (provided via `createExecution({ tags: [...] })`)
2. **Flow definition tags** - Medium priority (defined in `flow([...], ...)`)
3. **Scope tags** - Lowest priority (defined in `createScope({ tags: [...] })`)

Execution context tags **override** scope tags for any tag key that appears in both.

### Implementation Details

Internally, `scope.resolve()` accepts an optional `executionContext` parameter that:
- Bypasses scope cache to ensure context isolation
- Resolves tags from execution context's `tagStore` instead of scope
- Stores resolved values separately per context

This ensures each execution context is properly isolated with independent tag values.

## Tag Executors

Tags can be used in executor dependencies for automatic scope extraction.

### API

```typescript
import { tag, tags, derive, flow, provide } from "@pumped-fn/core-next";

// Define tags
const userIdTag = tag(custom<string>());
const roleTag = tag(custom<string>(), { default: "user" });

// Use in dependencies (sensible defaults)
derive([userIdTag, roleTag], ([userId, role]) => {
  // automatic extraction
});

// Explicit control with helpers
derive([
  tags.required(userIdTag),   // extractFrom
  tags.optional(roleTag),     // readFrom
  tags.all(permissionTag)     // collectFrom
], ([userId, role, permissions]) => {});

// Spread syntax in flow() - tags as rest parameters
const processUser = flow(
  async (ctx, userId: string) => {
    return { userId, processed: true }
  },
  userIdTag('user-123'),
  roleTag('admin')
);

// Spread syntax with dependencies
const dbClient = provide(() => ({ query: async () => {} }));
const fetchUser = flow(
  dbClient,
  async (db, ctx, userId: string) => {
    return await db.query()
  },
  userIdTag('user-123')
);

// Spread syntax in provide() and derive()
const userService = provide(
  () => ({ getUser: async () => ({}) }),
  userIdTag('service-user')
);

const userInfo = derive(
  [userIdTag, roleTag],
  ([userId, role]) => ({ userId, role }),
  userIdTag('derived-user')
);
```

### Definition vs Execution Tags

- `mergeFlowTags` (`packages/next/src/tags/merge.ts`) merges definition-time tags with execution-time overrides whenever a flow runs.
- Order is `[definition tags..., execution tags...]`; undefined entries are dropped.
- Execution tags travel through `flow.execute(..., { executionTags })` and become visible via `ctx.get(tag)`.

### Type Inference

- `Tag<T, false>` → `T` (uses extractFrom)
- `Tag<T, true>` → `T` (uses readFrom with default)
- `TagExecutor<T[]>` from `tags.all()` → `T[]`

### When to Use

- Request context (user ID, request ID, trace ID)
- Feature flags
- Optional configuration values
- Permissions/roles
