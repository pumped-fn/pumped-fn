# Tag Executors Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable tags to be used directly in executor dependencies with automatic scope extraction.

**Architecture:** Add TagExecutor type, create `tags` utility namespace with helpers (required/optional/all), extend type system to infer tag values, modify dependency resolution to detect and extract tags from scope.

**Tech Stack:** TypeScript, Vitest for testing, follows pumped-fn architecture patterns.

---

## Task 1: Add TagExecutor Type Definition

**Files:**
- Modify: `packages/next/src/tag-types.ts:56` (after Tag interface)

**Step 1: Write the failing test**

Create: `packages/next/tests/tag-executor-types.test.ts`

```typescript
import { describe, test, expect } from "vitest";
import { tagSymbol } from "../src/tag-types";
import type { Tag } from "../src/tag-types";

describe("TagExecutor Types", () => {
  test("TagExecutor has correct symbol values", () => {
    const mockTagExecutor: Tag.TagExecutor<string> = {
      [tagSymbol]: "required",
      tag: {} as any,
      extractionMode: "extract",
    };

    expect(mockTagExecutor[tagSymbol]).toBe("required");
    expect(mockTagExecutor.extractionMode).toBe("extract");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test tag-executor-types`
Expected: Type error - TagExecutor does not exist on Tag namespace

**Step 3: Add TagExecutor interface**

In `packages/next/src/tag-types.ts`, add after the Tag interface (around line 56):

```typescript
  export interface TagExecutor<T> extends Container {
    readonly [tagSymbol]: "required" | "optional" | "all";
    readonly tag: Tag<T, boolean>;
    readonly extractionMode: "extract" | "read" | "collect";
  }
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag-executor-types`
Expected: PASS

**Step 5: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/next/src/tag-types.ts packages/next/tests/tag-executor-types.test.ts
git commit -m "feat(types): add TagExecutor interface to tag-types"
```

---

## Task 2: Create Tag Executor Helpers

**Files:**
- Create: `packages/next/src/tag-executors.ts`
- Create: `packages/next/tests/tag-executors.test.ts`

**Step 1: Write the failing test**

Create: `packages/next/tests/tag-executors.test.ts`

```typescript
import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { tags, isTag, isTagExecutor } from "../src/tag-executors";
import { tagSymbol } from "../src/tag-types";

describe("Tag Executor Helpers", () => {
  test("tags.required creates TagExecutor with extract mode", () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const tagExec = tags.required(userIdTag);

    expect(tagExec[tagSymbol]).toBe("required");
    expect(tagExec.tag).toBe(userIdTag);
    expect(tagExec.extractionMode).toBe("extract");
  });

  test("tags.optional creates TagExecutor with read mode", () => {
    const roleTag = tag(custom<string>(), { label: "role" });
    const tagExec = tags.optional(roleTag);

    expect(tagExec[tagSymbol]).toBe("optional");
    expect(tagExec.tag).toBe(roleTag);
    expect(tagExec.extractionMode).toBe("read");
  });

  test("tags.all creates TagExecutor with collect mode", () => {
    const permTag = tag(custom<string>(), { label: "permission" });
    const tagExec = tags.all(permTag);

    expect(tagExec[tagSymbol]).toBe("all");
    expect(tagExec.tag).toBe(permTag);
    expect(tagExec.extractionMode).toBe("collect");
  });
});

