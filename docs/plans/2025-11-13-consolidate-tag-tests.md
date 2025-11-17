# Consolidate Tag Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Consolidate 7 overlapping tag test files into a single source-organized tag.test.ts

**Architecture:** Source-first organization (Map, Array, Scope) with test.each for extraction methods. Remove type inference tests (tsc handles that). Remove duplicate coverage tests.

**Tech Stack:** Vitest, TypeScript

**Related:** Tag merge behavior lives in `docs/plans/2025-11-17-flow-tag-helpers.md`

---

## Task 1: Create Consolidated Tag Test Structure

**Files:**
- Create: `packages/next/tests/tag.test.ts` (backup old to tag.test.ts.backup)
- Reference: Design in `docs/plans/2025-11-13-consolidate-tag-tests.md`

**Step 1: Backup existing tag.test.ts**

```bash
mv packages/next/tests/tag.test.ts packages/next/tests/tag.test.ts.backup
```

**Step 2: Create new tag.test.ts with structure**

Create `packages/next/tests/tag.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";
import { createScope } from "../src/scope";
import { tags, isTag, isTagExecutor } from "../src/tag-executors";
import { provide, derive } from "../src/executor";
import { tagSymbol, type Tag } from "../src/tag-types";
import { inspect } from "node:util";

describe("Tag System", () => {
  describe("Tag Creation", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("extractFrom", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("readFrom", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("collectFrom", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("injectTo", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("Tag Executors", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("Derive Integration", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    test("placeholder", () => {
      expect(true).toBe(true);
    });
  });
});
```

**Step 3: Verify structure typechecks and runs**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (8 placeholder tests)

**Step 4: Commit structure**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test: create consolidated tag test structure"
```

---

## Task 2: Implement Tag Creation Tests

**Files:**
- Modify: `packages/next/tests/tag.test.ts:9-12`
- Reference: `packages/next/tests/tag.test.ts.backup:7-248`

**Step 1: Replace Tag Creation placeholder**

Replace placeholder in `packages/next/tests/tag.test.ts`:

```typescript
  describe("Tag Creation", () => {
    test("creates tag with label", () => {
      const emailTag = tag(custom<string>(), { label: "email" });

      expect(typeof emailTag.key).toBe("symbol");
      expect(emailTag.label).toBe("email");
      expect(emailTag.schema).toBeDefined();
      expect(emailTag.toString()).toBe("Tag(email)");
    });

    test("creates tag without label (anonymous)", () => {
      const anonTag = tag(custom<string>());

      expect(typeof anonTag.key).toBe("symbol");
      expect(anonTag.label).toBeUndefined();
      expect(anonTag.toString()).toContain("Tag(");
    });

    test("creates tag with default value", () => {
      const portTag = tag(custom<number>(), { label: "port", default: 3000 });

      expect(portTag.default).toBe(3000);
    });

    test("callable creates Tagged value", () => {
      const emailTag = tag(custom<string>(), { label: "email" });
      const tagged = emailTag("test@example.com");

      expect(tagged.key).toBe(emailTag.key);
      expect(tagged.value).toBe("test@example.com");
      expect(tagged[tagSymbol]).toBe(true);
      expect(tagged.toString()).toBe("email=\"test@example.com\"");
    });

    test("callable with default can omit value", () => {
      const portTag = tag(custom<number>(), { default: 3000 });
      const tagged = portTag();

      expect(tagged.value).toBe(3000);
    });

    test("callable with default can override default", () => {
      const portTag = tag(custom<number>(), { default: 3000 });
      const tagged = portTag(8080);

      expect(tagged.value).toBe(8080);
    });

    test("callable without default throws when called without value", () => {
      const emailTag = tag(custom<string>()) as unknown as Tag.Tag<string, true>;

      expect(() => emailTag()).toThrow("Value required");
    });

    test("entry creates symbol-value tuple", () => {
      const emailTag = tag(custom<string>(), { label: "email" });
      const [key, value] = emailTag.entry("test@example.com");

      expect(key).toBe(emailTag.key);
      expect(value).toBe("test@example.com");
    });

    test("entry with default can omit value", () => {
      const portTag = tag(custom<number>(), { default: 3000 });
      const [key, value] = portTag.entry();

      expect(key).toBe(portTag.key);
      expect(value).toBe(3000);
    });

    test("entry without default throws when called without value", () => {
      const emailTag = tag(custom<string>()) as unknown as Tag.Tag<string, true>;

      expect(() => emailTag.entry()).toThrow();
    });

    test("entry can initialize Map", () => {
      const portTag = tag(custom<number>(), { default: 3000 });
      const store = new Map([portTag.entry()]);

      expect(portTag.extractFrom(store)).toBe(3000);
    });

    test("Symbol.toStringTag shows label", () => {
      const portTag = tag(custom<number>(), { label: "port" });

      expect(portTag[Symbol.toStringTag]).toBe("Tag<port>");
    });

    test("Tagged value inspect shows formatted output", () => {
      const portTag = tag(custom<number>(), { label: "port" });
      const tagged = portTag(8080);
      const output = inspect(tagged);

      expect(output).toContain("port");
      expect(output).toContain("8080");
    });
  });
