# Sucrose Static Analysis Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add static code analysis at executor creation time to generate optimized factories via `new Function()`, with fail-fast validation, call site capture, and `name` tag error enrichment.

**Architecture:** Sucrose analyzes factory functions via `fn.toString()` at `provide()`/`derive()` time, detects usage patterns (async, controller methods, dependency access), generates compiled functions with unified `(deps, ctl)` signature, and stores metadata in a WeakMap. Runtime wrapper enriches errors with `name` tag and call site.

**Tech Stack:** TypeScript, Vitest for testing, `new Function()` for code generation

---

## Task 1: Create Sucrose Types

**Files:**
- Create: `packages/next/src/sucrose.ts`

**Step 1: Write the failing test**

Create test file first to define expected interface:

```typescript
// In packages/next/tests/index.test.ts - add at end of file

describe("Sucrose (Static Analysis)", () => {
  describe("types", () => {
    it("exports Sucrose namespace with Inference type", async () => {
      // This test validates the type exists - will fail at compile if wrong
      const inference: Sucrose.Inference = {
        async: false,
        usesCleanup: false,
        usesRelease: false,
        usesReload: false,
        usesScope: false,
        dependencyShape: "none",
        dependencyAccess: [],
      }
      expect(inference.async).toBe(false)
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: FAIL with "Cannot find namespace 'Sucrose'"

**Step 3: Write minimal implementation**

```typescript
// packages/next/src/sucrose.ts

export namespace Sucrose {
  export type DependencyShape = "none" | "single" | "array" | "record"

  export interface Inference {
    async: boolean
    usesCleanup: boolean
    usesRelease: boolean
    usesReload: boolean
    usesScope: boolean
    dependencyShape: DependencyShape
    dependencyAccess: (number | string)[]
  }

  export interface Metadata {
    inference: Inference
    compiled: (deps: unknown, ctl: unknown) => unknown
    original: Function
    callSite: string
    name: string | undefined
  }
}
```

**Step 4: Export from index.ts**

Add to `packages/next/src/index.ts`:

```typescript
export { Sucrose } from "./sucrose"
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next typecheck:full && pnpm -F @pumped-fn/core-next test`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/sucrose.ts packages/next/src/index.ts packages/next/tests/index.test.ts
git commit -m "feat(sucrose): add Sucrose namespace with Inference and Metadata types"
```

---

## Task 2: Implement Function Parsing - separateFunction

**Files:**
- Modify: `packages/next/src/sucrose.ts`
- Test: `packages/next/tests/index.test.ts`

**Step 1: Write failing tests for separateFunction**

```typescript
// Add to "Sucrose (Static Analysis)" describe block

describe("separateFunction", () => {
  it("parses arrow function with destructured params", () => {
    const fn = ([db, cache]: [string, string], ctl: unknown) => db + cache
    const [params, body] = separateFunction(fn)
    expect(params).toBe("[db, cache], ctl")
    expect(body).toContain("db + cache")
  })

  it("parses arrow function with single param", () => {
    const fn = (ctl: unknown) => "value"
    const [params, body] = separateFunction(fn)
    expect(params).toBe("ctl")
    expect(body).toContain("value")
  })

  it("parses arrow function with object destructuring", () => {
    const fn = ({ db, cache }: { db: string; cache: string }, ctl: unknown) => db
    const [params, body] = separateFunction(fn)
    expect(params).toBe("{ db, cache }, ctl")
    expect(body).toContain("db")
  })

  it("parses async arrow function", () => {
    const fn = async (ctl: unknown) => "async-value"
    const [params, body] = separateFunction(fn)
    expect(params).toBe("ctl")
    expect(body).toContain("async-value")
  })

  it("parses arrow function with block body", () => {
    const fn = (ctl: unknown) => {
      const x = 1
      return x
    }
    const [params, body] = separateFunction(fn)
    expect(params).toBe("ctl")
    expect(body).toContain("const x = 1")
    expect(body).toContain("return x")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "separateFunction"`
Expected: FAIL with "separateFunction is not defined"

**Step 3: Write minimal implementation**

