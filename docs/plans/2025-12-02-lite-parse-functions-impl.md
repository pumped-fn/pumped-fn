# Parser Functions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `parse` functions to Tag and Flow in `@pumped-fn/lite` for type-safe input validation.

**Architecture:** Parser functions validate input at creation (Tag) or before factory execution (Flow). Types are inferred from parser return types. Errors wrapped in `ParseError` with context.

**Tech Stack:** TypeScript, Vitest

---

## Task 1: Create ParseError Class

**Files:**
- Create: `packages/lite/src/errors.ts`
- Test: `packages/lite/tests/errors.test.ts`

**Step 1: Write the failing test**

Create `packages/lite/tests/errors.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { ParseError } from "../src/errors"

describe("ParseError", () => {
  it("creates error with tag phase", () => {
    const cause = new Error("Invalid UUID")
    const error = new ParseError(
      'Failed to parse tag "userId"',
      "tag",
      "userId",
      cause
    )

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ParseError)
    expect(error.name).toBe("ParseError")
    expect(error.message).toBe('Failed to parse tag "userId"')
    expect(error.phase).toBe("tag")
    expect(error.label).toBe("userId")
    expect(error.cause).toBe(cause)
  })

  it("creates error with flow-input phase", () => {
    const cause = new Error("Expected string")
    const error = new ParseError(
      'Failed to parse flow input "createUser"',
      "flow-input",
      "createUser",
      cause
    )

    expect(error.phase).toBe("flow-input")
    expect(error.label).toBe("createUser")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test -- tests/errors.test.ts`
Expected: FAIL with "Cannot find module '../src/errors'"

**Step 3: Write minimal implementation**

Create `packages/lite/src/errors.ts`:

```typescript
export class ParseError extends Error {
  readonly name = "ParseError"

  constructor(
    message: string,
    readonly phase: "tag" | "flow-input",
    readonly label: string,
    readonly cause: unknown
  ) {
    super(message)
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test -- tests/errors.test.ts`
Expected: PASS

**Step 5: Export ParseError from index**

Modify `packages/lite/src/index.ts` - add line:

```typescript
export { ParseError } from "./errors"
```

**Step 6: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: No errors

**Step 7: Commit**

```bash
git add packages/lite/src/errors.ts packages/lite/tests/errors.test.ts packages/lite/src/index.ts
git commit -m "feat(lite): add ParseError class for parse validation errors"
```

---

## Task 2: Add Parse to Tag Types

**Files:**
- Modify: `packages/lite/src/types.ts`

**Step 1: Update Tag interface**

In `packages/lite/src/types.ts`, modify the `Tag` interface (around line 114):