```

**Step 2: Run tests to verify**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (all Tag Creation tests pass)

**Step 3: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test: add Tag Creation tests to consolidated file"
```

---

## Task 3: Implement extractFrom Tests

**Files:**
- Modify: `packages/next/tests/tag.test.ts` (extractFrom section)
- Reference: Tag API in `packages/next/src/tag.ts:147-156`

**Step 1: Replace extractFrom placeholder**

Replace placeholder in extractFrom section:

```typescript
  describe("extractFrom", () => {
    describe("without default", () => {
      test.each([
        {
          source: "Map",
          createEmpty: () => new Map<symbol, unknown>(),
          createWithValue: (tag: Tag.Tag<string>, value: string) => {
            const map = new Map<symbol, unknown>();
            map.set(tag.key, value);
            return map;
          },
        },
        {
          source: "Array",
          createEmpty: () => [] as Tag.Tagged<string>[],
          createWithValue: (tag: Tag.Tag<string>, value: string) => [tag(value)],
        },
        {
          source: "Scope",
          createEmpty: () => createScope({ tags: [] }),
          createWithValue: (tag: Tag.Tag<string>, value: string) =>
            createScope({ tags: [tag(value)] }),
        },
      ])("$source - throws when value missing", ({ createEmpty }) => {
        const testTag = tag(custom<string>(), { label: "test" });
        const source = createEmpty();

        expect(() => testTag.extractFrom(source), "should throw for missing value").toThrow(
          "Value not found for key:"
        );
      });

      test.each([
        {
          source: "Map",
          createWithValue: (tag: Tag.Tag<string>, value: string) => {
            const map = new Map<symbol, unknown>();
            map.set(tag.key, value);
            return map;
          },
        },
        {
          source: "Array",
          createWithValue: (tag: Tag.Tag<string>, value: string) => [tag(value)],
        },
        {
          source: "Scope",
          createWithValue: (tag: Tag.Tag<string>, value: string) =>
            createScope({ tags: [tag(value)] }),
        },
      ])("$source - returns value when present", ({ createWithValue }) => {
        const testTag = tag(custom<string>(), { label: "test" });
        const source = createWithValue(testTag, "test-value");

        const result = testTag.extractFrom(source);

        expect(result, "should return actual value").toBe("test-value");
      });
    });

    describe("with default", () => {
      test.each([
        {
          source: "Map",
          createEmpty: () => new Map<symbol, unknown>(),
        },
        {
          source: "Array",
          createEmpty: () => [] as Tag.Tagged<number>[],
        },
        {
          source: "Scope",
          createEmpty: () => createScope({ tags: [] }),
        },
      ])("$source - returns default when missing", ({ createEmpty }) => {
        const testTag = tag(custom<number>(), { label: "test", default: 42 });
        const source = createEmpty();

        const result = testTag.extractFrom(source);

        expect(result, "should return default value").toBe(42);
      });

      test.each([
        {
          source: "Map",
          createWithValue: (tag: Tag.Tag<number>, value: number) => {
            const map = new Map<symbol, unknown>();
            map.set(tag.key, value);
            return map;
          },
        },
        {
          source: "Array",
          createWithValue: (tag: Tag.Tag<number>, value: number) => [tag(value)],
        },
        {
          source: "Scope",
          createWithValue: (tag: Tag.Tag<number>, value: number) =>
            createScope({ tags: [tag(value)] }),
        },
      ])("$source - returns actual value over default", ({ createWithValue }) => {
        const testTag = tag(custom<number>(), { label: "test", default: 42 });
        const source = createWithValue(testTag, 100);

        const result = testTag.extractFrom(source);

        expect(result, "should return actual value, not default").toBe(100);
      });
    });
  });
```

