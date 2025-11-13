# Tags Reference

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

### Type Inference

- `Tag<T, false>` → `T` (uses extractFrom)
- `Tag<T, true>` → `T` (uses readFrom with default)
- `TagExecutor<T[]>` from `tags.all()` → `T[]`

### When to Use

- Request context (user ID, request ID, trace ID)
- Feature flags
- Optional configuration values
- Permissions/roles