```typescript
  export interface Tag<T, HasDefault extends boolean = false> {
    readonly [tagSymbol]: true
    readonly key: symbol
    readonly label: string
    readonly defaultValue: HasDefault extends true ? T : undefined
    readonly hasDefault: HasDefault
    readonly parse?: (raw: unknown) => T
    (value: T): Tagged<T>
    get(source: TagSource): HasDefault extends true ? T : T
    find(source: TagSource): HasDefault extends true ? T : T | undefined
    collect(source: TagSource): T[]
  }
```

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/lite/src/types.ts
git commit -m "feat(lite): add parse property to Tag interface"
```

---

## Task 3: Implement Tag Parse

**Files:**
- Modify: `packages/lite/src/tag.ts`
- Test: `packages/lite/tests/tag.test.ts`

**Step 1: Write the failing test for tag with parse**

Add to `packages/lite/tests/tag.test.ts` inside `describe("tag()")`:

```typescript
    it("creates a tag with parse function", () => {
      const numberTag = tag({
        label: "count",
        parse: (raw) => {
          const n = Number(raw)
          if (isNaN(n)) throw new Error("Must be a number")
          return n
        },
      })

      expect(isTag(numberTag)).toBe(true)
      expect(numberTag.parse).toBeDefined()
    })

    it("validates value through parse on creation", () => {
      const numberTag = tag({
        label: "count",
        parse: (raw) => {
          const n = Number(raw)
          if (isNaN(n)) throw new Error("Must be a number")
          return n
        },
      })

      const tagged = numberTag(42)
      expect(tagged.value).toBe(42)
    })

    it("throws ParseError when parse fails", () => {
      const numberTag = tag({
        label: "count",
        parse: (raw) => {
          const n = Number(raw)
          if (isNaN(n)) throw new Error("Must be a number")
          return n
        },
      })

      expect(() => numberTag("not-a-number")).toThrow()
    })
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test -- tests/tag.test.ts`
Expected: FAIL - parse not recognized in tag options

**Step 3: Update TagOptions interface**

In `packages/lite/src/tag.ts`, update `TagOptions` (around line 4):

```typescript
export interface TagOptions<T, HasDefault extends boolean> {
  label: string
  default?: HasDefault extends true ? T : never
  parse?: (raw: unknown) => T
}
```

**Step 4: Add parse to tag overloads**

In `packages/lite/src/tag.ts`, add new overloads after existing ones (around line 24):

```typescript
export function tag<T>(options: { label: string }): Lite.Tag<T, false>
export function tag<T>(options: {
  label: string
  default: T
}): Lite.Tag<T, true>
export function tag<T>(options: {
  label: string
  parse: (raw: unknown) => T
}): Lite.Tag<T, false>
export function tag<T>(options: {
  label: string
  parse: (raw: unknown) => T
  default: T
}): Lite.Tag<T, true>
export function tag<T>(options: TagOptions<T, boolean>): Lite.Tag<T, boolean> {
```

**Step 5: Update tag implementation**

In `packages/lite/src/tag.ts`, update the implementation to use parse:

First, add import at top:

```typescript
import { ParseError } from "./errors"
```

Then update the `tag` function body (around line 29):

```typescript
export function tag<T>(options: TagOptions<T, boolean>): Lite.Tag<T, boolean> {
  const key = Symbol.for(`@pumped-fn/lite/tag/${options.label}`)
  const hasDefault = "default" in options
  const defaultValue = hasDefault ? options.default : undefined
  const parse = options.parse

  function createTagged(value: T): Lite.Tagged<T> {
    let validatedValue = value
    if (parse) {
      try {
        validatedValue = parse(value)
      } catch (err) {
        throw new ParseError(
          `Failed to parse tag "${options.label}"`,
          "tag",
          options.label,
          err
        )
      }
    }
    return {
      [taggedSymbol]: true,
      key,
      value: validatedValue,
    }
  }

  // ... rest unchanged (get, find, collect functions)

  return Object.assign(createTagged, {
    [tagSymbol]: true as const,
    key,
    label: options.label,
    hasDefault,
    defaultValue,
    parse,
    get,
    find,
    collect,
  }) as unknown as Lite.Tag<T, boolean>
}
```

**Step 6: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test -- tests/tag.test.ts`
Expected: PASS

**Step 7: Add test for ParseError properties**

Add to `packages/lite/tests/tag.test.ts`:

```typescript
    it("ParseError has correct properties when parse fails", () => {
      const { ParseError } = await import("../src/errors")
      const numberTag = tag({
        label: "count",
        parse: (raw) => {
          const n = Number(raw)
          if (isNaN(n)) throw new Error("Must be a number")
          return n
        },
      })

      try {
        numberTag("not-a-number")
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError)
        const parseErr = err as InstanceType<typeof ParseError>
        expect(parseErr.phase).toBe("tag")
        expect(parseErr.label).toBe("count")
        expect(parseErr.cause).toBeInstanceOf(Error)
      }
    })
```

Note: Update the import at top of test file:

```typescript
import { tag, tags, isTag, isTagged } from "../src/tag"
import { ParseError } from "../src/errors"
```

Then simplify the test:

```typescript
    it("ParseError has correct properties when parse fails", () => {
      const numberTag = tag({
        label: "count",
        parse: (raw) => {
          const n = Number(raw)
          if (isNaN(n)) throw new Error("Must be a number")
          return n
        },
      })

      try {
        numberTag("not-a-number")
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError)
        const parseErr = err as ParseError
        expect(parseErr.phase).toBe("tag")
        expect(parseErr.label).toBe("count")
        expect(parseErr.cause).toBeInstanceOf(Error)
      }
    })
```

**Step 8: Run all tag tests**

Run: `pnpm -F @pumped-fn/lite test -- tests/tag.test.ts`
Expected: PASS

**Step 9: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: No errors

**Step 10: Commit**

```bash
git add packages/lite/src/tag.ts packages/lite/tests/tag.test.ts
git commit -m "feat(lite): implement parse function for tags"
```

---

## Task 4: Add Test for Tag Default Bypasses Parse

**Files:**
- Test: `packages/lite/tests/tag.test.ts`

**Step 1: Write test for default bypassing parse**

Add to `packages/lite/tests/tag.test.ts` inside `describe("tag()")`:

```typescript
    it("default value bypasses parse validation", () => {
      let parseCalled = false
      const numberTag = tag({
        label: "count",
        parse: (raw) => {
          parseCalled = true
          const n = Number(raw)
          if (isNaN(n)) throw new Error("Must be a number")
          return n
        },
        default: 0,
      })

      expect(numberTag.defaultValue).toBe(0)
      expect(parseCalled).toBe(false)
    })
```

**Step 2: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test -- tests/tag.test.ts`
Expected: PASS (default is set directly, not through createTagged)

**Step 3: Commit**

```bash
git add packages/lite/tests/tag.test.ts
git commit -m "test(lite): verify tag default bypasses parse"
```

---

## Task 5: Add Flow Types for Parse and Name

**Files:**
- Modify: `packages/lite/src/types.ts`

**Step 1: Update Flow interface**

In `packages/lite/src/types.ts`, modify the `Flow` interface (around line 50):

```typescript
  export interface Flow<TOutput, TInput = unknown> {
    readonly [flowSymbol]: true
    readonly name?: string
    readonly parse?: (raw: unknown) => MaybePromise<TInput>
    readonly factory: FlowFactory<TOutput, TInput, Record<string, Dependency>>
    readonly deps?: Record<string, Dependency>
    readonly tags?: Tagged<unknown>[]
  }
```

**Step 2: Update ExecutionContext interface**

In `packages/lite/src/types.ts`, make ExecutionContext generic (around line 72):

```typescript
  export interface ExecutionContext<TInput = unknown> {
    readonly input: TInput
    readonly scope: Scope
    exec<T>(options: ExecFlowOptions<T>): Promise<T>
    exec<T, Args extends unknown[]>(options: ExecFnOptions<T, Args>): Promise<T>
    onClose(fn: () => MaybePromise<void>): void
    close(): Promise<void>
  }
```

**Step 3: Update ExecFlowOptions**

In `packages/lite/src/types.ts`, add name to ExecFlowOptions (around line 81):

```typescript
  export interface ExecFlowOptions<T> {
    flow: Flow<T, unknown>
    input: unknown
    name?: string
    tags?: Tagged<unknown>[]
  }
```

**Step 4: Update FlowFactory type**

In `packages/lite/src/types.ts`, update FlowFactory (around line 187):

```typescript
  export type FlowFactory<
    TOutput,
    TInput,
    D extends Record<string, Dependency>,
  > = keyof D extends never
    ? (ctx: ExecutionContext<TInput>) => MaybePromise<TOutput>
    : (ctx: ExecutionContext<TInput>, deps: InferDeps<D>) => MaybePromise<TOutput>
```

**Step 5: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/lite/src/types.ts
git commit -m "feat(lite): add parse and name to Flow types, make ExecutionContext generic"
```

---

## Task 6: Update Flow Function with Parse and Name

**Files:**
- Modify: `packages/lite/src/flow.ts`
- Test: `packages/lite/tests/flow.test.ts`

**Step 1: Write failing test for flow with name**

Add to `packages/lite/tests/flow.test.ts` inside `describe("flow()")`:

```typescript
    it("creates a flow with name", () => {
      const myFlow = flow({
        name: "myFlow",
        factory: (ctx) => ctx.input,
      })

      expect(myFlow.name).toBe("myFlow")
    })
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test -- tests/flow.test.ts`
Expected: FAIL - name not on flow

**Step 3: Update FlowConfig interface**

In `packages/lite/src/flow.ts`, update FlowConfig (around line 4):

```typescript
export interface FlowConfig<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
> {
  name?: string
  parse?: (raw: unknown) => MaybePromise<TInput>
  deps?: D
  factory: Lite.FlowFactory<TOutput, TInput, D>
  tags?: Lite.Tagged<unknown>[]
}
```

**Step 4: Update flow overloads**

Replace the overloads in `packages/lite/src/flow.ts` (around line 30-45):

```typescript
export function flow<TOutput>(config: {
  name?: string
  deps?: undefined
  factory: (ctx: Lite.ExecutionContext) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, unknown>

export function flow<TOutput, TInput>(config: {
  name?: string
  parse: (raw: unknown) => MaybePromise<TInput>
  deps?: undefined
  factory: (ctx: Lite.ExecutionContext<TInput>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<
  TOutput,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | { mode: string }>,
>(config: {
  name?: string
  deps: D
  factory: (ctx: Lite.ExecutionContext, deps: Lite.InferDeps<D>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, unknown>

export function flow<
  TOutput,
  TInput,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | { mode: string }>,
>(config: {
  name?: string
  parse: (raw: unknown) => MaybePromise<TInput>
  deps: D
  factory: (ctx: Lite.ExecutionContext<TInput>, deps: Lite.InferDeps<D>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
>(config: FlowConfig<TOutput, TInput, D>): Lite.Flow<TOutput, TInput> {
  return {
    [flowSymbol]: true,
    name: config.name,
    parse: config.parse,
    factory: config.factory as unknown as Lite.FlowFactory<
      TOutput,
      TInput,
      Record<string, Lite.Dependency>
    >,
    deps: config.deps as unknown as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
  }
}
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test -- tests/flow.test.ts`
Expected: PASS

**Step 6: Write test for flow with parse**

Add to `packages/lite/tests/flow.test.ts`:

```typescript
    it("creates a flow with parse function", () => {
      const myFlow = flow({
        parse: (raw) => {
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw
        },
        factory: (ctx) => ctx.input.toUpperCase(),
      })

      expect(myFlow.parse).toBeDefined()
    })
```

**Step 7: Run test**

Run: `pnpm -F @pumped-fn/lite test -- tests/flow.test.ts`
Expected: PASS

**Step 8: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: No errors

**Step 9: Commit**

```bash
git add packages/lite/src/flow.ts packages/lite/tests/flow.test.ts
git commit -m "feat(lite): add name and parse properties to flow"
```

---

## Task 7: Implement Flow Parse in Scope

**Files:**
- Modify: `packages/lite/src/scope.ts`
- Test: `packages/lite/tests/scope.test.ts`

**Step 1: Write failing test for flow parse execution**

Add to `packages/lite/tests/scope.test.ts`. First check what's there:

```typescript
import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { flow } from "../src/flow"
import { ParseError } from "../src/errors"

describe("Scope", () => {
  describe("flow parse", () => {
    it("parses input before factory execution", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const parseOrder: string[] = []

      const myFlow = flow({
        parse: (raw) => {
          parseOrder.push("parse")
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw.toUpperCase()
        },
        factory: (ctx) => {
          parseOrder.push("factory")
          return ctx.input
        },
      })

      const result = await ctx.exec({ flow: myFlow, input: "hello" })

      expect(result).toBe("HELLO")
      expect(parseOrder).toEqual(["parse", "factory"])
      await ctx.close()
    })

    it("throws ParseError when flow parse fails", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const myFlow = flow({
        name: "stringFlow",
        parse: (raw) => {
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw
        },
        factory: (ctx) => ctx.input,
      })

      try {
        await ctx.exec({ flow: myFlow, input: 123 })
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError)
        const parseErr = err as ParseError
        expect(parseErr.phase).toBe("flow-input")
        expect(parseErr.label).toBe("stringFlow")
      }

      await ctx.close()
    })

    it("uses exec name over flow name in ParseError", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const myFlow = flow({
        name: "flowName",
        parse: (raw) => {
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw
        },
        factory: (ctx) => ctx.input,
      })

      try {
        await ctx.exec({ flow: myFlow, input: 123, name: "execName" })
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError)
        const parseErr = err as ParseError
        expect(parseErr.label).toBe("execName")
      }

      await ctx.close()
    })

    it("uses 'anonymous' when no name provided", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const myFlow = flow({
        parse: (raw) => {
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw
        },
        factory: (ctx) => ctx.input,
      })

      try {
        await ctx.exec({ flow: myFlow, input: 123 })
        expect.fail("Should have thrown")
      } catch (err) {
        expect(err).toBeInstanceOf(ParseError)
        const parseErr = err as ParseError
        expect(parseErr.label).toBe("anonymous")
      }

      await ctx.close()
    })

    it("supports async parse", async () => {
      const scope = createScope()
      const ctx = scope.createContext()

      const myFlow = flow({
        parse: async (raw) => {
          await new Promise((r) => setTimeout(r, 1))
          if (typeof raw !== "string") throw new Error("Must be string")
          return raw.toUpperCase()
        },
        factory: (ctx) => ctx.input,
      })

      const result = await ctx.exec({ flow: myFlow, input: "hello" })
      expect(result).toBe("HELLO")
      await ctx.close()
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test -- tests/scope.test.ts`
Expected: FAIL - parse not called, ctx.input still raw

**Step 3: Update scope.ts to call parse**

In `packages/lite/src/scope.ts`, add import at top:

```typescript
import { ParseError } from "./errors"
```

Then update `execFlow` method in `ExecutionContextImpl` (around line 623):

```typescript
  private async execFlow<T>(options: Lite.ExecFlowOptions<T>): Promise<T> {
    const { flow, input, tags: execTags, name: execName } = options

    const hasExtraTags = (execTags?.length ?? 0) > 0 || (flow.tags?.length ?? 0) > 0
    const allTags = hasExtraTags
      ? [...(execTags ?? []), ...this.baseTags, ...(flow.tags ?? [])]
      : this.baseTags

    const resolvedDeps = await this.scope.resolveDeps(flow.deps, allTags)

    let parsedInput: unknown = input
    if (flow.parse) {
      const label = execName ?? flow.name ?? "anonymous"
      try {
        parsedInput = await flow.parse(input)
      } catch (err) {
        throw new ParseError(
          `Failed to parse flow input "${label}"`,
          "flow-input",
          label,
          err
        )
      }
    }

    this._input = parsedInput

    const factory = flow.factory as unknown as (
      ctx: Lite.ExecutionContext,
      deps?: Record<string, unknown>
    ) => MaybePromise<T>

    const doExec = async (): Promise<T> => {
      if (flow.deps && Object.keys(flow.deps).length > 0) {
        return factory(this, resolvedDeps)
      } else {
        return factory(this)
      }
    }

    return this.applyExecExtensions(flow, doExec)
  }
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test -- tests/scope.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `pnpm -F @pumped-fn/lite test`
Expected: All PASS

**Step 6: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: No errors

**Step 7: Commit**

```bash
git add packages/lite/src/scope.ts packages/lite/tests/scope.test.ts
git commit -m "feat(lite): implement flow parse execution in scope"
```

---

## Task 8: Add Type Inference Tests

**Files:**
- Test: `packages/lite/tests/types.test.ts`

**Step 1: Add type inference tests**

Add to `packages/lite/tests/types.test.ts`:

```typescript
import { describe, it, expect, expectTypeOf } from "vitest"
import { tag } from "../src/tag"
import { flow } from "../src/flow"
import { createScope } from "../src/scope"
import type { Lite } from "../src/types"

describe("Type Inference", () => {
  describe("Tag with parse", () => {
    it("infers type from parse return", () => {
      const numberTag = tag({
        label: "count",
        parse: (raw): number => {
          const n = Number(raw)
          if (isNaN(n)) throw new Error("Must be number")
          return n
        },
      })

      const tagged = numberTag(42)
      expectTypeOf(tagged.value).toEqualTypeOf<number>()
    })
  })

  describe("Flow with parse", () => {
    it("infers ctx.input from parse return", async () => {
      const myFlow = flow({
        parse: (raw): { name: string } => {
          if (typeof raw !== "object" || raw === null) {
            throw new Error("Must be object")
          }
          const obj = raw as Record<string, unknown>
          if (typeof obj.name !== "string") {
            throw new Error("name must be string")
          }
          return { name: obj.name }
        },
        factory: (ctx) => {
          expectTypeOf(ctx.input).toEqualTypeOf<{ name: string }>()
          return ctx.input.name.toUpperCase()
        },
      })

      const scope = createScope()
      const ctx = scope.createContext()
      const result = await ctx.exec({ flow: myFlow, input: { name: "test" } })
      expect(result).toBe("TEST")
      await ctx.close()
    })

    it("ctx.input is unknown without parse", async () => {
      const myFlow = flow({
        factory: (ctx) => {
          expectTypeOf(ctx.input).toEqualTypeOf<unknown>()
          return String(ctx.input)
        },
      })

      const scope = createScope()
      const ctx = scope.createContext()
      const result = await ctx.exec({ flow: myFlow, input: "test" })
      expect(result).toBe("test")
      await ctx.close()
    })
  })
})
```

**Step 2: Run type tests**

Run: `pnpm -F @pumped-fn/lite test -- tests/types.test.ts`
Expected: PASS

**Step 3: Run full typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/lite/tests/types.test.ts
git commit -m "test(lite): add type inference tests for parse"
```

---

## Task 9: Run Full Test Suite and Typecheck

**Files:** None (verification only)

**Step 1: Run all tests**

Run: `pnpm -F @pumped-fn/lite test`
Expected: All PASS

**Step 2: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: No errors

**Step 3: Commit if any fixes needed**

If fixes were needed:
```bash
git add -A
git commit -m "fix(lite): address test/typecheck issues"
```

---

## Task 10: Update C3 Documentation

**Files:**
- Modify: `.c3/c3-2-lite/c3-203-flow.md`
- Modify: `.c3/c3-2-lite/c3-204-tag.md`

**Step 1: Update c3-204-tag.md**

Add new section after "Creating Tags" in `.c3/c3-2-lite/c3-204-tag.md`:

```markdown
### Tag with Parse

Tags can include a parse function for runtime validation:

```typescript
const userId = tag({
  label: 'userId',
  parse: (raw) => {
    if (typeof raw !== 'string') throw new Error('Must be string')
    if (raw.length < 1) throw new Error('Cannot be empty')
    return raw
  }
})

// Validates on creation
userId('abc-123')  // OK
userId(123)        // Throws ParseError
```

**Parse behavior:**
- Runs synchronously when `tag(value)` is called
- Throws `ParseError` with `phase: 'tag'` on failure
- Type is inferred from parse return type
- Default values bypass parsing
```

Update the Tag interface in the Concepts section to include `parse?`.

**Step 2: Update c3-203-flow.md**

Add new section after "Creating Flows" in `.c3/c3-2-lite/c3-203-flow.md`:

```markdown
### Flow with Parse

Flows can include a parse function for input validation:

```typescript
const createUser = flow({
  name: 'createUser',
  parse: (raw) => {
    const obj = raw as Record<string, unknown>
    if (typeof obj.name !== 'string') throw new Error('name required')
    if (typeof obj.email !== 'string') throw new Error('email required')
    return { name: obj.name, email: obj.email }
  },
  factory: (ctx) => {
    // ctx.input is typed as { name: string; email: string }
    return db.users.create(ctx.input)
  }
})
```

**Parse behavior:**
- Runs before factory in `ctx.exec()`
- Can be sync or async
- Throws `ParseError` with `phase: 'flow-input'` on failure
- `ctx.input` type is inferred from parse return type
- Error label priority: exec name > flow name > 'anonymous'

### Flow Naming

Flows can have optional names for debugging:

```typescript
const myFlow = flow({
  name: 'myFlow',
  factory: (ctx) => { ... }
})

// Or override at execution
await ctx.exec({
  flow: myFlow,
  input: data,
  name: 'specificExecution'
})
```
```

Update the Flow interface in Concepts to include `name?` and `parse?`.

**Step 3: Commit**

```bash
git add .c3/c3-2-lite/c3-203-flow.md .c3/c3-2-lite/c3-204-tag.md
git commit -m "docs(c3): update lite flow and tag docs with parse feature"
```

---

## Verification Checklist

After completing all tasks:

- [ ] `pnpm -F @pumped-fn/lite test` - All tests pass
- [ ] `pnpm -F @pumped-fn/lite typecheck` - No type errors
- [ ] `pnpm -F @pumped-fn/lite typecheck:full` - No type errors including tests
- [ ] Tag with parse validates on creation
- [ ] Tag default bypasses parse
- [ ] Flow parse runs before factory
- [ ] Flow parse supports async
- [ ] ParseError has correct phase/label/cause
- [ ] Type inference works for both Tag and Flow
- [ ] C3 docs updated