**Step 2: Run tests to verify**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (extractFrom tests pass)

**Step 3: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test: add extractFrom tests to consolidated file"
```

---

## Task 4: Implement readFrom Tests

**Files:**
- Modify: `packages/next/tests/tag.test.ts` (readFrom section)
- Reference: Tag API in `packages/next/src/tag.ts:158-161`

**Step 1: Replace readFrom placeholder**

Replace placeholder in readFrom section:

```typescript
  describe("readFrom", () => {
    describe("without default", () => {
      test.each([
        {
          source: "Map",
          createEmpty: () => new Map<symbol, unknown>(),
        },
        {
          source: "Array",
          createEmpty: () => [] as Tag.Tagged<string>[],
        },
        {
          source: "Scope",
          createEmpty: () => createScope({ tags: [] }),
        },
      ])("$source - returns undefined when missing", ({ createEmpty }) => {
        const testTag = tag(custom<string>(), { label: "test" });
        const source = createEmpty();

        const result = testTag.readFrom(source);

        expect(result, "should return undefined").toBeUndefined();
      });

      test.each([
        {
          source: "Map",
          createWithValue: (tag: Tag.Tag<string>, value: string) => {
            const map = new Map<symbol, unknown>();
            map.set(tag.key, value);
            return map;
          },
        },
        {
          source: "Array",
          createWithValue: (tag: Tag.Tag<string>, value: string) => [tag(value)],
        },
        {
          source: "Scope",
          createWithValue: (tag: Tag.Tag<string>, value: string) =>
            createScope({ tags: [tag(value)] }),
        },
      ])("$source - returns value when present", ({ createWithValue }) => {
        const testTag = tag(custom<string>(), { label: "test" });
        const source = createWithValue(testTag, "test-value");

        const result = testTag.readFrom(source);

        expect(result, "should return actual value").toBe("test-value");
      });
    });

    describe("with default", () => {
      test.each([
        {
          source: "Map",
          createEmpty: () => new Map<symbol, unknown>(),
        },
        {
          source: "Array",
          createEmpty: () => [] as Tag.Tagged<number>[],
        },
        {
          source: "Scope",
          createEmpty: () => createScope({ tags: [] }),
        },
      ])("$source - returns default when missing", ({ createEmpty }) => {
        const testTag = tag(custom<number>(), { label: "test", default: 42 });
        const source = createEmpty();

        const result = testTag.readFrom(source);

        expect(result, "should return default value").toBe(42);
      });

      test.each([
        {
          source: "Map",
          createWithValue: (tag: Tag.Tag<number>, value: number) => {
            const map = new Map<symbol, unknown>();
            map.set(tag.key, value);
            return map;
          },
        },
        {
          source: "Array",
          createWithValue: (tag: Tag.Tag<number>, value: number) => [tag(value)],
        },
        {
          source: "Scope",
          createWithValue: (tag: Tag.Tag<number>, value: number) =>
            createScope({ tags: [tag(value)] }),
        },
      ])("$source - returns actual value over default", ({ createWithValue }) => {
        const testTag = tag(custom<number>(), { label: "test", default: 42 });
        const source = createWithValue(testTag, 100);

        const result = testTag.readFrom(source);

        expect(result, "should return actual value, not default").toBe(100);
      });
    });
  });
```

**Step 2: Run tests to verify**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (readFrom tests pass)

**Step 3: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test: add readFrom tests to consolidated file"
```

---

## Task 5: Implement collectFrom Tests

**Files:**
- Modify: `packages/next/tests/tag.test.ts` (collectFrom section)
- Reference: Tag API in `packages/next/src/tag.ts:163-165`

**Step 1: Replace collectFrom placeholder**

Replace placeholder in collectFrom section:

