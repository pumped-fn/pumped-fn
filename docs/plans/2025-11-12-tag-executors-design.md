# Tag Executors Design

**Date:** 2025-11-12
**Status:** Design Complete, Ready for Implementation

## Overview

Enable tags to be used directly in executor dependencies, allowing automatic extraction of tag values from scope during dependency resolution. This eliminates manual extraction boilerplate and provides a clean, type-safe API for dependency injection.

## Motivation

**Current approach (manual extraction):**
```typescript
const userIdTag = tag(custom<string>(), { label: "userId" });

derive([dbExecutor], ([db], ctl) => {
  const userId = userIdTag.extractFrom(ctl.scope); // manual extraction
  return new UserRepo(db, userId);
});
```

**Desired approach (automatic extraction):**
```typescript
derive([dbExecutor, userIdTag], ([db, userId]) => {
  return new UserRepo(db, userId); // userId automatically extracted
});
```

## Design Goals

1. **Sensible defaults** - Tags work automatically based on their configuration (with/without default)
2. **Type safety** - Full type inference for tag values in dependencies
3. **Explicit control** - Advanced helpers for specific extraction behaviors
4. **Minimal API surface** - Keep tag API clean, use separate utilities for advanced cases
5. **Zero breaking changes** - Purely additive feature

## API Design

### Basic Usage (Sensible Defaults)

```typescript
const userIdTag = tag(custom<string>(), { label: "userId" });
const roleTag = tag(custom<string>(), { label: "role", default: "user" });

// Tags in dependencies use sensible defaults:
derive([dbExecutor, userIdTag, roleTag], ([db, userId, role]) => {
  // userIdTag has no default → uses extractFrom() → throws if missing
  // roleTag has default → uses readFrom() → returns value or "user"
  return new UserRepo(db, userId, role);
});
```

### Advanced Usage (Explicit Control)

```typescript
import { tags } from "@pumped-fn/core";

const permissionTag = tag(custom<string>(), { label: "permission" });

// Use helpers for explicit extraction behavior:
derive([
  dbExecutor,
  tags.required(userIdTag),      // extractFrom - throws if missing
  tags.optional(roleTag),         // readFrom - returns value or undefined/default
  tags.all(permissionTag)         // collectFrom - returns array
], ([db, userId, role, permissions]) => {
  // userId: string
  // role: string | undefined
  // permissions: string[]
});
```

## Type System

### New Types in tag-types.ts

```typescript
export interface TagExecutor<T> extends Tag.Container {
  readonly [tagSymbol]: "required" | "optional" | "all";
  readonly tag: Tag.Tag<T, boolean>;
  readonly extractionMode: "extract" | "read" | "collect";
}
```

### Extended InferOutput Type

```typescript
export type InferOutput<T> =
  T extends Tag.TagExecutor<infer U>
    ? U  // TagExecutor<string[]> from all() → string[]
    : T extends Tag.Tag<infer U, infer HasDefault>
      ? U  // Both required and optional return U (runtime determines behavior)
      : T extends Executor<infer U> | Reactive<infer U>
        ? Awaited<U>
        : T extends Lazy<infer U> | Static<infer U>
          ? Accessor<Awaited<U>>
          : T extends ReadonlyArray<UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown>>
            | Record<string, UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown>>
            ? { [K in keyof T]: InferOutput<T[K]> }
            : never;
```

### Updated Dependency Types

```typescript
export type SingleDependencyLike =
  | UExecutor
  | Tag.Tag<unknown, boolean>
  | Tag.TagExecutor<unknown>;

export type MultiDependencyLike =
  | ReadonlyArray<UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown>>
  | Record<string, UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown>>;
```

## Implementation Architecture

### 1. Tag Executor Helpers (src/tag-executors.ts)

New file containing the `tags` namespace:

```typescript
import { tagSymbol, type Tag } from "./tag-types";

export function required<T>(tag: Tag.Tag<T, boolean>): Tag.TagExecutor<T> {
  return {
    [tagSymbol]: "required",
    tag,
    extractionMode: "extract",
  };
}

export function optional<T>(tag: Tag.Tag<T, boolean>): Tag.TagExecutor<T> {
  return {
    [tagSymbol]: "optional",
    tag,
    extractionMode: "read",
  };
}

export function all<T>(tag: Tag.Tag<T, boolean>): Tag.TagExecutor<T[]> {
  return {
    [tagSymbol]: "all",
    tag,
    extractionMode: "collect",
  };
}

export const tags = {
  required,
  optional,
  all,
};

// Type guards
export function isTag<T>(input: unknown): input is Tag.Tag<T, boolean> {
  return (
    typeof input === "object" &&
    input !== null &&
    tagSymbol in input &&
    typeof (input as any).extractFrom === "function"
  );
}

export function isTagExecutor<T>(input: unknown): input is Tag.TagExecutor<T> {
  return (
    typeof input === "object" &&
    input !== null &&
    tagSymbol in input &&
    typeof (input as any)[tagSymbol] === "string" &&
    ["required", "optional", "all"].includes((input as any)[tagSymbol])
  );
}
```