```typescript
// Add to packages/next/src/sucrose.ts

export function separateFunction(fn: Function): [string, string] {
  const content = fn.toString()

  const asyncMatch = content.match(/^async\s*/)
  const withoutAsync = asyncMatch ? content.slice(asyncMatch[0].length) : content

  const arrowIndex = withoutAsync.indexOf("=>")
  if (arrowIndex === -1) {
    throw new Error("Only arrow functions are supported")
  }

  let params = withoutAsync.slice(0, arrowIndex).trim()

  if (params.startsWith("(") && params.endsWith(")")) {
    params = params.slice(1, -1).trim()
  }

  let body = withoutAsync.slice(arrowIndex + 2).trim()

  if (body.startsWith("{") && body.endsWith("}")) {
    body = body.slice(1, -1).trim()
  }

  return [params, body]
}
```

**Step 4: Export from index.ts**

```typescript
export { Sucrose, separateFunction } from "./sucrose"
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "separateFunction"`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/sucrose.ts packages/next/src/index.ts packages/next/tests/index.test.ts
git commit -m "feat(sucrose): add separateFunction for parsing arrow functions"
```

---

## Task 3: Implement Inference Detection - analyze

**Files:**
- Modify: `packages/next/src/sucrose.ts`
- Test: `packages/next/tests/index.test.ts`

**Step 1: Write failing tests for analyze**

```typescript
// Add to "Sucrose (Static Analysis)" describe block