```typescript
  describe("collectFrom", () => {
    test.each([
      {
        source: "Map",
        createEmpty: () => new Map<symbol, unknown>(),
      },
      {
        source: "Array",
        createEmpty: () => [] as Tag.Tagged<string>[],
      },
      {
        source: "Scope",
        createEmpty: () => createScope({ tags: [] }),
      },
    ])("$source - returns empty array when no match", ({ createEmpty }) => {
      const testTag = tag(custom<string>(), { label: "test" });
      const source = createEmpty();

      const result = testTag.collectFrom(source);

      expect(result, "should return empty array").toEqual([]);
    });

    test("Map - returns single value in array", () => {
      const testTag = tag(custom<string>(), { label: "test" });
      const store = new Map<symbol, unknown>();
      store.set(testTag.key, "value");

      const result = testTag.collectFrom(store);

      expect(result, "Map should return single value").toEqual(["value"]);
    });

    test("Array - returns all matching values", () => {
      const testTag = tag(custom<string>(), { label: "test" });
      const tags: Tag.Tagged<string>[] = [
        testTag("value1"),
        testTag("value2"),
        testTag("value3"),
      ];

      const result = testTag.collectFrom(tags);

      expect(result, "should collect all matching values").toEqual([
        "value1",
        "value2",
        "value3",
      ]);
    });

    test("Array - filters by key in mixed array", () => {
      const emailTag = tag(custom<string>(), { label: "email" });
      const nameTag = tag(custom<string>(), { label: "name" });
      const tags: Tag.Tagged[] = [
        emailTag("test@example.com"),
        nameTag("John"),
        emailTag("another@example.com"),
      ];

      const result = emailTag.collectFrom(tags);

      expect(result, "should filter by tag key").toEqual([
        "test@example.com",
        "another@example.com",
      ]);
    });

    test("Scope - returns all matching values", () => {
      const permTag = tag(custom<string>(), { label: "permission" });
      const scope = createScope({
        tags: [permTag("read"), permTag("write"), permTag("delete")],
      });

      const result = permTag.collectFrom(scope);

      expect(result, "should collect all from scope").toEqual([
        "read",
        "write",
        "delete",
      ]);
    });
  });
```

**Step 2: Run tests to verify**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (collectFrom tests pass)

**Step 3: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test: add collectFrom tests to consolidated file"
```

---

## Task 6: Implement injectTo Tests

**Files:**
- Modify: `packages/next/tests/tag.test.ts` (injectTo section)
- Reference: Tag API in `packages/next/src/tag.ts:167-177`

**Step 1: Replace injectTo placeholder**

Replace placeholder in injectTo section:

```typescript
  describe("injectTo", () => {
    test("mutates Map with value", () => {
      const emailTag = tag(custom<string>(), { label: "email" });
      const store = new Map<symbol, unknown>();

      emailTag.injectTo(store, "test@example.com");

      expect(emailTag.extractFrom(store), "should be in store").toBe(
        "test@example.com"
      );
    });

    test("validates value via schema", () => {
      const numberTag = tag({
        "~standard": {
          vendor: "test",
          version: 1,
          validate(value) {
            if (typeof value !== "number") {
              return { issues: [{ message: "must be number" }] };
            }
            return { value };
          },
        },
      });
      const store = new Map<symbol, unknown>();

      expect(() =>
        numberTag.injectTo(store, "invalid" as unknown as number)
      ).toThrow();
    });
  });
```

**Step 2: Run tests to verify**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (injectTo tests pass)

**Step 3: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test: add injectTo tests to consolidated file"
```

---

## Task 7: Implement Tag Executors Tests

**Files:**
- Modify: `packages/next/tests/tag.test.ts` (Tag Executors section)
- Reference: `packages/next/tests/tag-executors.test.ts`, `packages/next/tests/tag-scope-resolution.test.ts`

**Step 1: Replace Tag Executors placeholder**

Replace placeholder in Tag Executors section:

```typescript
  describe("Tag Executors", () => {
    test("tags.required creates TagExecutor with extract mode", () => {
      const userIdTag = tag(custom<string>(), { label: "userId" });
      const tagExec = tags.required(userIdTag);

      expect(tagExec[tagSymbol], "should have required symbol").toBe("required");
      expect(tagExec.tag, "should reference tag").toBe(userIdTag);
      expect(tagExec.extractionMode, "should use extract mode").toBe("extract");
    });

    test("tags.optional creates TagExecutor with read mode", () => {
      const roleTag = tag(custom<string>(), { label: "role" });
      const tagExec = tags.optional(roleTag);

      expect(tagExec[tagSymbol], "should have optional symbol").toBe("optional");
      expect(tagExec.tag, "should reference tag").toBe(roleTag);
      expect(tagExec.extractionMode, "should use read mode").toBe("read");
    });

    test("tags.all creates TagExecutor with collect mode", () => {
      const permTag = tag(custom<string>(), { label: "permission" });
      const tagExec = tags.all(permTag);

      expect(tagExec[tagSymbol], "should have all symbol").toBe("all");
      expect(tagExec.tag, "should reference tag").toBe(permTag);
      expect(tagExec.extractionMode, "should use collect mode").toBe("collect");
    });

    test("isTag detects raw tags", () => {
      const userIdTag = tag(custom<string>());

      expect(isTag(userIdTag), "should detect tag").toBe(true);
      expect(isTag({}), "should reject plain object").toBe(false);
      expect(isTag(null), "should reject null").toBe(false);
    });

    test("isTagExecutor detects tag executors", () => {
      const userIdTag = tag(custom<string>());
      const tagExec = tags.required(userIdTag);

      expect(isTagExecutor(tagExec), "should detect tag executor").toBe(true);
      expect(isTagExecutor(userIdTag), "should reject raw tag").toBe(false);
      expect(isTagExecutor({}), "should reject plain object").toBe(false);
    });

    test("scope resolves raw tag with default using readFrom", async () => {
      const roleTag = tag(custom<string>(), { label: "role", default: "user" });
      const scope = createScope({ tags: [roleTag("admin")] });

      const result = await (scope as any).resolveTag(roleTag);

      expect(result, "should resolve tag value").toBe("admin");
    });

    test("scope resolves raw tag without default using extractFrom", async () => {
      const userIdTag = tag(custom<string>(), { label: "userId" });
      const scope = createScope({ tags: [userIdTag("123")] });

      const result = await (scope as any).resolveTag(userIdTag);

      expect(result, "should resolve tag value").toBe("123");
    });

    test("scope resolves tag executor with required mode", async () => {
      const userIdTag = tag(custom<string>(), { label: "userId" });
      const scope = createScope({ tags: [userIdTag("123")] });
      const tagExec = tags.required(userIdTag);

      const result = await (scope as any).resolveTagExecutor(tagExec);

      expect(result, "should extract value").toBe("123");
    });

    test("scope resolves tag executor with optional mode", async () => {
      const roleTag = tag(custom<string>(), { label: "role", default: "user" });
      const scope = createScope({ tags: [] });
      const tagExec = tags.optional(roleTag);

      const result = await (scope as any).resolveTagExecutor(tagExec);

      expect(result, "should return default").toBe("user");
    });

    test("scope resolves tag executor with all mode", async () => {
      const permTag = tag(custom<string>(), { label: "permission" });
      const scope = createScope({
        tags: [permTag("read"), permTag("write"), permTag("delete")],
      });
      const tagExec = tags.all(permTag);

      const result = await (scope as any).resolveTagExecutor(tagExec);

      expect(result, "should collect all values").toEqual([
        "read",
        "write",
        "delete",
      ]);
    });

    test("tag without default throws when missing", async () => {
      const userIdTag = tag(custom<string>(), { label: "userId" });
      const scope = createScope({ tags: [] });

      await expect((scope as any).resolveTag(userIdTag)).rejects.toThrow();
    });
  });
```

**Step 2: Run tests to verify**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (Tag Executors tests pass)