describe("Tag Type Guards", () => {
  test("isTag detects raw tags", () => {
    const userIdTag = tag(custom<string>());
    expect(isTag(userIdTag)).toBe(true);
    expect(isTag({})).toBe(false);
    expect(isTag(null)).toBe(false);
  });

  test("isTagExecutor detects tag executors", () => {
    const userIdTag = tag(custom<string>());
    const tagExec = tags.required(userIdTag);

    expect(isTagExecutor(tagExec)).toBe(true);
    expect(isTagExecutor(userIdTag)).toBe(false);
    expect(isTagExecutor({})).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test tag-executors`
Expected: FAIL - module not found

**Step 3: Implement tag-executors module**

Create: `packages/next/src/tag-executors.ts`

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

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag-executors`
Expected: PASS (all tests)

**Step 5: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/next/src/tag-executors.ts packages/next/tests/tag-executors.test.ts
git commit -m "feat(tag): add tag executor helpers and type guards"
```

---

## Task 3: Update Type System for Tag Inference

**Files:**
- Modify: `packages/next/src/types.ts:271-279` (InferOutput type)
- Modify: `packages/next/src/types.ts:316-322` (DependencyLike types)

**Step 1: Write the failing test**

Create: `packages/next/tests/tag-type-inference.test.ts`

```typescript
import { describe, test, expectTypeOf } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { tags } from "../src/tag-executors";
import type { Core } from "../src/types";

describe("Tag Type Inference", () => {
  test("InferOutput extracts tag value type", () => {
    const userIdTag = tag(custom<string>());
    type Result = Core.InferOutput<typeof userIdTag>;
    expectTypeOf<Result>().toEqualTypeOf<string>();
  });

  test("InferOutput extracts TagExecutor value type", () => {
    const userIdTag = tag(custom<string>());
    const tagExec = tags.required(userIdTag);
    type Result = Core.InferOutput<typeof tagExec>;
    expectTypeOf<Result>().toEqualTypeOf<string>();
  });

  test("InferOutput extracts array type from tags.all", () => {
    const permTag = tag(custom<string>());
    const tagExec = tags.all(permTag);
    type Result = Core.InferOutput<typeof tagExec>;
    expectTypeOf<Result>().toEqualTypeOf<string[]>();
  });

  test("InferOutput works with mixed dependencies", () => {
    const userIdTag = tag(custom<string>());
    const roleTag = tag(custom<string>());

    type Deps = [typeof userIdTag, typeof roleTag];
    type Result = Core.InferOutput<Deps>;
    expectTypeOf<Result>().toEqualTypeOf<[string, string]>();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test tag-type-inference`
Expected: Type errors - InferOutput doesn't handle tags

**Step 3: Update InferOutput type**

In `packages/next/src/types.ts`, replace InferOutput (around line 271):

```typescript
  export type InferOutput<T> =
    T extends Tag.TagExecutor<infer U>
      ? U
      : T extends Tag.Tag<infer U, infer HasDefault>
        ? U
        : T extends Executor<infer U> | Reactive<infer U>
          ? Awaited<U>
          : T extends Lazy<infer U> | Static<infer U>
            ? Accessor<Awaited<U>>
            : T extends
                | ReadonlyArray<UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown>>
                | Record<string, UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown>>
              ? { [K in keyof T]: InferOutput<T[K]> }
              : never;
```

**Step 4: Update DependencyLike types**

In `packages/next/src/types.ts`, replace SingleDependencyLike and MultiDependencyLike (around line 316):

```typescript
  export type SingleDependencyLike =
    | UExecutor
    | Tag.Tag<unknown, boolean>
    | Tag.TagExecutor<unknown>;

  export type MultiDependencyLike =
    | ReadonlyArray<UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown>>
    | Record<string, UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown>>;
```

**Step 5: Add Tag import to types.ts**

At the top of `packages/next/src/types.ts` (around line 2):

```typescript
import { type Tag } from "./tag-types";
```

**Step 6: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag-type-inference`
Expected: PASS (all type assertions)

**Step 7: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 8: Commit**

```bash
git add packages/next/src/types.ts packages/next/tests/tag-type-inference.test.ts
git commit -m "feat(types): extend InferOutput and DependencyLike for tags"
```

---

## Task 4: Add Tag Resolution to Scope

**Files:**
- Modify: `packages/next/src/scope.ts` (add resolveTag and resolveTagExecutor methods)

**Step 1: Write the failing test**

Create: `packages/next/tests/tag-scope-resolution.test.ts`

```typescript
import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { createScope } from "../src/scope";
import { tags } from "../src/tag-executors";

describe("Tag Scope Resolution", () => {
  test("scope resolves raw tag with default using readFrom", async () => {
    const roleTag = tag(custom<string>(), { label: "role", default: "user" });
    const scope = createScope({ tags: [roleTag("admin")] });

    const result = await (scope as any).resolveTag(roleTag);
    expect(result).toBe("admin");
  });

  test("scope resolves raw tag without default using extractFrom", async () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const scope = createScope({ tags: [userIdTag("123")] });

    const result = await (scope as any).resolveTag(userIdTag);
    expect(result).toBe("123");
  });

  test("scope resolves tag executor with required mode", async () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const scope = createScope({ tags: [userIdTag("123")] });
    const tagExec = tags.required(userIdTag);

    const result = await (scope as any).resolveTagExecutor(tagExec);
    expect(result).toBe("123");
  });

  test("scope resolves tag executor with optional mode", async () => {
    const roleTag = tag(custom<string>(), { label: "role", default: "user" });
    const scope = createScope({ tags: [] });
    const tagExec = tags.optional(roleTag);

    const result = await (scope as any).resolveTagExecutor(tagExec);
    expect(result).toBe("user");
  });

  test("scope resolves tag executor with all mode", async () => {
    const permTag = tag(custom<string>(), { label: "permission" });
    const scope = createScope({
      tags: [permTag("read"), permTag("write"), permTag("delete")]
    });
    const tagExec = tags.all(permTag);

    const result = await (scope as any).resolveTagExecutor(tagExec);
    expect(result).toEqual(["read", "write", "delete"]);
  });

  test("tag without default throws when missing", async () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const scope = createScope({ tags: [] });

    expect(() => (scope as any).resolveTag(userIdTag)).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test tag-scope-resolution`
Expected: FAIL - resolveTag and resolveTagExecutor methods not found

**Step 3: Add resolveTag and resolveTagExecutor methods to BaseScope**

In `packages/next/src/scope.ts`, add these methods to the BaseScope class (around line 630, after `~resolveExecutor`):

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

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag-scope-resolution`
Expected: PASS (all tests)

**Step 5: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/next/src/scope.ts packages/next/tests/tag-scope-resolution.test.ts
git commit -m "feat(scope): add resolveTag and resolveTagExecutor methods"
```

---

## Task 5: Update Dependency Resolution Pipeline

**Files:**
- Modify: `packages/next/src/internal/dependency-utils.ts` (update resolveShape)

**Step 1: Write the failing test**

Create: `packages/next/tests/tag-dependency-resolution.test.ts`

```typescript
import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { provide, derive } from "../src/executor";
import { createScope } from "../src/scope";
import { tags } from "../src/tag-executors";

describe("Tag Dependency Resolution", () => {
  test("derive resolves raw tag in dependencies", async () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const scope = createScope({ tags: [userIdTag("user123")] });

    const executor = derive([userIdTag], ([userId]) => {
      return `Hello ${userId}`;
    });

    const result = await scope.resolve(executor);
    expect(result).toBe("Hello user123");
  });

  test("derive resolves tag executor in dependencies", async () => {
    const permTag = tag(custom<string>(), { label: "permission" });
    const scope = createScope({
      tags: [permTag("read"), permTag("write")]
    });

    const executor = derive([tags.all(permTag)], ([permissions]) => {
      return permissions.join(",");
    });

    const result = await scope.resolve(executor);
    expect(result).toBe("read,write");
  });

  test("derive resolves mixed executor and tag dependencies", async () => {
    const dbExecutor = provide(() => ({ query: () => "data" }));
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const scope = createScope({ tags: [userIdTag("user123")] });

    const executor = derive([dbExecutor, userIdTag], ([db, userId]) => {
      return `${db.query()} for ${userId}`;
    });

    const result = await scope.resolve(executor);
    expect(result).toBe("data for user123");
  });

  test("derive resolves tag array dependencies", async () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const roleTag = tag(custom<string>(), { label: "role", default: "user" });
    const scope = createScope({ tags: [userIdTag("123")] });

    const executor = derive([userIdTag, roleTag], ([userId, role]) => {
      return { userId, role };
    });

    const result = await scope.resolve(executor);
    expect(result).toEqual({ userId: "123", role: "user" });
  });

  test("derive resolves tag record dependencies", async () => {
    const userIdTag = tag(custom<string>(), { label: "userId" });
    const roleTag = tag(custom<string>(), { label: "role" });
    const scope = createScope({
      tags: [userIdTag("123"), roleTag("admin")]
    });

    const executor = derive(
      { user: userIdTag, role: roleTag },
      ({ user, role }) => {
        return `${user}:${role}`;
      }
    );

    const result = await scope.resolve(executor);
    expect(result).toBe("123:admin");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test tag-dependency-resolution`
Expected: FAIL - tags not handled in dependency resolution

**Step 3: Import tag utilities in dependency-utils.ts**

At top of `packages/next/src/internal/dependency-utils.ts`:

```typescript
import { isTag, isTagExecutor } from "../tag-executors";
import type { Tag } from "../tag-types";
```

**Step 4: Update unwrapTarget to handle tags**

In `packages/next/src/internal/dependency-utils.ts`, update the `unwrapTarget` function (around line 16):

```typescript
  const unwrapTarget = (item: Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>): Core.Executor<unknown> | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> => {
    if (isTagExecutor(item)) {
      return item;
    }

    if (isTag(item)) {
      return item;
    }

    const executor = !isExecutor(item) ? (item as Escapable<unknown>).escape() : item;

    if (isLazyExecutor(executor) || isReactiveExecutor(executor) || isStaticExecutor(executor)) {
      return executor.executor;
    }

    return executor as Core.Executor<unknown>;
  };
```

**Step 5: Update resolveItem to handle tags**

In `packages/next/src/internal/dependency-utils.ts`, update the `resolveItem` logic (around line 26):

```typescript
  const resolveItem = resolveFn
    ? resolveFn
    : async (item: Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>) => {
        if (isTagExecutor(item)) {
          return (scope as any).resolveTagExecutor(item);
        }

        if (isTag(item)) {
          return (scope as any).resolveTag(item);
        }

        const target = unwrapTarget(item);
        return await scope.resolve(target as Core.Executor<unknown>);
      };
```

**Step 6: Update ResolveFn type**

At the top of `packages/next/src/internal/dependency-utils.ts` (around line 5):

```typescript
type ResolveFn = (item: Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>) => Promise<unknown>;
```

**Step 7: Update resolveShape type signature**

In `packages/next/src/internal/dependency-utils.ts` (around line 7):

```typescript
export async function resolveShape<T extends Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | ReadonlyArray<Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>> | Record<string, Core.UExecutor | Tag.Tag<unknown, boolean> | Tag.TagExecutor<unknown> | Escapable<unknown>> | undefined>(
  scope: Core.Scope,
  shape: T,
  resolveFn?: ResolveFn
): Promise<any> {
```

**Step 8: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag-dependency-resolution`
Expected: PASS (all tests)

**Step 9: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 10: Commit**

```bash
git add packages/next/src/internal/dependency-utils.ts packages/next/tests/tag-dependency-resolution.test.ts
git commit -m "feat(deps): support tags in dependency resolution pipeline"
```

---

## Task 6: Export Tags Namespace

**Files:**
- Modify: `packages/next/src/index.ts`

**Step 1: Add export to index.ts**

In `packages/next/src/index.ts`, add export:

```typescript
export { tags } from "./tag-executors";
```

**Step 2: Verify exports work**

Create: `packages/next/tests/exports.test.ts`

```typescript
import { describe, test, expect } from "vitest";
import { tags } from "../src/index";
import { tag } from "../src/index";
import { custom } from "../src/index";

describe("Public Exports", () => {
  test("tags namespace is exported", () => {
    expect(tags).toBeDefined();
    expect(tags.required).toBeTypeOf("function");
    expect(tags.optional).toBeTypeOf("function");
    expect(tags.all).toBeTypeOf("function");
  });

  test("tags helpers work with exported tag function", () => {
    const userIdTag = tag(custom<string>());
    const tagExec = tags.required(userIdTag);

    expect(tagExec).toBeDefined();
  });
});
```

**Step 3: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test exports`
Expected: PASS

**Step 4: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/next/src/index.ts packages/next/tests/exports.test.ts
git commit -m "feat(exports): add tags namespace to public API"
```

---

## Task 7: Run Full Test Suite and Typecheck

**Step 1: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests pass

**Step 2: Run full typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: No type errors

**Step 3: If any failures, fix and re-run**

Fix any issues discovered, commit fixes separately.

**Step 4: Commit if any fixes were needed**

```bash
git add .
git commit -m "fix: resolve test/type issues from integration"
```

---

## Task 8: Update Examples

**Files:**
- Create: `examples/tag-executors-basic.ts`
- Create: `examples/tag-executors-advanced.ts`

**Step 1: Create basic example**

Create: `examples/tag-executors-basic.ts`

```typescript
import { tag, provide, derive, createScope, custom } from "@pumped-fn/core-next";

const userIdTag = tag(custom<string>(), { label: "userId" });
const roleTag = tag(custom<string>(), { label: "role", default: "user" });

const dbExecutor = provide(() => ({
  findUser: (id: string) => ({ id, name: "John" }),
}));

const userRepoExecutor = derive([dbExecutor, userIdTag, roleTag], ([db, userId, role]) => {
  const user = db.findUser(userId);
  return {
    ...user,
    role,
  };
});

const scope = createScope({
  tags: [userIdTag("user123"), roleTag("admin")],
});

const result = await scope.resolve(userRepoExecutor);
console.log(result);
```

**Step 2: Create advanced example**

Create: `examples/tag-executors-advanced.ts`

```typescript
import { tag, derive, createScope, custom, tags } from "@pumped-fn/core-next";

const permissionTag = tag(custom<string>(), { label: "permission" });
const featureFlagTag = tag(custom<string>(), { label: "feature" });
const timeoutTag = tag(custom<number>(), { label: "timeout", default: 5000 });

const serviceExecutor = derive(
  [
    tags.all(permissionTag),
    tags.all(featureFlagTag),
    tags.optional(timeoutTag),
  ],
  ([permissions, features, timeout]) => {
    return {
      permissions,
      features,
      timeout,
    };
  }
);

const scope = createScope({
  tags: [
    permissionTag("read"),
    permissionTag("write"),
    featureFlagTag("new-ui"),
    timeoutTag(3000),
  ],
});

const result = await scope.resolve(serviceExecutor);
console.log(result);
```

**Step 3: Verify examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add examples/tag-executors-basic.ts examples/tag-executors-advanced.ts
git commit -m "docs(examples): add tag executor usage examples"
```

---

## Task 9: Update Documentation

**Files:**
- Create: `docs/guides/tag-executors.md`

**Step 1: Create guide document**

Create: `docs/guides/tag-executors.md`

```markdown
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
```

**Step 2: Commit**

```bash
git add docs/guides/tag-executors.md
git commit -m "docs(guides): add tag executors guide"
```

---

## Task 10: Update Skill References

**Files:**
- Modify: `.claude/skills/pumped-design/references/tags.md` (if exists)
- Or create if needed

**Step 1: Check if skill references exist**

Run: `ls .claude/skills/pumped-design/references/tags.md`

**Step 2: Update or create tags.md reference**

If file exists, add section on tag executors. If not, create:

`.claude/skills/pumped-design/references/tags.md`

```markdown
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
```

**Step 3: Commit**

```bash
git add .claude/skills/pumped-design/references/tags.md
git commit -m "docs(skill): update tag references with executor usage"
```

---

## Verification Checklist

After all tasks complete:

- [ ] All tests pass: `pnpm -F @pumped-fn/core-next test`
- [ ] Full typecheck passes: `pnpm -F @pumped-fn/core-next typecheck:full`
- [ ] Examples typecheck: `pnpm -F @pumped-fn/examples typecheck`
- [ ] Documentation is clear and accurate
- [ ] Skill references updated
- [ ] All commits follow conventional commit format

---

## Notes

- Follow TDD strictly: write test, see it fail, implement, see it pass
- Keep commits atomic and descriptive
- Run typecheck after each task
- Test both runtime behavior and type inference
