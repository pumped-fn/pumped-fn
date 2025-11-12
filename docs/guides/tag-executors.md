# Tag Executors

Tags can be used directly in executor dependencies, enabling automatic extraction from scope.

## Basic Usage

```typescript
import { tag, derive, createScope, custom } from "@pumped-fn/core-next";

const userIdTag = tag(custom<string>(), { label: "userId" });
const roleTag = tag(custom<string>(), { label: "role", default: "user" });

const executor = derive([userIdTag, roleTag], ([userId, role]) => {
  return { userId, role };
});

const scope = createScope({
  tags: [userIdTag("user123"), roleTag("admin")],
});

await scope.resolve(executor); // { userId: "user123", role: "admin" }
```

## Sensible Defaults

Tags automatically use appropriate extraction based on their configuration:

- **Tag with default** → uses `readFrom()` (returns value or default)
- **Tag without default** → uses `extractFrom()` (throws if missing)

```typescript
const requiredTag = tag(custom<string>()); // throws if missing
const optionalTag = tag(custom<string>(), { default: "fallback" }); // returns default if missing

derive([requiredTag, optionalTag], ([required, optional]) => {
  // required: string (throws if not in scope)
  // optional: string (returns "fallback" if not in scope)
});
```

## Advanced Control

Use the `tags` namespace for explicit extraction behavior:

```typescript
import { tags } from "@pumped-fn/core-next";

const permissionTag = tag(custom<string>(), { label: "permission" });

derive([
  tags.required(userIdTag),    // extractFrom - throws if missing
  tags.optional(roleTag),       // readFrom - returns value or undefined/default
  tags.all(permissionTag)       // collectFrom - returns array
], ([userId, role, permissions]) => {
  // userId: string
  // role: string | undefined
  // permissions: string[]
});
```

## Helpers

### `tags.required(tag)`

Explicitly use `extractFrom` - throws if value not found in scope.

### `tags.optional(tag)`

Explicitly use `readFrom` - returns undefined (or default) if not found.

### `tags.all(tag)`

Use `collectFrom` - returns array of all matching values.

## Type Inference

TypeScript automatically infers the correct types:

```typescript
const userIdTag = tag(custom<string>());
const rolesTag = tag(custom<string>());

derive([userIdTag, tags.all(rolesTag)], ([userId, roles]) => {
  // userId: string (inferred from Tag.Tag<string, false>)
  // roles: string[] (inferred from Tag.TagExecutor<string[]>)
});
```

## Mixed Dependencies

Tags work alongside executors in dependency arrays:

```typescript
const dbExecutor = provide(() => new Database());
const userIdTag = tag(custom<string>());

derive([dbExecutor, userIdTag], ([db, userId]) => {
  return new UserRepository(db, userId);
});
```