**Step 3: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test: add Tag Executors tests to consolidated file"
```

---

## Task 8: Implement Derive Integration Tests

**Files:**
- Modify: `packages/next/tests/tag.test.ts` (Derive Integration section)
- Reference: `packages/next/tests/tag-dependency-resolution.test.ts`

**Step 1: Replace Derive Integration placeholder**

Replace placeholder in Derive Integration section:

```typescript
  describe("Derive Integration", () => {
    test("derive resolves raw tag in array dependencies", async () => {
      const userIdTag = tag(custom<string>(), { label: "userId" });
      const scope = createScope({ tags: [userIdTag("user123")] });

      const executor = derive([userIdTag], ([userId]) => `Hello ${userId}`);

      const result = await scope.resolve(executor);

      expect(result, "should resolve tag dependency").toBe("Hello user123");
    });

    test("derive resolves tag executor in dependencies", async () => {
      const permTag = tag(custom<string>(), { label: "permission" });
      const scope = createScope({
        tags: [permTag("read"), permTag("write")],
      });

      const executor = derive([tags.all(permTag)], ([permissions]) =>
        permissions.join(",")
      );

      const result = await scope.resolve(executor);

      expect(result, "should resolve tag executor").toBe("read,write");
    });

    test("derive resolves mixed executor and tag dependencies", async () => {
      const dbExecutor = provide(() => ({ query: () => "data" }));
      const userIdTag = tag(custom<string>(), { label: "userId" });
      const scope = createScope({ tags: [userIdTag("user123")] });

      const executor = derive([dbExecutor, userIdTag], ([db, userId]) =>
        `${db.query()} for ${userId}`
      );

      const result = await scope.resolve(executor);

      expect(result, "should resolve mixed dependencies").toBe(
        "data for user123"
      );
    });

    test("derive resolves tag array dependencies", async () => {
      const userIdTag = tag(custom<string>(), { label: "userId" });
      const roleTag = tag(custom<string>(), { label: "role", default: "user" });
      const scope = createScope({ tags: [userIdTag("123")] });

      const executor = derive([userIdTag, roleTag], ([userId, role]) => ({
        userId,
        role,
      }));

      const result = await scope.resolve(executor);

      expect(result, "should resolve multiple tags").toEqual({
        userId: "123",
        role: "user",
      });
    });

    test("derive resolves tag object dependencies", async () => {
      const userIdTag = tag(custom<string>(), { label: "userId" });
      const roleTag = tag(custom<string>(), { label: "role" });
      const scope = createScope({
        tags: [userIdTag("123"), roleTag("admin")],
      });

      const executor = derive(
        { user: userIdTag, role: roleTag },
        ({ user, role }) => `${user}:${role}`
      );

      const result = await scope.resolve(executor);

      expect(result, "should resolve object dependencies").toBe("123:admin");
    });

    test("throws when tag has no default and value is missing", async () => {
      const requiredTag = tag(custom<string>(), { label: "required" });
      const scope = createScope({ tags: [] });

      const executor = derive([requiredTag], ([val]) => val);

      await expect(scope.resolve(executor)).rejects.toThrow();
    });

    test("throws when tags.required() used and value is missing", async () => {
      const requiredTag = tag(custom<string>(), { label: "required" });
      const scope = createScope({ tags: [] });

      const executor = derive([tags.required(requiredTag)], ([val]) => val);

      await expect(scope.resolve(executor)).rejects.toThrow();
    });

    test("returns empty array when tags.all() has no matches", async () => {
      const myTag = tag(custom<string>(), { label: "myTag" });
      const scope = createScope({ tags: [] });

      const executor = derive([tags.all(myTag)], ([values]) => values);

      const result = await scope.resolve(executor);

      expect(result, "should return empty array").toEqual([]);
    });
  });
```

**Step 2: Run tests to verify**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (Derive Integration tests pass)

**Step 3: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test: add Derive Integration tests to consolidated file"
```

---

## Task 9: Implement Edge Cases Tests

**Files:**
- Modify: `packages/next/tests/tag.test.ts` (Edge Cases section)
- Reference: `packages/next/tests/coverage-gaps.test.ts:34-108`

**Step 1: Replace Edge Cases placeholder**

Replace placeholder in Edge Cases section:

