# Unify Accessor and Meta into Tag Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Replace `accessor()` and `meta()` with unified `tag()` API supporting both Map-like and Array-like storage with symbol keys, StandardSchema validation, optional defaults, and debug labels.

**Architecture:** Single `tag()` factory creates callable objects with dual interfaces (Map-like get/set, Array-like find/some). Context-aware operations detect source type (Store/Container/Array). Breaking change removes accessor/meta entirely.

**Tech Stack:** TypeScript, StandardSchema, Symbol-based keys, custom inspection

---

## Task 1: Create Core Tag Types

**Files:**
- Create: `packages/next/src/tag-types.ts`
- Modify: `packages/next/src/types.ts` (add exports)

**Step 1: Write failing test for basic tag type**

Create `packages/next/tests/tag.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";

describe("Tag System", () => {
  test("tag creates symbol-keyed accessor with schema", () => {
    const emailTag = tag(custom<string>());

    expect(emailTag.key).toBeInstanceOf(Symbol);
    expect(emailTag.schema).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: FAIL with "Cannot find module '../src/tag'"

**Step 3: Write tag type definitions**

Create `packages/next/src/tag-types.ts`:

```typescript
import type { StandardSchemaV1, metaSymbol } from "./types";

export const tagSymbol: unique symbol = Symbol.for("@pumped-fn/core/tag");

export declare namespace Tag {
  export interface Store {
    get(key: unknown): unknown;
    set(key: unknown, value: unknown): unknown | undefined;
  }

  export interface Tagged<T = unknown> {
    readonly [tagSymbol]: true;
    readonly key: symbol;
    readonly schema: StandardSchemaV1<T>;
    readonly value: T;
  }

  export interface Container {
    tags?: Tagged[];
  }

  export type Source = Store | Container | Tagged[];

  export interface Tag<T, HasDefault extends boolean = false> {
    readonly key: symbol;
    readonly schema: StandardSchemaV1<T>;
    readonly label?: string;
    readonly default: HasDefault extends true ? T : never;

    (value?: HasDefault extends true ? T : never): Tagged<T>;
    (value: T): Tagged<T>;

    get(source: Source): T;
    find(source: Source): HasDefault extends true ? T : T | undefined;
    some(source: Source): T[];

    set(target: Store, value: T): void;
    set(target: Container | Tagged[], value: T): Tagged<T>;

    entry(value?: HasDefault extends true ? T : never): [symbol, T];
    entry(value: T): [symbol, T];

    toString(): string;
    readonly [Symbol.toStringTag]: string;
  }
}
```

**Step 4: Export tag types from main types file**

Modify `packages/next/src/types.ts`, add at end:

```typescript
export { tagSymbol, type Tag } from "./tag-types";
```

**Step 5: Create stub tag implementation**

Create `packages/next/src/tag.ts`:

```typescript
import type { StandardSchemaV1 } from "./types";
import type { Tag } from "./tag-types";

export function tag<T>(schema: StandardSchemaV1<T>): Tag.Tag<T, false>;
export function tag<T>(
  schema: StandardSchemaV1<T>,
  options: { label?: string; default: T }
): Tag.Tag<T, true>;
export function tag<T>(
  schema: StandardSchemaV1<T>,
  options?: { label?: string }
): Tag.Tag<T, false>;
export function tag<T>(
  schema: StandardSchemaV1<T>,
  options?: { label?: string; default?: T }
): Tag.Tag<T, boolean> {
  throw new Error("Not implemented");
}
```

**Step 6: Run test to verify it still fails correctly**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: FAIL with "Not implemented"

**Step 7: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/next/src/tag-types.ts packages/next/src/tag.ts packages/next/src/types.ts packages/next/tests/tag.test.ts
git commit -m "feat(tag): add core tag type definitions"
```

---

## Task 2: Implement Tag Source Type Guards

**Files:**
- Modify: `packages/next/src/tag.ts`

**Step 1: Write test for source type detection**

Add to `packages/next/tests/tag.test.ts`:

```typescript
import { tagSymbol } from "../src/tag-types";

describe("Tag System", () => {
  // ... existing test

  test("detects Store source type", () => {
    const store = new Map<symbol, unknown>();
    const emailTag = tag(custom<string>());

    store.set(emailTag.key, "test@example.com");
    expect(emailTag.find(store)).toBe("test@example.com");
  });

  test("detects Tagged array source type", () => {
    const emailTag = tag(custom<string>());
    const tagged: Tag.Tagged<string>[] = [
      {
        [tagSymbol]: true,
        key: emailTag.key,
        schema: emailTag.schema,
        value: "test@example.com",
      },
    ];

    expect(emailTag.find(tagged)).toBe("test@example.com");
  });

  test("detects Container source type", () => {
    const emailTag = tag(custom<string>());
    const container: Tag.Container = {
      tags: [
        {
          [tagSymbol]: true,
          key: emailTag.key,
          schema: emailTag.schema,
          value: "test@example.com",
        },
      ],
    };

    expect(emailTag.find(container)).toBe("test@example.com");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: FAIL with "Not implemented"

**Step 3: Implement type guards and extraction helpers**

Modify `packages/next/src/tag.ts`, add before tag() function:

```typescript
import { validate } from "./ssch";
import { tagSymbol, type Tag } from "./tag-types";

function isStore(source: Tag.Source): source is Tag.Store {
  return (
    typeof source === "object" &&
    source !== null &&
    "get" in source &&
    "set" in source &&
    typeof source.get === "function" &&
    typeof source.set === "function"
  );
}

function isContainer(source: Tag.Source): source is Tag.Container {
  return (
    typeof source === "object" &&
    source !== null &&
    "tags" in source &&
    !Array.isArray(source)
  );
}

function extract<T>(
  source: Tag.Source,
  key: symbol,
  schema: StandardSchemaV1<T>
): T | undefined {
  if (isStore(source)) {
    const value = source.get(key);
    return value === undefined ? undefined : validate(schema, value);
  }

  const tags = Array.isArray(source) ? source : source.tags ?? [];
  const tagged = tags.find((t) => t.key === key);
  return tagged ? validate(schema, tagged.value) : undefined;
}

function collect<T>(
  source: Tag.Source,
  key: symbol,
  schema: StandardSchemaV1<T>
): T[] {
  if (isStore(source)) {
    const value = source.get(key);
    return value === undefined ? [] : [validate(schema, value)];
  }

  const tags = Array.isArray(source) ? source : source.tags ?? [];
  return tags.filter((t) => t.key === key).map((t) => validate(schema, t.value));
}

function write<T>(
  store: Tag.Store,
  key: symbol,
  schema: StandardSchemaV1<T>,
  value: T
): void {
  const validated = validate(schema, value);
  store.set(key, validated);
}
```

**Step 4: Run test to verify it still fails**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: FAIL (tag implementation still throws)

**Step 5: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/tag.ts packages/next/tests/tag.test.ts
git commit -m "feat(tag): add source type guards and extraction helpers"
```

---

## Task 3: Implement Tag Class Core

**Files:**
- Modify: `packages/next/src/tag.ts`

**Step 1: Write test for tag creation and retrieval**

Add to `packages/next/tests/tag.test.ts`:

```typescript
describe("Tag Creation and Retrieval", () => {
  test("tag without default requires value for get", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    expect(() => emailTag.get(store)).toThrow();
  });

  test("tag without default returns undefined for find", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    expect(emailTag.find(store)).toBeUndefined();
  });

  test("tag with default never throws on get", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const store = new Map<symbol, unknown>();

    expect(portTag.get(store)).toBe(3000);
  });

  test("tag with default returns default for find", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const store = new Map<symbol, unknown>();

    expect(portTag.find(store)).toBe(3000);
  });

  test("tag retrieves stored value", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    store.set(emailTag.key, "test@example.com");
    expect(emailTag.get(store)).toBe("test@example.com");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: FAIL with "Not implemented"

**Step 3: Implement TagImpl class**

Modify `packages/next/src/tag.ts`, add before tag() function:

```typescript
class TagImpl<T, HasDefault extends boolean = false>
  implements Tag.Tag<T, HasDefault>
{
  public readonly key: symbol;
  public readonly schema: StandardSchemaV1<T>;
  public readonly label?: string;
  public readonly default: HasDefault extends true ? T : never;

  constructor(
    schema: StandardSchemaV1<T>,
    options?: { label?: string; default?: T }
  ) {
    this.label = options?.label;
    this.key = options?.label ? Symbol.for(options.label) : Symbol();
    this.schema = schema;
    this.default = (options?.default ?? (undefined as never)) as HasDefault extends true
      ? T
      : never;
  }

  get(source: Tag.Source): T {
    const value = extract(source, this.key, this.schema);
    if (value === undefined) {
      if (this.default !== undefined) {
        return this.default as T;
      }
      throw new Error(`Value not found for key: ${this.key.toString()}`);
    }
    return value;
  }

  find(source: Tag.Source): T | undefined {
    const value = extract(source, this.key, this.schema);
    return value !== undefined ? value : (this.default as T | undefined);
  }

  some(source: Tag.Source): T[] {
    return collect(source, this.key, this.schema);
  }

  set(target: Tag.Store, value: T): void;
  set(target: Tag.Container | Tag.Tagged[], value: T): Tag.Tagged<T>;
  set(target: Tag.Source, value: T): void | Tag.Tagged<T> {
    if (isStore(target)) {
      write(target, this.key, this.schema, value);
      return;
    }

    const validated = validate(this.schema, value);
    return {
      [tagSymbol]: true,
      key: this.key,
      schema: this.schema,
      value: validated,
    };
  }

  entry(value?: T): [symbol, T] {
    const val = value !== undefined ? value : this.default;
    if (val === undefined) {
      throw new Error("Value required for entry without default");
    }
    const validated = validate(this.schema, val);
    return [this.key, validated];
  }

  toString(): string {
    return this.label ? `Tag(${this.label})` : `Tag(${this.key.toString()})`;
  }

  get [Symbol.toStringTag](): string {
    return this.label ? `Tag<${this.label}>` : "Tag<anonymous>";
  }
}
```

**Step 4: Implement tag() factory to return callable**

Modify `packages/next/src/tag.ts`, replace tag() implementation:

```typescript
export function tag<T>(schema: StandardSchemaV1<T>): Tag.Tag<T, false>;
export function tag<T>(
  schema: StandardSchemaV1<T>,
  options: { label?: string; default: T }
): Tag.Tag<T, true>;
export function tag<T>(
  schema: StandardSchemaV1<T>,
  options?: { label?: string }
): Tag.Tag<T, false>;
export function tag<T>(
  schema: StandardSchemaV1<T>,
  options?: { label?: string; default?: T }
): Tag.Tag<T, boolean> {
  const impl = new TagImpl<T, boolean>(schema, options);

  const fn = ((value?: T) => {
    const val = value !== undefined ? value : impl.default;
    if (val === undefined) {
      throw new Error("Value required for tag without default");
    }
    const validated = validate(schema, val);
    return {
      [tagSymbol]: true,
      key: impl.key,
      schema: impl.schema,
      value: validated,
    };
  }) as Tag.Tag<T, boolean>;

  Object.defineProperty(fn, "key", {
    value: impl.key,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(fn, "schema", {
    value: impl.schema,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(fn, "label", {
    value: impl.label,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(fn, "default", {
    value: impl.default,
    writable: false,
    configurable: false,
  });

  fn.get = impl.get.bind(impl);
  fn.find = impl.find.bind(impl);
  fn.some = impl.some.bind(impl);
  fn.set = impl.set.bind(impl) as typeof impl.set;
  fn.entry = impl.entry.bind(impl);
  fn.toString = impl.toString.bind(impl);
  Object.defineProperty(fn, Symbol.toStringTag, {
    get: () => impl[Symbol.toStringTag],
  });

  return fn;
}
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS

**Step 6: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/next/src/tag.ts packages/next/tests/tag.test.ts
git commit -m "feat(tag): implement tag class with get/find/some/set/entry"
```

---

## Task 4: Implement Callable Tag Creation

**Files:**
- Modify: `packages/next/src/tag.ts`
- Modify: `packages/next/tests/tag.test.ts`

**Step 1: Write test for callable tag**

Add to `packages/next/tests/tag.test.ts`:

```typescript
describe("Tag Callable Creation", () => {
  test("tag creates Tagged value", () => {
    const emailTag = tag(custom<string>());
    const tagged = emailTag("test@example.com");

    expect(tagged.key).toBe(emailTag.key);
    expect(tagged.value).toBe("test@example.com");
    expect(tagged[tagSymbol]).toBe(true);
  });

  test("tag with default can be called without value", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const tagged = portTag();

    expect(tagged.value).toBe(3000);
  });

  test("tag with default can override default", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const tagged = portTag(8080);

    expect(tagged.value).toBe(8080);
  });

  test("tag without default throws when called without value", () => {
    const emailTag = tag(custom<string>()) as Tag.Tag<string, true>;

    expect(() => emailTag()).toThrow("Value required");
  });
});
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (already implemented in Task 3)

**Step 3: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test(tag): add callable tag creation tests"
```

---

## Task 5: Implement Tag Entry Method

**Files:**
- Modify: `packages/next/tests/tag.test.ts`

**Step 1: Write test for entry method**

Add to `packages/next/tests/tag.test.ts`:

```typescript
describe("Tag Entry Method", () => {
  test("entry creates symbol-value tuple", () => {
    const emailTag = tag(custom<string>());
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

  test("entry with default can override default", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const [, value] = portTag.entry(8080);

    expect(value).toBe(8080);
  });

  test("entry without default throws when called without value", () => {
    const emailTag = tag(custom<string>()) as Tag.Tag<string, true>;

    expect(() => emailTag.entry()).toThrow();
  });

  test("entry can initialize Map", () => {
    const portTag = tag(custom<number>(), { default: 3000 });
    const store = new Map([portTag.entry()]);

    expect(portTag.get(store)).toBe(3000);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (already implemented in Task 3)

**Step 3: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test(tag): add entry method tests"
```

---

## Task 6: Implement Tag Set Context-Aware Behavior

**Files:**
- Modify: `packages/next/tests/tag.test.ts`

**Step 1: Write test for set with Store**

Add to `packages/next/tests/tag.test.ts`:

```typescript
describe("Tag Set Method", () => {
  test("set mutates Store", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    emailTag.set(store, "test@example.com");
    expect(emailTag.get(store)).toBe("test@example.com");
  });

  test("set with Container returns Tagged", () => {
    const emailTag = tag(custom<string>());
    const container: Tag.Container = { tags: [] };

    const tagged = emailTag.set(container, "test@example.com");
    expect(tagged.value).toBe("test@example.com");
    expect(tagged.key).toBe(emailTag.key);
  });

  test("set with Tagged array returns Tagged", () => {
    const emailTag = tag(custom<string>());
    const tags: Tag.Tagged[] = [];

    const tagged = emailTag.set(tags, "test@example.com");
    expect(tagged.value).toBe("test@example.com");
  });

  test("set validates value via schema", () => {
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

    expect(() => numberTag.set(store, "invalid" as unknown as number)).toThrow();
  });
});
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (already implemented in Task 3)

**Step 3: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test(tag): add set method context-aware tests"
```

---

## Task 7: Implement Tag Some Method (Multi-Value Retrieval)

**Files:**
- Modify: `packages/next/tests/tag.test.ts`

**Step 1: Write test for some with multiple values**

Add to `packages/next/tests/tag.test.ts`:

```typescript
describe("Tag Some Method", () => {
  test("some returns all matching values from array", () => {
    const emailTag = tag(custom<string>());
    const tags: Tag.Tagged<string>[] = [
      emailTag("test1@example.com"),
      emailTag("test2@example.com"),
      emailTag("test3@example.com"),
    ];

    expect(emailTag.some(tags)).toEqual([
      "test1@example.com",
      "test2@example.com",
      "test3@example.com",
    ]);
  });

  test("some returns single value from Store", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();
    store.set(emailTag.key, "test@example.com");

    expect(emailTag.some(store)).toEqual(["test@example.com"]);
  });

  test("some returns empty array when no match", () => {
    const emailTag = tag(custom<string>());
    const store = new Map<symbol, unknown>();

    expect(emailTag.some(store)).toEqual([]);
  });

  test("some filters by key in mixed array", () => {
    const emailTag = tag(custom<string>());
    const nameTag = tag(custom<string>(), { label: "name" });

    const tags: Tag.Tagged[] = [
      emailTag("test@example.com"),
      nameTag("John"),
      emailTag("another@example.com"),
    ];

    expect(emailTag.some(tags)).toEqual([
      "test@example.com",
      "another@example.com",
    ]);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS (already implemented in Task 3)

**Step 3: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/next/tests/tag.test.ts
git commit -m "test(tag): add some method multi-value tests"
```

---

## Task 8: Implement Tag Debug Display

**Files:**
- Modify: `packages/next/src/tag.ts`
- Modify: `packages/next/tests/tag.test.ts`

**Step 1: Write test for debug display**

Add to `packages/next/tests/tag.test.ts`:

```typescript
import { inspect } from "util";

describe("Tag Debug Display", () => {
  test("toString shows label for named tag", () => {
    const portTag = tag(custom<number>(), { label: "port" });

    expect(portTag.toString()).toBe("Tag(port)");
  });

  test("toString shows anonymous for nameless tag", () => {
    const anonTag = tag(custom<string>());

    expect(anonTag.toString()).toContain("Tag(");
  });

  test("Symbol.toStringTag shows label", () => {
    const portTag = tag(custom<number>(), { label: "port" });

    expect(portTag[Symbol.toStringTag]).toBe("Tag<port>");
  });

  test("Tagged value toString shows key-value", () => {
    const portTag = tag(custom<number>(), { label: "port" });
    const tagged = portTag(8080);

    expect(tagged.toString()).toBe("port=8080");
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

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: FAIL (Tagged value doesn't have toString/inspect)

**Step 3: Add Tagged value inspection methods**

Modify `packages/next/src/tag.ts`, update the Tagged creation in both `TagImpl.set()` and `tag()` callable to use a helper:

```typescript
function createTagged<T>(
  key: symbol,
  schema: StandardSchemaV1<T>,
  value: T,
  label?: string
): Tag.Tagged<T> {
  const tagged: Tag.Tagged<T> = {
    [tagSymbol]: true,
    key,
    schema,
    value,
    toString() {
      const keyStr = label || key.toString();
      return `${keyStr}=${JSON.stringify(value)}`;
    },
    get [Symbol.toStringTag]() {
      return "Tagged";
    },
  };

  Object.defineProperty(tagged, Symbol.for("nodejs.util.inspect.custom"), {
    value: function (depth: number, opts: { stylize?: (str: string, style: string) => string }) {
      const keyStr = label || "anonymous";
      const valueStr = opts.stylize
        ? opts.stylize(JSON.stringify(value), "string")
        : JSON.stringify(value);
      return `Tagged { ${keyStr}: ${valueStr} }`;
    },
  });

  return tagged;
}
```

**Step 4: Update TagImpl.set and tag() callable to use createTagged**

Modify `packages/next/src/tag.ts`, in `TagImpl.set()`:

```typescript
set(target: Tag.Store, value: T): void;
set(target: Tag.Container | Tag.Tagged[], value: T): Tag.Tagged<T>;
set(target: Tag.Source, value: T): void | Tag.Tagged<T> {
  if (isStore(target)) {
    write(target, this.key, this.schema, value);
    return;
  }

  const validated = validate(this.schema, value);
  return createTagged(this.key, this.schema, validated, this.label);
}
```

Modify `packages/next/src/tag.ts`, in `tag()` callable:

```typescript
const fn = ((value?: T) => {
  const val = value !== undefined ? value : impl.default;
  if (val === undefined) {
    throw new Error("Value required for tag without default");
  }
  const validated = validate(schema, val);
  return createTagged(impl.key, impl.schema, validated, impl.label);
}) as Tag.Tag<T, boolean>;
```

**Step 5: Add nodejs.util.inspect.custom to TagImpl**

Modify `packages/next/src/tag.ts`, add to `TagImpl` class:

```typescript
[Symbol.for("nodejs.util.inspect.custom")](): string {
  return this.label ? `Tag { ${this.label} }` : "Tag { anonymous }";
}
```

**Step 6: Update tag() factory to bind inspect method**

Modify `packages/next/src/tag.ts`, in `tag()` function after other bindings:

```typescript
Object.defineProperty(fn, Symbol.for("nodejs.util.inspect.custom"), {
  value: impl[Symbol.for("nodejs.util.inspect.custom")].bind(impl),
});
```

**Step 7: Update Tagged type definition**

Modify `packages/next/src/tag-types.ts`, update `Tagged` interface:

```typescript
export interface Tagged<T = unknown> {
  readonly [tagSymbol]: true;
  readonly key: symbol;
  readonly schema: StandardSchemaV1<T>;
  readonly value: T;
  toString(): string;
  readonly [Symbol.toStringTag]: string;
}
```

**Step 8: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag.test.ts`
Expected: PASS

**Step 9: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 10: Commit**

```bash
git add packages/next/src/tag.ts packages/next/src/tag-types.ts packages/next/tests/tag.test.ts
git commit -m "feat(tag): add debug display with toString and inspect"
```

---

## Task 9: Add Tag to Public API

**Files:**
- Modify: `packages/next/src/index.ts`

**Step 1: Export tag from index**

Modify `packages/next/src/index.ts`:

```typescript
export { tag } from "./tag";
export type { Tag } from "./tag-types";
```

**Step 2: Verify public API**

Create `packages/next/tests/tag-public-api.test.ts`:

```typescript
import { describe, test, expect } from "vitest";
import { tag, type Tag, custom } from "../src";

describe("Tag Public API", () => {
  test("tag is exported from main entry", () => {
    const emailTag = tag(custom<string>());
    expect(emailTag).toBeDefined();
  });

  test("Tag types are exported", () => {
    const portTag: Tag.Tag<number, true> = tag(custom<number>(), {
      default: 3000,
    });
    expect(portTag.default).toBe(3000);
  });
});
```

**Step 3: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test tag-public-api.test.ts`
Expected: PASS

**Step 4: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/next/src/index.ts packages/next/tests/tag-public-api.test.ts
git commit -m "feat(tag): export tag from public API"
```

---

## Task 10: Migrate Meta Tests to Tag

**Files:**
- Modify: `packages/next/tests/meta.test.ts`

**Step 1: Add tag equivalence tests to meta.test.ts**

Add to `packages/next/tests/meta.test.ts`:

```typescript
import { tag } from "../src/tag";

describe("Tag Migration Compatibility", () => {
  test("tag replaces meta for basic operations", () => {
    const nameTag = tag(custom<string>());
    const nameMeta = meta("name", custom<string>());

    const executor = provide(() => {}, nameTag("test"));

    expect(nameTag.find(executor.metas)).toBe("test");
    expect(nameMeta.find(executor)).toBe("test");
  });

  test("tag some() replaces meta some()", () => {
    const nameTag = tag(custom<string>(), { label: "name" });
    const nameMeta = meta("name", custom<string>());

    const tags = [nameTag("John"), nameTag("Jane")];

    expect(nameTag.some(tags)).toEqual(["John", "Jane"]);
  });

  test("tag callable replaces meta callable", () => {
    const nameTag = tag(custom<string>());
    const nameMeta = meta("name", custom<string>());

    const taggedValue = nameTag("test");
    const metaValue = nameMeta("test");

    expect(taggedValue.value).toBe("test");
    expect(metaValue.value).toBe("test");
  });
});
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test meta.test.ts`
Expected: PASS

**Step 3: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/next/tests/meta.test.ts
git commit -m "test(tag): add meta migration compatibility tests"
```

---

## Task 11: Remove Accessor and Meta

**Files:**
- Delete: `packages/next/src/accessor.ts`
- Delete: `packages/next/src/meta.ts`
- Modify: `packages/next/src/index.ts`
- Modify: `packages/next/src/types.ts`

**Step 1: Update index.ts to remove accessor and meta exports**

Modify `packages/next/src/index.ts`, remove lines:

```typescript
export { meta, getValue, findValue, findValues } from "./meta";
export { accessor } from "./accessor";
export type { Accessor } from "./types";
```

**Step 2: Run typecheck to find all usages**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: FAIL with errors showing all accessor/meta usages

**Step 3: Update internal usages to tag**

This step requires reading the typecheck output and updating each file. Common patterns:

```typescript
// Before
const myMeta = meta("key", schema);
executor.metas?.find(m => m.key === myMeta.key)

// After
const myTag = tag(schema, { label: "key" });
myTag.find(executor.metas)
```

```typescript
// Before
const myAccessor = accessor("key", schema);
myAccessor.get(dataStore)

// After
const myTag = tag(schema, { label: "key" });
myTag.get(dataStore)
```

Run: `ast-grep --pattern 'accessor($$$)' -l ts packages/next/src`
Run: `ast-grep --pattern 'meta($$$)' -l ts packages/next/src`

Update each file found. Document specific migrations needed based on output.

**Step 4: Remove Accessor namespace from types.ts**

Modify `packages/next/src/types.ts`, remove:

```typescript
export declare namespace Accessor {
  export interface DataStore {
    get(key: unknown): unknown;
    set(key: unknown, value: unknown): unknown | undefined;
  }

  export type AccessorSource = DataStore | Meta.MetaContainer | Meta.Meta[];

  interface BaseAccessor<T> {
    readonly key: symbol;
    readonly schema: StandardSchemaV1<T>;
  }

  export interface Accessor<T> extends BaseAccessor<T> {
    get(source: AccessorSource): T;
    find(source: AccessorSource): T | undefined;
    set(source: DataStore, value: T): void;
    preset(value: T): [symbol, T];
  }

  export interface AccessorWithDefault<T> extends BaseAccessor<T> {
    readonly defaultValue: T;
    get(source: AccessorSource): T;
    find(source: AccessorSource): T;
    set(source: DataStore, value: T): void;
    preset(value: T): [symbol, T];
  }
}
```

**Step 5: Update Meta namespace to reference Tagged**

Modify `packages/next/src/types.ts`, update Meta namespace:

```typescript
export declare namespace Meta {
  export interface MetaContainer {
    metas: import("./tag-types").Tag.Tagged[] | undefined;
  }

  export interface Meta<V = unknown> extends import("./tag-types").Tag.Tagged<V> {}

  export interface MetaFn<V> extends import("./tag-types").Tag.Tag<V> {}

  export interface DefaultMetaFn<V> extends import("./tag-types").Tag.Tag<V, true> {}
}
```

**Step 6: Delete accessor.ts and meta.ts**

Run: `rm packages/next/src/accessor.ts packages/next/src/meta.ts`

**Step 7: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: PASS (after fixing all migrations)

**Step 8: Typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS

**Step 9: Commit**

```bash
git add -A packages/next/src packages/next/tests
git commit -m "feat(tag): remove accessor and meta, complete migration to tag"
```

---

## Task 12: Update Documentation

**Files:**
- Modify: `packages/next/README.md` (if exists)
- Create: `docs/migration-guides/accessor-meta-to-tag.md`

**Step 1: Create migration guide**

Create `docs/migration-guides/accessor-meta-to-tag.md`:

```markdown
# Migration Guide: Accessor and Meta to Tag

## Overview

`accessor()` and `meta()` have been unified into a single `tag()` API.

## Quick Reference

| Before | After |
|--------|-------|
| `accessor('key', schema)` | `tag(schema, { label: 'key' })` |
| `accessor('key', schema, default)` | `tag(schema, { label: 'key', default })` |
| `meta('key', schema)` | `tag(schema, { label: 'key' })` |
| `accessor.get(source)` | `tag.get(source)` |
| `accessor.find(source)` | `tag.find(source)` |
| `accessor.set(store, value)` | `tag.set(store, value)` |
| `accessor.preset(value)` | `tag.entry(value)` |
| `meta(value)` | `tag(value)` |
| `meta.some(source)` | `tag.some(source)` |
| `meta.find(source)` | `tag.find(source)` |
| `meta.get(source)` | `tag.get(source)` |

## Migration Examples

### Accessor to Tag

```typescript
// Before
const port = accessor('port', numberSchema, 3000);
const store = new Map();
port.set(store, 8080);
console.log(port.get(store)); // 8080

// After
const port = tag(numberSchema, { label: 'port', default: 3000 });
const store = new Map();
port.set(store, 8080);
console.log(port.get(store)); // 8080
```

### Meta to Tag

```typescript
// Before
const name = meta('name', stringSchema);
const tagged = name('John');
const executor = provide(() => {}, tagged);
console.log(name.find(executor)); // 'John'

// After
const name = tag(stringSchema, { label: 'name' });
const tagged = name('John');
const executor = provide(() => {}, tagged);
console.log(name.find(executor.metas)); // 'John'
```

### Nameless Tags

```typescript
// New capability: anonymous symbol-based tags
const email = tag(emailSchema); // No label needed
const tagged = email('test@example.com');
```

## Breaking Changes

1. `accessor()` and `meta()` no longer exist
2. `preset()` renamed to `entry()`
3. Meta namespace types now alias Tag types
4. Source types unified under `Tag.Source`
```

**Step 2: Run build to ensure no issues**

Run: `pnpm -F @pumped-fn/core-next build`
Expected: PASS

**Step 3: Commit**

```bash
git add docs/migration-guides/accessor-meta-to-tag.md
git commit -m "docs: add accessor/meta to tag migration guide"
```

---

## Completion Checklist

- [ ] All tests pass: `pnpm -F @pumped-fn/core-next test`
- [ ] Typecheck passes: `pnpm -F @pumped-fn/core-next typecheck:full`
- [ ] Build succeeds: `pnpm -F @pumped-fn/core-next build`
- [ ] Migration guide created
- [ ] Public API exports tag
- [ ] accessor.ts and meta.ts deleted
- [ ] All internal usages migrated to tag

**Next Steps After Implementation:**
1. Update CHANGELOG.md with breaking changes
2. Bump major version
3. Test against dependent packages (devtools, etc.)