### 2. Scope Resolution (src/scope.ts)

Add tag resolution methods:

```typescript
private resolveTag(tag: Tag.Tag<unknown, boolean>): unknown {
  const hasDefault = tag.default !== undefined;

  if (hasDefault) {
    return tag.readFrom(this);
  } else {
    return tag.extractFrom(this);
  }
}

private resolveTagExecutor(tagExec: Tag.TagExecutor<unknown>): unknown {
  switch (tagExec.extractionMode) {
    case "extract":
      return tagExec.tag.extractFrom(this);
    case "read":
      return tagExec.tag.readFrom(this);
    case "collect":
      return tagExec.tag.collectFrom(this);
  }
}
```

Modify `~resolveExecutor` to handle tags (exact location TBD during implementation).

### 3. Dependency Resolution (src/internal/dependency-utils.ts)

Update `resolveShape` to handle tags in the resolution pipeline:

```typescript
const unwrapTarget = (item: Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>) => {
  if (isTagExecutor(item)) {
    return item;
  }

  if (isTag(item)) {
    return item;
  }

  // existing executor unwrapping logic...
};

const resolveItem = resolveFn
  ? resolveFn
  : async (item: ...) => {
      if (isTagExecutor(item)) {
        return scope["resolveTagExecutor"](item);
      }

      if (isTag(item)) {
        return scope["resolveTag"](item);
      }

      // existing executor resolution...
    };
```

## Files to Modify

1. **src/tag-types.ts** - Add `TagExecutor` interface
2. **src/tag-executors.ts** - NEW: `tags` namespace, helpers, type guards
3. **src/types.ts** - Update `InferOutput`, `DependencyLike` types
4. **src/scope.ts** - Add `resolveTag`, `resolveTagExecutor` methods
5. **src/internal/dependency-utils.ts** - Update `resolveShape` to handle tags
6. **src/index.ts** - Export `tags` namespace

## Testing Strategy

### Unit Tests (packages/next/tests/tag-executors.test.ts)

- Tag detection (`isTag`, `isTagExecutor`)
- Helper function creation (`tags.required`, `tags.optional`, `tags.all`)
- Type guard accuracy

### Integration Tests (packages/next/tests/tag-dependency-resolution.test.ts)

- Raw tag in dependencies (sensible defaults)
- `tags.required()` extraction (throws if missing)
- `tags.optional()` extraction (returns undefined or default)
- `tags.all()` collection (returns array)
- Mixed dependencies (executors + tags)
- Array dependencies with tags
- Record dependencies with tags
- Nested tags in complex dependency shapes

### Type Tests (packages/next/tests/tag-types.test.ts)

- Type inference for raw tags
- Type inference for tag executors
- Mixed dependency type inference
- Error cases (type mismatches)

## Migration Path

This is a purely additive feature with zero breaking changes:

1. Existing code continues to work unchanged
2. Users can gradually migrate to tag-in-dependencies pattern
3. Both patterns (manual extraction vs automatic) can coexist

## Examples

### Example 1: HTTP Request Context

```typescript
const requestIdTag = tag(custom<string>(), { label: "requestId" });
const userIdTag = tag(custom<string>(), { label: "userId" });

const loggerExecutor = derive([requestIdTag, userIdTag], ([requestId, userId]) => {
  return createLogger({ requestId, userId });
});
```

### Example 2: Feature Flags

```typescript
const featureFlagsTag = tag(custom<string>(), { label: "feature" });

const featureService = derive([
  configExecutor,
  tags.all(featureFlagsTag)
], ([config, enabledFeatures]) => {
  return new FeatureService(config, enabledFeatures);
});
```

### Example 3: Optional Configuration

```typescript
const timeoutTag = tag(custom<number>(), { label: "timeout", default: 5000 });
const retriesTag = tag(custom<number>(), { label: "retries", default: 3 });

const httpClient = derive([timeoutTag, retriesTag], ([timeout, retries]) => {
  return createHttpClient({ timeout, retries });
});
```

## Open Questions

None - design is complete and validated.

## Next Steps

1. Set up isolated worktree for implementation
2. Create detailed implementation plan
3. Implement with TDD (write tests first)
4. Update examples in `examples/`
5. Update documentation in `docs/guides/`
6. Update skill references in `.claude/skills/pumped-design/references/`
