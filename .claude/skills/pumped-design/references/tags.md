# Tags Reference

## Tag Executors

Tags can be used in executor dependencies for automatic scope extraction.

### API

```typescript
import { tag, tags, derive } from "@pumped-fn/core-next";

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
