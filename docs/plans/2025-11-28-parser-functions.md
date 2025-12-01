# Parser Functions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add parser functions to Flow and Tag for library-agnostic validation with full TypeScript type inference.

**Architecture:** Parser functions `(raw: unknown) => T` provide type inference from return type. Flow parsers run at execution time (async supported). Tag parsers run at tagged value creation (sync only). Errors wrapped in `ParseError` with phase context.

**Tech Stack:** TypeScript, Vitest for testing

**Reference:** ADR-005 at `.c3/adr/adr-005-flow-schema-slots.md`

---

## Task 1: Create ParseError Class

**Files:**
- Create: `packages/lite/src/errors.ts`
- Modify: `packages/lite/src/index.ts`
- Test: `packages/lite/tests/errors.test.ts`

**Step 1: Write the failing test**

Create `packages/lite/tests/errors.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { ParseError } from "../src/errors"

describe("ParseError", () => {
  it("should create error with input phase", () => {
    const cause = new Error("Invalid type")
    const error = new ParseError("input", { cause })

    expect(error.name).toBe("ParseError")
    expect(error.phase).toBe("input")
    expect(error.cause).toBe(cause)
    expect(error.label).toBeUndefined()
    expect(error.message).toContain("input")
  })

  it("should create error with output phase", () => {
    const cause = new Error("Missing field")
    const error = new ParseError("output", { cause })

    expect(error.phase).toBe("output")
    expect(error.message).toContain("output")
  })

  it("should create error with tag phase and label", () => {
    const cause = new Error("Invalid UUID")
    const error = new ParseError("tag", { cause, label: "userId" })

    expect(error.phase).toBe("tag")
    expect(error.label).toBe("userId")
    expect(error.message).toContain("tag")
    expect(error.message).toContain("userId")
  })

  it("should handle non-Error cause", () => {
    const error = new ParseError("input", { cause: "string error" })

    expect(error.cause).toBe("string error")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test tests/errors.test.ts`
Expected: FAIL with "Cannot find module '../src/errors'"

**Step 3: Write minimal implementation**

Create `packages/lite/src/errors.ts`:

```typescript
export type ParsePhase = "input" | "output" | "tag"

export interface ParseErrorOptions {
  cause: unknown
  label?: string
}

export class ParseError extends Error {
  readonly name = "ParseError"
  readonly phase: ParsePhase
  readonly label?: string
  readonly cause: unknown

  constructor(phase: ParsePhase, options: ParseErrorOptions) {
    const labelPart = options.label ? ` "${options.label}"` : ""
    const message = `Failed to parse ${phase}${labelPart}`
    super(message)
    this.phase = phase
    this.label = options.label
    this.cause = options.cause
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test tests/errors.test.ts`
Expected: PASS

**Step 5: Export ParseError from index**

Modify `packages/lite/src/index.ts`, add after line 16:

```typescript
export { ParseError } from "./errors"
export type { ParsePhase, ParseErrorOptions } from "./errors"
```

