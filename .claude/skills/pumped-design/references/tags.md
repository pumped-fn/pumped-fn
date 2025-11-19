# Tags Reference

## Tag Write Operations

Tags provide explicit helpers for each target type:

- `tag.injectTo(store, value)` - Legacy method, writes to Tag.Store only (backwards compatible)
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