describe("analyze", () => {
  it("detects async factory", () => {
    const fn = async (ctl: unknown) => "value"
    const inference = analyze(fn, "none")
    expect(inference.async).toBe(true)
  })

  it("detects sync factory", () => {
    const fn = (ctl: unknown) => "value"
    const inference = analyze(fn, "none")
    expect(inference.async).toBe(false)
  })

  it("detects ctl.cleanup usage", () => {
    const fn = (ctl: { cleanup: (fn: () => void) => void }) => {
      ctl.cleanup(() => {})
      return "value"
    }
    const inference = analyze(fn, "none")
    expect(inference.usesCleanup).toBe(true)
  })

  it("detects ctl.release usage", () => {
    const fn = (ctl: { release: () => void }) => {
      ctl.release()
      return "value"
    }
    const inference = analyze(fn, "none")
    expect(inference.usesRelease).toBe(true)
  })

  it("detects ctl.reload usage", () => {
    const fn = (ctl: { reload: () => void }) => {
      ctl.reload()
      return "value"
    }
    const inference = analyze(fn, "none")
    expect(inference.usesReload).toBe(true)
  })

  it("detects ctl.scope usage", () => {
    const fn = (ctl: { scope: unknown }) => {
      return ctl.scope
    }
    const inference = analyze(fn, "none")
    expect(inference.usesScope).toBe(true)
  })

  it("detects array dependency shape", () => {
    const fn = ([db, cache]: [unknown, unknown], ctl: unknown) => db
    const inference = analyze(fn, "array")
    expect(inference.dependencyShape).toBe("array")
  })

  it("detects record dependency shape", () => {
    const fn = ({ db }: { db: unknown }, ctl: unknown) => db
    const inference = analyze(fn, "record")
    expect(inference.dependencyShape).toBe("record")
  })

  it("detects single dependency shape", () => {
    const fn = (db: unknown, ctl: unknown) => db
    const inference = analyze(fn, "single")
    expect(inference.dependencyShape).toBe("single")
  })

  it("detects no dependency shape for provide", () => {
    const fn = (ctl: unknown) => "value"
    const inference = analyze(fn, "none")
    expect(inference.dependencyShape).toBe("none")
  })

  it("detects array index access", () => {
    const fn = ([a, b, c]: [unknown, unknown, unknown], ctl: unknown) => {
      return a
    }
    const inference = analyze(fn, "array")
    expect(inference.dependencyAccess).toContain(0)
  })

  it("detects record key access", () => {
    const fn = ({ db, cache }: { db: unknown; cache: unknown }, ctl: unknown) => {
      return db
    }
    const inference = analyze(fn, "record")
    expect(inference.dependencyAccess).toContain("db")
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "analyze"`
Expected: FAIL with "analyze is not defined"

**Step 3: Write minimal implementation**

```typescript
// Add to packages/next/src/sucrose.ts

export function analyze(
  fn: Function,
  dependencyShape: Sucrose.DependencyShape
): Sucrose.Inference {
  const content = fn.toString()
  const [params, body] = separateFunction(fn)

  const isAsync = content.trimStart().startsWith("async")

  const ctlParam = dependencyShape === "none" ? params : params.split(",").pop()?.trim() || ""

  const usesCleanup = new RegExp(`${ctlParam}\\.cleanup`).test(body)
  const usesRelease = new RegExp(`${ctlParam}\\.release`).test(body)
  const usesReload = new RegExp(`${ctlParam}\\.reload`).test(body)
  const usesScope = new RegExp(`${ctlParam}\\.scope`).test(body)

  const dependencyAccess: (number | string)[] = []

  if (dependencyShape === "array") {
    const arrayMatch = params.match(/^\[([^\]]+)\]/)
    if (arrayMatch) {
      const destructured = arrayMatch[1].split(",").map((s) => s.trim())
      destructured.forEach((varName, index) => {
        if (varName && new RegExp(`\\b${varName}\\b`).test(body)) {
          dependencyAccess.push(index)
        }
      })
    }
  } else if (dependencyShape === "record") {
    const recordMatch = params.match(/^\{([^}]+)\}/)
    if (recordMatch) {
      const destructured = recordMatch[1].split(",").map((s) => s.trim().split(":")[0].trim())
      destructured.forEach((varName) => {
        if (varName && new RegExp(`\\b${varName}\\b`).test(body)) {
          dependencyAccess.push(varName)
        }
      })
    }
  }

  return {
    async: isAsync,
    usesCleanup,
    usesRelease,
    usesReload,
    usesScope,
    dependencyShape,
    dependencyAccess,
  }
}
```

**Step 4: Export from index.ts**

```typescript
export { Sucrose, separateFunction, analyze } from "./sucrose"
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "analyze"`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/sucrose.ts packages/next/src/index.ts packages/next/tests/index.test.ts
git commit -m "feat(sucrose): add analyze function for detecting factory usage patterns"
```

---

## Task 4: Implement Code Generation - generate

**Files:**
- Modify: `packages/next/src/sucrose.ts`
- Test: `packages/next/tests/index.test.ts`

**Step 1: Write failing tests for generate**

```typescript
// Add to "Sucrose (Static Analysis)" describe block

describe("generate", () => {
  it("generates function for provide (no deps)", () => {
    const fn = (ctl: unknown) => "value"
    const compiled = generate(fn, "none", "testExecutor")
    expect(typeof compiled).toBe("function")
    expect(compiled(undefined, {})).toBe("value")
  })

  it("generates function for derive with single dep", () => {
    const fn = (db: string, ctl: unknown) => `connected-${db}`
    const compiled = generate(fn, "single", "testExecutor")
    expect(compiled("postgres", {})).toBe("connected-postgres")
  })

  it("generates function for derive with array deps", () => {
    const fn = ([a, b]: [number, number], ctl: unknown) => a + b
    const compiled = generate(fn, "array", "testExecutor")
    expect(compiled([10, 5], {})).toBe(15)
  })

  it("generates function for derive with record deps", () => {
    const fn = ({ x, y }: { x: number; y: number }, ctl: unknown) => x * y
    const compiled = generate(fn, "record", "testExecutor")
    expect(compiled({ x: 3, y: 4 }, {})).toBe(12)
  })

  it("generates async function when factory is async", async () => {
    const fn = async (ctl: unknown) => "async-value"
    const compiled = generate(fn, "none", "testExecutor")
    const result = compiled(undefined, {})
    expect(result).toBeInstanceOf(Promise)
    expect(await result).toBe("async-value")
  })

  it("includes sourceURL comment", () => {
    const fn = (ctl: unknown) => "value"
    const compiled = generate(fn, "none", "myExecutor")
    expect(compiled.toString()).toContain("sourceURL=pumped-fn://myExecutor.js")
  })

  it("passes controller to factory", () => {
    const fn = (ctl: { value: number }) => ctl.value
    const compiled = generate(fn, "none", "testExecutor")
    expect(compiled(undefined, { value: 42 })).toBe(42)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "generate"`
Expected: FAIL with "generate is not defined"

**Step 3: Write minimal implementation**

```typescript
// Add to packages/next/src/sucrose.ts

export function generate(
  fn: Function,
  dependencyShape: Sucrose.DependencyShape,
  executorName: string
): (deps: unknown, ctl: unknown) => unknown {
  const content = fn.toString()
  const [params, body] = separateFunction(fn)
  const isAsync = content.trimStart().startsWith("async")

  let depsBinding = ""
  let ctlBinding = ""

  if (dependencyShape === "none") {
    ctlBinding = `const ${params} = ctl;`
  } else {
    const paramParts = params.split(",")
    const lastParam = paramParts.pop()?.trim() || "ctl"
    const depsParam = paramParts.join(",").trim()

    if (dependencyShape === "array") {
      depsBinding = `const ${depsParam} = deps;`
    } else if (dependencyShape === "record") {
      depsBinding = `const ${depsParam} = deps;`
    } else if (dependencyShape === "single") {
      depsBinding = `const ${depsParam} = deps;`
    }
    ctlBinding = `const ${lastParam} = ctl;`
  }

  const hasReturn = body.includes("return ")
  const bodyWithReturn = hasReturn ? body : `return ${body}`

  const fnBody = `
"use strict";
${depsBinding}
${ctlBinding}
${bodyWithReturn}
//# sourceURL=pumped-fn://${executorName}.js
`

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const FunctionConstructor = isAsync ? AsyncFunction : Function

  return new FunctionConstructor("deps", "ctl", fnBody) as (deps: unknown, ctl: unknown) => unknown
}
```

**Step 4: Export from index.ts**

```typescript
export { Sucrose, separateFunction, analyze, generate } from "./sucrose"
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "generate"`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/sucrose.ts packages/next/src/index.ts packages/next/tests/index.test.ts
git commit -m "feat(sucrose): add generate function for JIT code compilation"
```

---

## Task 5: Implement Call Site Capture - captureCallSite

**Files:**
- Modify: `packages/next/src/sucrose.ts`
- Test: `packages/next/tests/index.test.ts`

**Step 1: Write failing tests for captureCallSite**

```typescript
// Add to "Sucrose (Static Analysis)" describe block

describe("captureCallSite", () => {
  it("captures stack trace string", () => {
    const callSite = captureCallSite()
    expect(typeof callSite).toBe("string")
    expect(callSite.length).toBeGreaterThan(0)
  })

  it("includes file path in call site", () => {
    const callSite = captureCallSite()
    expect(callSite).toMatch(/\.ts:|\.js:/)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "captureCallSite"`
Expected: FAIL with "captureCallSite is not defined"

**Step 3: Write minimal implementation**

```typescript
// Add to packages/next/src/sucrose.ts

export function captureCallSite(): string {
  const err = new Error()
  const stack = err.stack || ""

  const lines = stack.split("\n")
  const relevantLines = lines.slice(2).filter((line) => !line.includes("sucrose.ts"))

  return relevantLines[0]?.trim() || "unknown"
}
```

**Step 4: Export from index.ts**

```typescript
export { Sucrose, separateFunction, analyze, generate, captureCallSite } from "./sucrose"
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "captureCallSite"`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/sucrose.ts packages/next/src/index.ts packages/next/tests/index.test.ts
git commit -m "feat(sucrose): add captureCallSite for debugging support"
```

---

## Task 6: Implement Metadata Storage and compile Function

**Files:**
- Modify: `packages/next/src/sucrose.ts`
- Test: `packages/next/tests/index.test.ts`

**Step 1: Write failing tests for compile**

```typescript
// Add to "Sucrose (Static Analysis)" describe block

describe("compile", () => {
  it("compiles factory and returns metadata", () => {
    const fn = (ctl: unknown) => "value"
    const meta = compile(fn, "none", undefined, [])
    expect(meta.inference.async).toBe(false)
    expect(meta.inference.dependencyShape).toBe("none")
    expect(typeof meta.compiled).toBe("function")
    expect(meta.original).toBe(fn)
    expect(typeof meta.callSite).toBe("string")
  })

  it("extracts name from tags", () => {
    const nameTag = tag(custom<string>(), { label: "pumped-fn/name" })
    const fn = (ctl: unknown) => "value"
    const meta = compile(fn, "none", undefined, [nameTag("myService")])
    expect(meta.name).toBe("myService")
  })

  it("stores metadata in WeakMap keyed by executor", () => {
    const fn = (ctl: unknown) => "value"
    const executor = {} as Core.Executor<unknown>
    const meta = compile(fn, "none", executor, [])
    const retrieved = getMetadata(executor)
    expect(retrieved).toBe(meta)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "compile"`
Expected: FAIL with "compile is not defined"

**Step 3: Write minimal implementation**

```typescript
// Add to packages/next/src/sucrose.ts

import { type Core } from "./types"
import { type Tag } from "./tag"

const metadataStore = new WeakMap<object, Sucrose.Metadata>()

export function getMetadata(executor: object): Sucrose.Metadata | undefined {
  return metadataStore.get(executor)
}

export function compile(
  fn: Function,
  dependencyShape: Sucrose.DependencyShape,
  executor: Core.Executor<unknown> | undefined,
  tags: Tag.Tagged[] | undefined
): Sucrose.Metadata {
  const nameTagKey = Symbol.for("pumped-fn/name")
  let executorName: string | undefined

  if (tags) {
    const nameTagged = tags.find((t) => t.key === nameTagKey)
    if (nameTagged) {
      executorName = nameTagged.value as string
    }
  }

  const inference = analyze(fn, dependencyShape)
  const compiled = generate(fn, dependencyShape, executorName || "anonymous")
  const callSite = captureCallSite()

  const metadata: Sucrose.Metadata = {
    inference,
    compiled,
    original: fn,
    callSite,
    name: executorName,
  }

  if (executor) {
    metadataStore.set(executor, metadata)
  }

  return metadata
}
```

**Step 4: Export from index.ts**

```typescript
export { Sucrose, separateFunction, analyze, generate, captureCallSite, compile, getMetadata } from "./sucrose"
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "compile"`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/next/src/sucrose.ts packages/next/src/index.ts packages/next/tests/index.test.ts
git commit -m "feat(sucrose): add compile function with metadata storage"
```

---

## Task 7: Integrate Sucrose into createExecutor

**Files:**
- Modify: `packages/next/src/executor.ts`
- Test: `packages/next/tests/index.test.ts`

**Step 1: Write failing integration tests**

```typescript
// Add to "Scope & Executor" describe block, under "provide()"

describe("Sucrose integration", () => {
  it("provide() stores Sucrose metadata", () => {
    const counter = provide(() => 0)
    const meta = getMetadata(counter)
    expect(meta).toBeDefined()
    expect(meta?.inference.dependencyShape).toBe("none")
  })

  it("derive() with array deps stores correct metadata", () => {
    const dep = provide(() => "dep")
    const derived = derive([dep], ([d], ctl) => d.toUpperCase())
    const meta = getMetadata(derived)
    expect(meta).toBeDefined()
    expect(meta?.inference.dependencyShape).toBe("array")
  })

  it("derive() with record deps stores correct metadata", () => {
    const dep = provide(() => "dep")
    const derived = derive({ d: dep }, ({ d }, ctl) => d.toUpperCase())
    const meta = getMetadata(derived)
    expect(meta).toBeDefined()
    expect(meta?.inference.dependencyShape).toBe("record")
  })

  it("derive() with single dep stores correct metadata", () => {
    const dep = provide(() => "dep")
    const derived = derive(dep, (d, ctl) => d.toUpperCase())
    const meta = getMetadata(derived)
    expect(meta).toBeDefined()
    expect(meta?.inference.dependencyShape).toBe("single")
  })

  it("metadata includes name tag when provided", () => {
    const named = provide(() => "value", name("myService"))
    const meta = getMetadata(named)
    expect(meta?.name).toBe("myService")
  })

  it("compiled function executes correctly", async () => {
    const counter = provide(() => 42)
    const meta = getMetadata(counter)
    expect(meta?.compiled(undefined, {})).toBe(42)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "Sucrose integration"`
Expected: FAIL (metadata not being stored)

**Step 3: Modify createExecutor to call compile**

```typescript
// Modify packages/next/src/executor.ts

import { Core, executorSymbol, type Escapable } from "./types";
import type { Tag } from "./tag";
import { compile, type Sucrose } from "./sucrose";

function getDependencyShape(
  dependencies: undefined | Core.UExecutor | ReadonlyArray<Core.UExecutor> | Record<string, Core.UExecutor>
): Sucrose.DependencyShape {
  if (dependencies === undefined) return "none"
  if (Array.isArray(dependencies)) return "array"
  if (typeof dependencies === "object" && !("factory" in dependencies)) return "record"
  return "single"
}

export function createExecutor<T>(
  factory: Core.NoDependencyFn<T> | Core.DependentFn<T, unknown>,
  dependencies:
    | undefined
    | Core.UExecutor
    | ReadonlyArray<Core.UExecutor>
    | Record<string, Core.UExecutor>,
  tags: Tag.Tagged[] | undefined
): Core.Executor<T> {
  const dependencyShape = getDependencyShape(dependencies)

  const executor = {
    [executorSymbol]: "main",
    factory: (_: unknown, controller: Core.Controller) => {
      if (dependencies === undefined) {
        const f = factory as Core.NoDependencyFn<T>;
        return f(controller);
      }

      const f = factory as Core.DependentFn<T, unknown>;
      return f(_, controller);
    },
    dependencies,
    tags: tags,
  } as unknown as Core.Executor<T>;

  compile(factory, dependencyShape, executor, tags)

  const lazyExecutor = {
    [executorSymbol]: "lazy",
    dependencies: undefined,
    executor,
    factory: undefined,
    tags: tags,
  } satisfies Core.Lazy<T>;

  const reactiveExecutor = {
    [executorSymbol]: "reactive",
    executor,
    factory: undefined,
    dependencies: undefined,
    tags: tags,
  } satisfies Core.Reactive<T>;

  const staticExecutor = {
    [executorSymbol]: "static",
    dependencies: undefined,
    factory: undefined,
    tags: tags,
    executor,
  } satisfies Core.Static<T>;

  Object.defineProperties(executor, {
    lazy: {
      value: lazyExecutor,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    reactive: {
      value: reactiveExecutor,
      writable: false,
      configurable: false,
      enumerable: false,
    },
    static: {
      value: staticExecutor,
      writable: false,
      configurable: false,
      enumerable: false,
    },
  });

  return executor;
}

// ... rest of file unchanged
```

**Step 4: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "Sucrose integration"`
Expected: PASS

**Step 5: Run all tests to ensure no regressions**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/next/src/executor.ts packages/next/tests/index.test.ts
git commit -m "feat(sucrose): integrate static analysis into createExecutor"
```

---

## Task 8: Add callSite to Error Context

**Files:**
- Modify: `packages/next/src/errors.ts`
- Test: `packages/next/tests/index.test.ts`

**Step 1: Write failing tests for error enrichment**

```typescript
// Add to "Error Classes" describe block

describe("callSite enrichment", () => {
  it("FactoryExecutionError includes callSite when available", () => {
    const callSite = "at myFunction (file.ts:10:5)"
    const error = createFactoryErrorWithCallSite("myExec", ["root", "myExec"], new Error("fail"), callSite)
    expect(error.callSite).toBe(callSite)
  })

  it("errors from executor resolution include callSite from metadata", async () => {
    const failingExec = provide(() => {
      throw new Error("intentional")
    }, name("failingService"))

    const scope = createScope()
    try {
      await scope.resolve(failingExec)
      expect.fail("Should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(FactoryExecutionError)
      const err = e as FactoryExecutionError
      expect(err.callSite).toBeDefined()
      expect(err.callSite).toContain(".ts:")
    }
    await scope.dispose()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "callSite enrichment"`
Expected: FAIL with "callSite" property not defined

**Step 3: Add callSite to error classes**

```typescript
// Modify packages/next/src/errors.ts

export class FactoryExecutionError extends Error {
  static readonly CODE = "F001"
  readonly code: typeof FactoryExecutionError.CODE = FactoryExecutionError.CODE
  readonly executorName: string
  readonly dependencyChain: string[]
  readonly callSite?: string

  constructor(message: string, executorName: string, dependencyChain: string[], cause?: unknown, callSite?: string) {
    super(message, { cause })
    this.name = "FactoryExecutionError"
    this.executorName = executorName
    this.dependencyChain = dependencyChain
    this.callSite = callSite
  }
}

export class DependencyResolutionError extends Error {
  static readonly CODE = "D001"
  readonly code: typeof DependencyResolutionError.CODE = DependencyResolutionError.CODE
  readonly executorName: string
  readonly dependencyChain: string[]
  readonly missingDependency?: string
  readonly callSite?: string

  constructor(message: string, executorName: string, dependencyChain: string[], missingDependency?: string, cause?: unknown, callSite?: string) {
    super(message, { cause })
    this.name = "DependencyResolutionError"
    this.executorName = executorName
    this.dependencyChain = dependencyChain
    this.missingDependency = missingDependency
    this.callSite = callSite
  }
}

export class ExecutorResolutionError extends Error {
  static readonly CODE = "E001"
  readonly code: typeof ExecutorResolutionError.CODE = ExecutorResolutionError.CODE
  readonly executorName: string
  readonly dependencyChain: string[]
  readonly callSite?: string

  constructor(message: string, executorName: string, dependencyChain: string[], cause?: unknown, callSite?: string) {
    super(message, { cause })
    this.name = "ExecutorResolutionError"
    this.executorName = executorName
    this.dependencyChain = dependencyChain
    this.callSite = callSite
  }
}

export function createFactoryError(
  executorName: string,
  dependencyChain: string[],
  cause: unknown,
  callSite?: string
): FactoryExecutionError {
  const causeMsg = cause instanceof Error ? cause.message : String(cause)
  return new FactoryExecutionError(
    `Factory failed for "${executorName}": ${causeMsg}`,
    executorName,
    dependencyChain,
    cause,
    callSite
  )
}

export function createDependencyError(
  executorName: string,
  dependencyChain: string[],
  missingDependency?: string,
  cause?: unknown,
  callSite?: string
): DependencyResolutionError {
  const msg = missingDependency
    ? `Dependency "${missingDependency}" not found for "${executorName}"`
    : `Dependency resolution failed for "${executorName}"`
  return new DependencyResolutionError(msg, executorName, dependencyChain, missingDependency, cause, callSite)
}

export function createSystemError(
  executorName: string,
  dependencyChain: string[],
  cause?: unknown,
  callSite?: string
): ExecutorResolutionError {
  const causeMsg = cause instanceof Error ? cause.message : String(cause)
  return new ExecutorResolutionError(
    `System error for "${executorName}": ${causeMsg}`,
    executorName,
    dependencyChain,
    cause,
    callSite
  )
}
```

**Step 4: Update scope.ts to pass callSite from metadata**

In `packages/next/src/scope.ts`, in the `executeFactory` method of `AccessorImpl`, update error creation to include callSite:

```typescript
// In AccessorImpl.executeFactory, update the catch blocks to use callSite
import { getMetadata } from "./sucrose"

// In the error handling sections, get callSite from metadata:
const meta = getMetadata(this.requestor)
const callSite = meta?.callSite

throw errors.createFactoryError(
  executorName,
  dependencyChain,
  asyncError,
  callSite
);
```

**Step 5: Run test to verify it passes**

Run: `pnpm -F @pumped-fn/core-next test -- --grep "callSite enrichment"`
Expected: PASS

**Step 6: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All PASS

**Step 7: Commit**

```bash
git add packages/next/src/errors.ts packages/next/src/scope.ts packages/next/tests/index.test.ts
git commit -m "feat(sucrose): add callSite to error classes for debugging"
```

---

## Task 9: Final Verification and Cleanup

**Files:**
- All modified files

**Step 1: Run full typecheck**

Run: `pnpm -F @pumped-fn/core-next typecheck:full`
Expected: PASS with no errors

**Step 2: Run all tests**

Run: `pnpm -F @pumped-fn/core-next test`
Expected: All tests PASS

**Step 3: Run examples typecheck**

Run: `pnpm -F @pumped-fn/examples typecheck`
Expected: PASS

**Step 4: Verify no `any` types**

Run: `grep -r "any" packages/next/src/sucrose.ts`
Expected: No results (or only in comments)

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(sucrose): complete ADR-002 static analysis implementation

- Add Sucrose namespace with Inference and Metadata types
- Implement separateFunction for parsing arrow functions
- Implement analyze for detecting factory usage patterns
- Implement generate for JIT code compilation via new Function()
- Add captureCallSite for debugging support
- Integrate Sucrose into createExecutor (provide/derive)
- Add callSite to error classes for better debugging
- All existing tests pass (backward compatible)

Implements: ADR-002-static-analysis-code-generation"
```

---

## Verification Checklist (from ADR-002)

After completing all tasks, verify:

- [ ] `provide()` analyzes factory and generates compiled function
- [ ] `derive()` handles all dependency shapes (single, array, record)
- [ ] Analysis correctly detects: async, usesCleanup, usesRelease, usesReload, usesScope
- [ ] Generated code has `//# sourceURL` comment
- [ ] Call site captured at creation time
- [ ] Original factory preserved and accessible
- [ ] Error enrichment includes `name` tag value
- [ ] Error enrichment includes `callSite`
- [ ] Generated functions are testable in isolation
- [ ] Existing tests continue to pass (backward compatible)