**Step 6: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/lite/src/errors.ts packages/lite/tests/errors.test.ts packages/lite/src/index.ts
git commit -m "feat(lite): add ParseError class for parser error context"
```

---

## Task 2: Add Tag Parser Types

**Files:**
- Modify: `packages/lite/src/types.ts:87-97`
- Test: `packages/lite/tests/types.test.ts`

**Step 1: Write the failing type test**

Add to `packages/lite/tests/types.test.ts` (at end of file):

```typescript
describe("Tag with parse", () => {
  it("should infer type from parse function", () => {
    const myTag = {} as Lite.Tag<{ id: string }, false>

    expectTypeOf(myTag.parse).toEqualTypeOf<
      ((raw: unknown) => { id: string }) | undefined
    >()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: FAIL with "Property 'parse' does not exist"

**Step 3: Update Tag interface in types.ts**

Modify `packages/lite/src/types.ts` lines 87-97, replace with:

```typescript
  export interface Tag<T, HasDefault extends boolean = false> {
    readonly [tagSymbol]: true
    readonly key: symbol
    readonly label: string
    readonly parse?: (raw: unknown) => T
    readonly defaultValue: HasDefault extends true ? T : undefined
    readonly hasDefault: HasDefault
    (value: T): Tagged<T>
    get(source: TagSource): HasDefault extends true ? T : T
    find(source: TagSource): HasDefault extends true ? T : T | undefined
    collect(source: TagSource): T[]
  }
```

**Step 4: Run typecheck to verify it passes**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/lite/src/types.ts packages/lite/tests/types.test.ts
git commit -m "feat(lite): add parse property to Tag interface"
```

---

## Task 3: Implement Tag Parser

**Files:**
- Modify: `packages/lite/src/tag.ts:4-7,29-78`
- Test: `packages/lite/tests/tag.test.ts`

**Step 1: Write the failing test**

Add to `packages/lite/tests/tag.test.ts` (add import for ParseError at top, add describe block at end):

```typescript
import { ParseError } from "../src/errors"

// ... existing tests ...

describe("tag with parse", () => {
  it("should call parse when creating tagged value", () => {
    const parseCount = { count: 0 }
    const myTag = tag({
      label: "parsed",
      parse: (raw) => {
        parseCount.count++
        if (typeof raw !== "string") throw new Error("Expected string")
        return raw.toUpperCase()
      },
    })

    const tagged = myTag("hello")

    expect(tagged.value).toBe("HELLO")
    expect(parseCount.count).toBe(1)
  })

  it("should throw ParseError when parse fails", () => {
    const myTag = tag({
      label: "userId",
      parse: (raw) => {
        if (typeof raw !== "string") throw new Error("Expected string")
        return raw
      },
    })

    expect(() => myTag(123 as unknown as string)).toThrow(ParseError)

    try {
      myTag(123 as unknown as string)
    } catch (e) {
      const err = e as ParseError
      expect(err.phase).toBe("tag")
      expect(err.label).toBe("userId")
      expect(err.cause).toBeInstanceOf(Error)
    }
  })

  it("should not parse defaultValue", () => {
    const parseCount = { count: 0 }
    const myTag = tag({
      label: "config",
      parse: (raw) => {
        parseCount.count++
        return raw as { timeout: number }
      },
      default: { timeout: 5000 },
    })

    expect(myTag.defaultValue).toEqual({ timeout: 5000 })
    expect(parseCount.count).toBe(0)
  })

  it("should work without parse (backward compatible)", () => {
    const myTag = tag<string>({ label: "simple" })
    const tagged = myTag("hello")

    expect(tagged.value).toBe("hello")
  })

  it("should expose parse function on tag", () => {
    const myTag = tag({
      label: "test",
      parse: (raw) => String(raw),
    })

    expect(myTag.parse).toBeDefined()
    expect(myTag.parse!("hello")).toBe("hello")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test tests/tag.test.ts`
Expected: FAIL (parse not implemented)

**Step 3: Update TagOptions interface**

Modify `packages/lite/src/tag.ts` lines 4-7, replace with:

```typescript
export interface TagOptions<T, HasDefault extends boolean> {
  label: string
  parse?: (raw: unknown) => T
  default?: HasDefault extends true ? T : never
}
```

**Step 4: Update tag function overloads**

Modify `packages/lite/src/tag.ts` lines 24-28, replace with:

```typescript
export function tag<T>(options: { label: string; parse?: (raw: unknown) => T }): Lite.Tag<T, false>
export function tag<T>(options: {
  label: string
  parse?: (raw: unknown) => T
  default: T
}): Lite.Tag<T, true>
```

**Step 5: Update createTagged function and tag return**

Modify `packages/lite/src/tag.ts`, add import at top:

```typescript
import { ParseError } from "./errors"
```

Then replace the `createTagged` function (lines 34-39) with:

```typescript
  const parse = options.parse

  function createTagged(value: T): Lite.Tagged<T> {
    let parsedValue = value
    if (parse) {
      try {
        parsedValue = parse(value as unknown)
      } catch (cause) {
        throw new ParseError("tag", { cause, label: options.label })
      }
    }
    return {
      [taggedSymbol]: true,
      key,
      value: parsedValue,
    }
  }
```

Then update the return statement (around line 69) to include `parse`:

```typescript
  return Object.assign(createTagged, {
    [tagSymbol]: true as const,
    key,
    label: options.label,
    parse,
    hasDefault,
    defaultValue,
    get,
    find,
    collect,
  }) as unknown as Lite.Tag<T, boolean>
```

**Step 6: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test tests/tag.test.ts`
Expected: PASS

**Step 7: Run all tests**

Run: `pnpm -F @pumped-fn/lite test`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/lite/src/tag.ts packages/lite/tests/tag.test.ts
git commit -m "feat(lite): implement tag parser with ParseError wrapping"
```

---

## Task 4: Add Flow Parser Types

**Files:**
- Modify: `packages/lite/src/types.ts:43-48,56-63,160-166`
- Test: `packages/lite/tests/types.test.ts`

**Step 1: Write the failing type test**

Add to `packages/lite/tests/types.test.ts`:

```typescript
describe("Flow with parsers", () => {
  it("should have input parser on Flow interface", () => {
    const myFlow = {} as Lite.Flow<string, number>

    expectTypeOf(myFlow.input).toEqualTypeOf<
      ((raw: unknown) => number | Promise<number>) | undefined
    >()
  })

  it("should have output parser on Flow interface", () => {
    const myFlow = {} as Lite.Flow<string, number>

    expectTypeOf(myFlow.output).toEqualTypeOf<
      ((result: string) => string | Promise<string>) | undefined
    >()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: FAIL with "Property 'input' does not exist"

**Step 3: Update Flow interface**

Modify `packages/lite/src/types.ts` lines 43-48, replace with:

```typescript
  export interface Flow<TOutput, TInput = unknown> {
    readonly [flowSymbol]: true
    readonly input?: (raw: unknown) => MaybePromise<TInput>
    readonly output?: (result: TOutput) => MaybePromise<TOutput>
    readonly factory: FlowFactory<TOutput, TInput, Record<string, Dependency>>
    readonly deps?: Record<string, Dependency>
    readonly tags?: Tagged<unknown>[]
  }
```

**Step 4: Update ExecutionContext interface for typed input**

Modify `packages/lite/src/types.ts` lines 56-63, replace with:

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

**Step 5: Update FlowFactory type**

Modify `packages/lite/src/types.ts` lines 160-166, replace with:

```typescript
  export type FlowFactory<
    TOutput,
    TInput,
    D extends Record<string, Dependency>,
  > = keyof D extends never
    ? (ctx: ExecutionContext<TInput>) => MaybePromise<TOutput>
    : (ctx: ExecutionContext<TInput>, deps: InferDeps<D>) => MaybePromise<TOutput>
```

**Step 6: Run typecheck to verify it passes**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/lite/src/types.ts packages/lite/tests/types.test.ts
git commit -m "feat(lite): add input/output parser types to Flow interface"
```

---

## Task 5: Update flow() Function Signature

**Files:**
- Modify: `packages/lite/src/flow.ts`
- Test: `packages/lite/tests/flow.test.ts`

**Step 1: Write the failing type inference test**

Add to `packages/lite/tests/flow.test.ts`:

```typescript
import { expectTypeOf } from "vitest"

describe("flow with input parser", () => {
  it("should infer TInput from input parser return type", () => {
    const myFlow = flow({
      input: (raw) => {
        if (typeof raw !== "object" || raw === null) throw new Error()
        const obj = raw as Record<string, unknown>
        return { name: String(obj.name), age: Number(obj.age) }
      },
      factory: (ctx) => {
        expectTypeOf(ctx.input).toEqualTypeOf<{ name: string; age: number }>()
        return `${ctx.input.name} is ${ctx.input.age}`
      },
    })

    expectTypeOf(myFlow).toMatchTypeOf<Lite.Flow<string, { name: string; age: number }>>()
  })

  it("should support async input parser", () => {
    const myFlow = flow({
      input: async (raw) => {
        return { id: String(raw) }
      },
      factory: (ctx) => {
        expectTypeOf(ctx.input).toEqualTypeOf<{ id: string }>()
        return ctx.input.id
      },
    })

    expectTypeOf(myFlow).toMatchTypeOf<Lite.Flow<string, { id: string }>>()
  })

  it("should work without input parser (backward compatible)", () => {
    const myFlow = flow({
      factory: (ctx) => {
        expectTypeOf(ctx.input).toEqualTypeOf<unknown>()
        return "result"
      },
    })

    expectTypeOf(myFlow).toMatchTypeOf<Lite.Flow<string, unknown>>()
  })

  it("should have output parser on flow object", () => {
    const myFlow = flow({
      output: (result) => ({ validated: result }),
      factory: () => "hello",
    })

    expect(myFlow.output).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: FAIL (input property not on flow config)

**Step 3: Update FlowConfig interface**

Modify `packages/lite/src/flow.ts` lines 4-12, replace with:

```typescript
export interface FlowConfig<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
> {
  input?: (raw: unknown) => MaybePromise<TInput>
  output?: (result: TOutput) => MaybePromise<TOutput>
  deps?: D
  factory: Lite.FlowFactory<TOutput, TInput, D>
  tags?: Lite.Tagged<unknown>[]
}
```

**Step 4: Update flow function overloads**

Replace the entire `packages/lite/src/flow.ts` file with:

```typescript
import { flowSymbol } from "./symbols"
import type { Lite, MaybePromise } from "./types"

export interface FlowConfig<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
> {
  input?: (raw: unknown) => MaybePromise<TInput>
  output?: (result: TOutput) => MaybePromise<TOutput>
  deps?: D
  factory: Lite.FlowFactory<TOutput, TInput, D>
  tags?: Lite.Tagged<unknown>[]
}

/**
 * Creates a short-lived execution unit that processes input and produces output.
 *
 * @param config - Configuration object containing factory function, optional dependencies, parsers, and tags
 * @returns A Flow instance that can be executed within an execution context
 *
 * @example
 * ```typescript
 * const processUser = flow({
 *   input: (raw) => userSchema.parse(raw),
 *   factory: async (ctx) => {
 *     // ctx.input is typed from parser return
 *     return await fetchUser(ctx.input.id)
 *   }
 * })
 * ```
 */
export function flow<TOutput, TInput = unknown>(config: {
  input: (raw: unknown) => MaybePromise<TInput>
  output?: (result: TOutput) => MaybePromise<TOutput>
  deps?: undefined
  factory: (ctx: Lite.ExecutionContext<TInput>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<TOutput>(config: {
  input?: undefined
  output?: (result: TOutput) => MaybePromise<TOutput>
  deps?: undefined
  factory: (ctx: Lite.ExecutionContext<unknown>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, unknown>

export function flow<
  TOutput,
  TInput,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | { mode: string }>,
>(config: {
  input: (raw: unknown) => MaybePromise<TInput>
  output?: (result: TOutput) => MaybePromise<TOutput>
  deps: D
  factory: (ctx: Lite.ExecutionContext<TInput>, deps: Lite.InferDeps<D>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, TInput>

export function flow<
  TOutput,
  const D extends Record<string, Lite.Atom<unknown> | Lite.ControllerDep<unknown> | { mode: string }>,
>(config: {
  input?: undefined
  output?: (result: TOutput) => MaybePromise<TOutput>
  deps: D
  factory: (ctx: Lite.ExecutionContext<unknown>, deps: Lite.InferDeps<D>) => MaybePromise<TOutput>
  tags?: Lite.Tagged<unknown>[]
}): Lite.Flow<TOutput, unknown>

export function flow<
  TOutput,
  TInput,
  D extends Record<string, Lite.Dependency>,
>(config: FlowConfig<TOutput, TInput, D>): Lite.Flow<TOutput, TInput> {
  return {
    [flowSymbol]: true,
    input: config.input as ((raw: unknown) => MaybePromise<TInput>) | undefined,
    output: config.output,
    factory: config.factory as unknown as Lite.FlowFactory<
      TOutput,
      TInput,
      Record<string, Lite.Dependency>
    >,
    deps: config.deps as unknown as Record<string, Lite.Dependency> | undefined,
    tags: config.tags,
  }
}

/**
 * Type guard to check if a value is a Flow.
 *
 * @param value - The value to check
 * @returns True if the value is a Flow, false otherwise
 *
 * @example
 * ```typescript
 * if (isFlow(value)) {
 *   await ctx.exec({ flow: value, input: data })
 * }
 * ```
 */
export function isFlow(value: unknown): value is Lite.Flow<unknown, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[flowSymbol] === true
  )
}
```

**Step 5: Run typecheck to verify it passes**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: PASS

**Step 6: Run tests**

Run: `pnpm -F @pumped-fn/lite test tests/flow.test.ts`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/lite/src/flow.ts packages/lite/tests/flow.test.ts
git commit -m "feat(lite): update flow() with input/output parser support and type inference"
```

---

## Task 6: Implement Flow Parser Execution

**Files:**
- Modify: `packages/lite/src/scope.ts:435-461`
- Test: `packages/lite/tests/scope.test.ts`

**Step 1: Write the failing test**

Add to `packages/lite/tests/scope.test.ts` (add import for ParseError):

```typescript
import { ParseError } from "../src/errors"

// ... existing tests ...

describe("flow parser execution", () => {
  it("should call input parser before factory", async () => {
    const callOrder: string[] = []

    const myFlow = flow({
      input: (raw) => {
        callOrder.push("input")
        return { value: String(raw) }
      },
      factory: (ctx) => {
        callOrder.push("factory")
        return ctx.input.value
      },
    })

    const scope = await createScope()
    const ctx = scope.createContext()
    const result = await ctx.exec({ flow: myFlow, input: "test" })

    expect(result).toBe("test")
    expect(callOrder).toEqual(["input", "factory"])
  })

  it("should call output parser after factory", async () => {
    const callOrder: string[] = []

    const myFlow = flow({
      output: (result) => {
        callOrder.push("output")
        return result.toUpperCase()
      },
      factory: () => {
        callOrder.push("factory")
        return "hello"
      },
    })

    const scope = await createScope()
    const ctx = scope.createContext()
    const result = await ctx.exec({ flow: myFlow, input: null })

    expect(result).toBe("HELLO")
    expect(callOrder).toEqual(["factory", "output"])
  })

  it("should support async input parser", async () => {
    const myFlow = flow({
      input: async (raw) => {
        await new Promise((r) => setTimeout(r, 1))
        return { id: String(raw) }
      },
      factory: (ctx) => ctx.input.id,
    })

    const scope = await createScope()
    const ctx = scope.createContext()
    const result = await ctx.exec({ flow: myFlow, input: "123" })

    expect(result).toBe("123")
  })

  it("should throw ParseError on input parse failure", async () => {
    const myFlow = flow({
      input: (raw) => {
        throw new Error("Invalid input")
      },
      factory: () => "never reached",
    })

    const scope = await createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: myFlow, input: "test" })).rejects.toThrow(ParseError)

    try {
      await ctx.exec({ flow: myFlow, input: "test" })
    } catch (e) {
      const err = e as ParseError
      expect(err.phase).toBe("input")
      expect(err.cause).toBeInstanceOf(Error)
    }
  })

  it("should throw ParseError on output parse failure", async () => {
    const myFlow = flow({
      output: () => {
        throw new Error("Invalid output")
      },
      factory: () => "result",
    })

    const scope = await createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: myFlow, input: null })).rejects.toThrow(ParseError)

    try {
      await ctx.exec({ flow: myFlow, input: null })
    } catch (e) {
      const err = e as ParseError
      expect(err.phase).toBe("output")
    }
  })

  it("should work without parsers (backward compatible)", async () => {
    const myFlow = flow({
      factory: (ctx) => `input was: ${ctx.input}`,
    })

    const scope = await createScope()
    const ctx = scope.createContext()
    const result = await ctx.exec({ flow: myFlow, input: "hello" })

    expect(result).toBe("input was: hello")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/lite test tests/scope.test.ts`
Expected: FAIL (parsers not being called)

**Step 3: Update execFlow in scope.ts**

Add import at top of `packages/lite/src/scope.ts`:

```typescript
import { ParseError } from "./errors"
```

Then replace the `execFlow` method (around lines 435-461) with:

```typescript
  private async execFlow<T>(options: Lite.ExecFlowOptions<T>): Promise<T> {
    const { flow, input: rawInput, tags: execTags } = options

    const hasExtraTags = (execTags?.length ?? 0) > 0 || (flow.tags?.length ?? 0) > 0
    const allTags = hasExtraTags
      ? [...(execTags ?? []), ...this.baseTags, ...(flow.tags ?? [])]
      : this.baseTags

    const resolvedDeps = await this.scope.resolveDeps(flow.deps, allTags)

    let parsedInput: unknown = rawInput
    if (flow.input) {
      try {
        parsedInput = await flow.input(rawInput)
      } catch (cause) {
        throw new ParseError("input", { cause })
      }
    }

    this._input = parsedInput

    const factory = flow.factory as unknown as (
      ctx: Lite.ExecutionContext,
      deps?: Record<string, unknown>
    ) => MaybePromise<T>

    const doExec = async (): Promise<T> => {
      let result: T
      if (flow.deps && Object.keys(flow.deps).length > 0) {
        result = await factory(this, resolvedDeps)
      } else {
        result = await factory(this)
      }

      if (flow.output) {
        try {
          result = await flow.output(result)
        } catch (cause) {
          throw new ParseError("output", { cause })
        }
      }

      return result
    }

    return this.applyExecExtensions(flow, doExec)
  }
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/lite test tests/scope.test.ts`
Expected: PASS

**Step 5: Run all tests**

Run: `pnpm -F @pumped-fn/lite test`
Expected: PASS

**Step 6: Run typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/lite/src/scope.ts packages/lite/tests/scope.test.ts
git commit -m "feat(lite): implement flow parser execution with ParseError wrapping"
```

---

## Task 7: Update C3 Documentation

**Files:**
- Modify: `.c3/c3-2-lite/README.md`
- Modify: `.c3/c3-2-lite/c3-203-flow.md`
- Modify: `.c3/c3-2-lite/c3-204-tag.md`

**Step 1: Update comparison table in README.md**

In `.c3/c3-2-lite/README.md`, find the comparison table and update the "Schema validation" row:

From:
```markdown
| Schema validation | No | StandardSchema |
```

To:
```markdown
| Schema validation | Parser functions | StandardSchema |
```

**Step 2: Add ParseError to Public API table**

In `.c3/c3-2-lite/README.md`, add to the Interfaces table:

```markdown
| `ParseError` | Error class with phase context (input/output/tag) |
```

**Step 3: Update c3-203-flow.md Concepts section**

Add after the Flow Interface code block:

```markdown
### Parser Functions

Flows support optional `input` and `output` parser functions for validation with automatic type inference:

```typescript
interface Flow<TOutput, TInput = unknown> {
  readonly input?: (raw: unknown) => MaybePromise<TInput>
  readonly output?: (result: TOutput) => MaybePromise<TOutput>
  // ... other properties
}
```

**Type inference:** `TInput` is inferred from the `input` parser's return type. No manual type annotations needed.
```

**Step 4: Add parser example to c3-203-flow.md Creating section**

Add new subsection:

```markdown
### Flow with Input Parser

```typescript
const createUser = flow({
  input: (raw) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('Expected object')
    }
    const obj = raw as Record<string, unknown>
    return {
      name: String(obj.name),
      email: String(obj.email)
    }
  },
  factory: (ctx) => {
    // ctx.input is { name: string; email: string } - inferred!
    return { id: crypto.randomUUID(), ...ctx.input }
  }
})
```

### Flow with Output Parser

```typescript
const getUser = flow({
  output: (result) => {
    if (!result.id) throw new Error('Missing id')
    return result
  },
  factory: async (ctx) => {
    return await db.users.find(ctx.input)
  }
})
```
```

**Step 5: Update c3-204-tag.md Concepts section**

Add after the Tag Interface code block:

```markdown
### Parser Function

Tags support an optional `parse` function for validation:

```typescript
interface Tag<T, HasDefault extends boolean = false> {
  readonly parse?: (raw: unknown) => T  // Sync only
  // ... other properties
}
```

**Note:** Tag parsers are synchronous. The `defaultValue` is NOT parsed (trusted to be valid).
```

**Step 6: Add parser example to c3-204-tag.md Creating section**

Add new subsection:

```markdown
### Tag with Parser

```typescript
const userIdTag = tag({
  label: 'userId',
  parse: (raw) => {
    if (typeof raw !== 'string') throw new Error('Expected string')
    if (!/^[0-9a-f-]{36}$/.test(raw)) throw new Error('Invalid UUID')
    return raw
  }
})

userIdTag('123e4567-e89b-12d3-a456-426614174000')  // OK
userIdTag('invalid')  // Throws ParseError
```
```

**Step 7: Commit**

```bash
git add .c3/c3-2-lite/README.md .c3/c3-2-lite/c3-203-flow.md .c3/c3-2-lite/c3-204-tag.md
git commit -m "docs(c3): update lite documentation for parser functions"
```

---

## Task 8: Final Verification

**Step 1: Run full test suite**

Run: `pnpm -F @pumped-fn/lite test`
Expected: All tests PASS

**Step 2: Run full typecheck**

Run: `pnpm -F @pumped-fn/lite typecheck:full`
Expected: PASS

**Step 3: Run examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 4: Build package**

Run: `pnpm -F @pumped-fn/lite build`
Expected: PASS

**Step 5: Update ADR status**

Change `.c3/adr/adr-005-flow-schema-slots.md` status from `proposed` to `accepted`:

```markdown
status: accepted
```

**Step 6: Final commit**

```bash
git add .c3/adr/adr-005-flow-schema-slots.md
git commit -m "chore(lite): mark ADR-005 as accepted"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create ParseError class | `src/errors.ts`, `tests/errors.test.ts` |
| 2 | Add Tag parser types | `src/types.ts` |
| 3 | Implement Tag parser | `src/tag.ts`, `tests/tag.test.ts` |
| 4 | Add Flow parser types | `src/types.ts` |
| 5 | Update flow() signature | `src/flow.ts`, `tests/flow.test.ts` |
| 6 | Implement Flow parser execution | `src/scope.ts`, `tests/scope.test.ts` |
| 7 | Update C3 documentation | `.c3/c3-2-lite/*.md` |
| 8 | Final verification | All |