```typescript
  describe("Edge Cases", () => {
    test("schema validation throws on invalid value", () => {
      const numberTag = tag({
        "~standard": {
          vendor: "test",
          version: 1,
          validate(value) {
            if (typeof value !== "number") {
              return { issues: [{ message: "must be number" }] };
            }
            return { value };
          },
        },
      });

      expect(() => numberTag("invalid" as unknown as number)).toThrow();
    });

    test("anonymous tag (no label) works correctly", () => {
      const anonTag = tag(custom<string>());
      const store = new Map();

      anonTag.injectTo(store, "value");
      const result = anonTag.readFrom(store);

      expect(result, "anonymous tag should work").toBe("value");
    });

    test("extractFrom with different key returns undefined from array", () => {
      const testTag = tag(custom<string>(), { label: "test.meta" });
      const otherTag = tag(custom<string>(), { label: "test.other" });
      const tagArray = [otherTag("test-value")];

      const result = testTag.readFrom(tagArray);

      expect(result, "should not find different key").toBeUndefined();
    });

    test("readFrom executor with different tag returns undefined", () => {
      const testTag = tag(custom<number>(), { label: "test.exec" });
      const otherTag = tag(custom<number>(), { label: "test.other" });
      const exec = provide(() => 1, otherTag(42));

      const result = testTag.readFrom(exec);

      expect(result, "should not find different key").toBeUndefined();
    });

    test("extractFrom throws with descriptive error", () => {
      const testTag = tag(custom<number>(), { label: "test.key" });
      const store = new Map();

      expect(() => testTag.extractFrom(store)).toThrow("Value not found for key:");
    });
  });
```

**Step 2: Run tests to verify**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (Edge Cases tests pass)

**Step 3: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test: add Edge Cases tests to consolidated file"
```

---

## Task 10: Remove Old Tag Test Files

**Files:**
- Delete: `packages/next/tests/tag-executors.test.ts`
- Delete: `packages/next/tests/tag-type-inference.test.ts`
- Delete: `packages/next/tests/tag-scope-resolution.test.ts`
- Delete: `packages/next/tests/tag-executor-types.test.ts`
- Delete: `packages/next/tests/tag-dependency-resolution.test.ts`
- Delete: `packages/next/tests/tag.test.ts.backup`

**Step 1: Remove old test files**

```bash
rm packages/next/tests/tag-executors.test.ts
rm packages/next/tests/tag-type-inference.test.ts
rm packages/next/tests/tag-scope-resolution.test.ts
rm packages/next/tests/tag-executor-types.test.ts
rm packages/next/tests/tag-dependency-resolution.test.ts
rm packages/next/tests/tag.test.ts.backup
```

**Step 2: Verify tests still pass**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: PASS (same test count as before, minus removed files)

**Step 3: Commit removal**

```bash
git add -A
git commit -m "test: remove old tag test files"
```

---

## Task 11: Clean Up coverage-gaps.test.ts

**Files:**
- Modify: `packages/next/tests/coverage-gaps.test.ts:34-377`

**Step 1: Remove tag tests from coverage-gaps**

Remove lines 34-377 in `packages/next/tests/coverage-gaps.test.ts` (both "tag.ts - uncovered lines" and "tag.ts - additional coverage" sections).

The file should go from:
- Line 33: `});`
- Line 34-377: DELETE entire tag sections
- Line 378: `  describe("promises.ts - uncovered lines", () => {`

**Step 2: Verify tests still pass**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: PASS (tag tests removed from coverage-gaps)

**Step 3: Commit cleanup**

```bash
git add packages/next/tests/coverage-gaps.test.ts
git commit -m "test: remove duplicate tag tests from coverage-gaps"
```

---

## Task 12: Final Verification

**Files:**
- Verify: All test files in `packages/next/tests/`
- Verify: Typecheck for src and tests

**Step 1: Run full test suite**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: PASS (all tests pass, similar test count to before)

**Step 2: Verify src typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 3: Verify test typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 4: Final commit if any fixes needed**

If any issues were fixed during verification:
```bash
git add -A
git commit -m "test: fix verification issues"
```

---

## Success Criteria

- [ ] Single `tag.test.ts` file with all tag tests
- [ ] 5 old test files removed
- [ ] Tag tests removed from `coverage-gaps.test.ts`
- [ ] All tests pass: `pnpm -F @pumped-fn/core-next test`
- [ ] Src typecheck passes: `pnpm -F @pumped-fn/core-next typecheck`
- [ ] Test typecheck passes: `pnpm -F @pumped-fn/core-next typecheck:full`
- [ ] Similar test count to before consolidation
- [ ] Source-first organization (Map, Array, Scope)
- [ ] test.each used for extraction methods across sources
