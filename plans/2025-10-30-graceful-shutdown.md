# Graceful Shutdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement extension-based graceful shutdown using AbortController for hierarchical cancellation

**Architecture:** CancellationExtension manages AbortController lifecycle, injects signal into controller, wraps operations to check abort state, cascades abort from parent to children

**Tech Stack:** TypeScript, AbortController/AbortSignal (native Web API), vitest

---

## Task 1: AbortError Class

**Files:**
- Modify: `packages/next/src/errors.ts` (add AbortError after existing error classes)
- Test: `packages/next/tests/cancellation.test.ts` (create new file)

**Step 1: Write failing test for AbortError**

Create `packages/next/tests/cancellation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { AbortError } from "../src/errors";

describe("AbortError", () => {
  it("creates error with reason", () => {
    const reason = "User requested";
    const error = new AbortError(reason);

    expect(error.name).toBe("AbortError");
    expect(error.message).toBe("Operation aborted");
    expect(error.cause).toBe(reason);
  });

  it("creates error without reason", () => {
    const error = new AbortError();

    expect(error.name).toBe("AbortError");
    expect(error.message).toBe("Operation aborted");
    expect(error.cause).toBeUndefined();
  });
});
```

**Step 2: Run test to verify failure**

```bash
pnpm -F @pumped-fn/core-next test cancellation
```

Expected: FAIL with "Cannot find module '../src/errors' or its corresponding type declarations"

**Step 3: Implement AbortError**

Add to `packages/next/src/errors.ts` after existing error classes:

```typescript
export class AbortError extends Error {
  constructor(reason?: unknown) {
    super("Operation aborted");
    this.name = "AbortError";
    this.cause = reason;
  }
}
```

**Step 4: Run test to verify pass**

```bash
pnpm -F @pumped-fn/core-next test cancellation
```

Expected: PASS (2 tests)

**Step 5: Verify types**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: No errors

**Step 6: Commit**

```bash
git add packages/next/src/errors.ts packages/next/tests/cancellation.test.ts
git commit -m "feat: add AbortError for graceful shutdown"
```

---

## Task 2: Controller Signal Type Extension

**Files:**
- Modify: `packages/next/src/types.ts:166-171` (add signal to Controller type)
- Test: `packages/next/tests/cancellation.test.ts` (add type test)

**Step 1: Write type test**

Add to `packages/next/tests/cancellation.test.ts`:

```typescript
import { type Core } from "../src/types";

describe("Controller signal type", () => {
  it("accepts controller with signal", () => {
    const controller: Core.Controller = {
      cleanup: () => {},
      release: () => null as any,
      reload: () => null as any,
      scope: null as any,
      signal: new AbortController().signal,
    };

    expect(controller.signal).toBeDefined();
  });

  it("accepts controller without signal", () => {
    const controller: Core.Controller = {
      cleanup: () => {},
      release: () => null as any,
      reload: () => null as any,
      scope: null as any,
    };

    expect(controller.signal).toBeUndefined();
  });
});
```

**Step 2: Run test to verify failure**

```bash
pnpm -F @pumped-fn/core-next typecheck:full
```

Expected: Type error "Object literal may only specify known properties, and 'signal' does not exist in type 'Controller'"

**Step 3: Add signal to Controller type**

Modify `packages/next/src/types.ts` at line 166:

```typescript
export type Controller = {
  cleanup: (cleanup: Cleanup) => void;
  release: () => Promised<void>;
  reload: () => Promised<void>;
  scope: Scope;
  signal?: AbortSignal;
};
```

**Step 4: Verify types pass**

```bash
pnpm -F @pumped-fn/core-next typecheck:full
```

Expected: No errors

**Step 5: Run tests**

```bash
pnpm -F @pumped-fn/core-next test cancellation
```

Expected: PASS (4 tests)

**Step 6: Commit**

```bash
git add packages/next/src/types.ts packages/next/tests/cancellation.test.ts
git commit -m "feat: add optional signal to Controller type"
```

---

## Task 3: CancellationExtension Structure

**Files:**
- Create: `packages/next/src/cancellation.ts`
- Test: `packages/next/tests/cancellation.test.ts` (add extension creation tests)

**Step 1: Write failing test for extension creation**

Add to `packages/next/tests/cancellation.test.ts`:

```typescript
import { createCancellationExtension } from "../src/cancellation";

describe("createCancellationExtension", () => {
  it("creates extension without parent signal", () => {
    const ext = createCancellationExtension();

    expect(ext.name).toBe("cancellation");
    expect(ext.controller).toBeInstanceOf(AbortController);
    expect(ext.controller.signal.aborted).toBe(false);
  });

  it("creates extension with parent signal", () => {
    const parent = new AbortController();
    const ext = createCancellationExtension(parent.signal);

    expect(ext.controller).toBeInstanceOf(AbortController);
    expect(ext.controller.signal.aborted).toBe(false);
  });

  it("aborts when parent aborts", () => {
    const parent = new AbortController();
    const ext = createCancellationExtension(parent.signal);

    parent.abort("test reason");

    expect(ext.controller.signal.aborted).toBe(true);
    expect(ext.controller.signal.reason).toBe("test reason");
  });
});
```

**Step 2: Run test to verify failure**

```bash
pnpm -F @pumped-fn/core-next test cancellation
```

Expected: FAIL with "Cannot find module '../src/cancellation'"

**Step 3: Implement extension structure**

Create `packages/next/src/cancellation.ts`:

```typescript
import { type Extension } from "./types";

export interface CancellationExtension extends Extension.Extension {
  controller: AbortController;
}

export function createCancellationExtension(
  parentSignal?: AbortSignal
): CancellationExtension {
  const controller = new AbortController();

  if (parentSignal) {
    parentSignal.addEventListener("abort", () => {
      controller.abort(parentSignal.reason);
    });
  }

  return {
    name: "cancellation",
    controller,
  };
}
```

**Step 4: Run test to verify pass**

```bash
pnpm -F @pumped-fn/core-next test cancellation
```

Expected: PASS (7 tests)

**Step 5: Verify types**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: No errors

**Step 6: Commit**

```bash
git add packages/next/src/cancellation.ts packages/next/tests/cancellation.test.ts
git commit -m "feat: add CancellationExtension structure with parent linking"
```

---

## Task 4: Extension Wrap Implementation

**Files:**
- Modify: `packages/next/src/cancellation.ts` (add wrap method)
- Modify: `packages/next/src/scope.ts:382-394` (inject signal in createController)
- Test: `packages/next/tests/cancellation.test.ts` (add wrap tests)

**Step 1: Write failing test for wrap behavior**

Add to `packages/next/tests/cancellation.test.ts`:

```typescript
import { createScope } from "../src/scope";
import { provide } from "../src";
import { Promised } from "../src/promises";

describe("Extension wrap", () => {
  it("rejects new operations after abort", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    const executor = provide(() => () => "value");

    ext.controller.abort("shutdown");

    await expect(scope.resolve(executor).toPromise()).rejects.toThrow(
      AbortError
    );
    await expect(scope.resolve(executor).toPromise()).rejects.toThrow(
      "Operation aborted"
    );
  });

  it("allows in-flight operations to complete", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    let resolveOp: (value: string) => void;
    const operationPromise = new Promise<string>((resolve) => {
      resolveOp = resolve;
    });

    const executor = provide(() => () => operationPromise);

    const resolution = scope.resolve(executor);

    ext.controller.abort("shutdown");

    resolveOp!("completed");

    const result = await resolution.toPromise();
    expect(result).toBe("completed");
  });
});
```

**Step 2: Run test to verify failure**

```bash
pnpm -F @pumped-fn/core-next test cancellation
```

Expected: FAIL with timeout or no rejection

**Step 3: Implement wrap method**

Modify `packages/next/src/cancellation.ts`:

```typescript
import { type Extension, type Core } from "./types";
import { Promised } from "./promises";
import { AbortError } from "./errors";

export interface CancellationExtension extends Extension.Extension {
  controller: AbortController;
  aborted: boolean;
}

export function createCancellationExtension(
  parentSignal?: AbortSignal
): CancellationExtension {
  const controller = new AbortController();
  let aborted = false;

  if (parentSignal) {
    parentSignal.addEventListener("abort", () => {
      controller.abort(parentSignal.reason);
      aborted = true;
    });
  }

  controller.signal.addEventListener("abort", () => {
    aborted = true;
  });

  return {
    name: "cancellation",
    controller,
    aborted: false,

    wrap<T>(
      scope: Core.Scope,
      next: () => Promised<T>,
      operation: Extension.Operation
    ): Promised<T> {
      if (aborted || controller.signal.aborted) {
        return Promised.reject(new AbortError(controller.signal.reason));
      }

      return next();
    },
  };
}
```

**Step 4: Modify scope to inject signal**

Modify `packages/next/src/scope.ts` at line 382 (createController method):

```typescript
private createController(): Core.Controller {
  const baseController: Core.Controller = {
    cleanup: (cleanup: Core.Cleanup) => {
      const state = this.scope["getOrCreateState"](this.requestor);
      const cleanups = this.scope["ensureCleanups"](state);
      cleanups.add(cleanup);
    },
    release: () => this.scope.release(this.requestor),
    reload: () =>
      this.scope.resolve(this.requestor, true).map(() => undefined),
    scope: this.scope,
  };

  for (const ext of this.scope["extensions"]) {
    if (ext.name === "cancellation" && "controller" in ext) {
      baseController.signal = (ext as any).controller.signal;
    }
  }

  return baseController;
}
```

**Step 5: Run test to verify pass**

```bash
pnpm -F @pumped-fn/core-next test cancellation
```

Expected: PASS (9 tests)

**Step 6: Verify types**

```bash
pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full
```

Expected: No errors

**Step 7: Commit**

```bash
git add packages/next/src/cancellation.ts packages/next/src/scope.ts packages/next/tests/cancellation.test.ts
git commit -m "feat: implement wrap method to reject operations after abort"
```

---

## Task 5: Extension Dispose Integration

**Files:**
- Modify: `packages/next/src/cancellation.ts` (add dispose method)
- Test: `packages/next/tests/cancellation.test.ts` (add dispose tests)

**Step 1: Write failing test for dispose**

Add to `packages/next/tests/cancellation.test.ts`:

```typescript
describe("Extension dispose", () => {
  it("aborts controller when scope disposes", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    await scope.dispose().toPromise();

    expect(ext.controller.signal.aborted).toBe(true);
    expect(ext.controller.signal.reason).toBe("Scope disposed");
  });

  it("does not abort twice", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    ext.controller.abort("manual");
    await scope.dispose().toPromise();

    expect(ext.controller.signal.reason).toBe("manual");
  });
});
```

**Step 2: Run test to verify failure**

```bash
pnpm -F @pumped-fn/core-next test cancellation
```

Expected: FAIL with "expected false to be true"

**Step 3: Implement dispose method**

Modify `packages/next/src/cancellation.ts`:

```typescript
export function createCancellationExtension(
  parentSignal?: AbortSignal
): CancellationExtension {
  const controller = new AbortController();
  let aborted = false;

  if (parentSignal) {
    parentSignal.addEventListener("abort", () => {
      controller.abort(parentSignal.reason);
      aborted = true;
    });
  }

  controller.signal.addEventListener("abort", () => {
    aborted = true;
  });

  return {
    name: "cancellation",
    controller,
    get aborted() {
      return aborted;
    },

    wrap<T>(
      scope: Core.Scope,
      next: () => Promised<T>,
      operation: Extension.Operation
    ): Promised<T> {
      if (aborted || controller.signal.aborted) {
        return Promised.reject(new AbortError(controller.signal.reason));
      }

      return next();
    },

    dispose(scope: Core.Scope): void {
      if (!aborted && !controller.signal.aborted) {
        controller.abort("Scope disposed");
        aborted = true;
      }
    },
  };
}
```

**Step 4: Run test to verify pass**

```bash
pnpm -F @pumped-fn/core-next test cancellation
```

Expected: PASS (11 tests)

**Step 5: Verify types**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: No errors

**Step 6: Commit**

```bash
git add packages/next/src/cancellation.ts packages/next/tests/cancellation.test.ts
git commit -m "feat: abort controller on scope disposal"
```

---

## Task 6: Factory Signal Integration Test

**Files:**
- Test: `packages/next/tests/cancellation.test.ts` (add factory integration tests)

**Step 1: Write test for factory signal access**

Add to `packages/next/tests/cancellation.test.ts`:

```typescript
describe("Factory signal integration", () => {
  it("provides signal to factory", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    let receivedSignal: AbortSignal | undefined;
    const executor = provide(() => (controller) => {
      receivedSignal = controller.signal;
      return "value";
    });

    await scope.resolve(executor).toPromise();

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBe(ext.controller.signal);
  });

  it("factory can check abort state", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    let wasAborted = false;
    const executor = provide(() => (controller) => {
      wasAborted = controller.signal?.aborted || false;
      return "value";
    });

    ext.controller.abort();

    await expect(scope.resolve(executor).toPromise()).rejects.toThrow(
      AbortError
    );
    expect(wasAborted).toBe(false);
  });

  it("factory can listen to abort events", async () => {
    const ext = createCancellationExtension();
    const scope = createScope({ extensions: [ext] });

    let aborted = false;
    const executor = provide(() => (controller) => {
      controller.signal?.addEventListener("abort", () => {
        aborted = true;
      });

      return new Promise((resolve) => {
        setTimeout(() => resolve("value"), 100);
      });
    });

    const resolution = scope.resolve(executor);

    setTimeout(() => ext.controller.abort(), 10);

    await resolution.toPromise();

    expect(aborted).toBe(true);
  });
});
```

**Step 2: Run test to verify pass**

```bash
pnpm -F @pumped-fn/core-next test cancellation
```

Expected: PASS (14 tests)

**Step 3: Commit**

```bash
git add packages/next/tests/cancellation.test.ts
git commit -m "test: verify factory signal integration"
```

---

## Task 7: Export Cancellation API

**Files:**
- Modify: `packages/next/src/index.ts` (add exports)

**Step 1: Add exports**

Add to `packages/next/src/index.ts`:

```typescript
export {
  createCancellationExtension,
  type CancellationExtension,
} from "./cancellation";
export { AbortError } from "./errors";
```

**Step 2: Verify types**

```bash
pnpm -F @pumped-fn/core-next typecheck
```

Expected: No errors

**Step 3: Verify all tests pass**

```bash
pnpm -F @pumped-fn/core-next test
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add packages/next/src/index.ts
git commit -m "feat: export cancellation API"
```

---

## Task 8: Add HTTP Server Example

**Files:**
- Create: `examples/http-server/graceful-shutdown.ts`

**Step 1: Create example**

Create `examples/http-server/graceful-shutdown.ts`:

```typescript
import { createScope, provide, createCancellationExtension } from "@pumped-fn/core-next";

const appScope = createScope({
  extensions: [createCancellationExtension()],
});

const dbConnection = provide(() => (controller) => {
  console.log("Opening database connection");

  controller.signal?.addEventListener("abort", () => {
    console.log("Closing database connection");
  });

  controller.cleanup(() => {
    console.log("Cleanup: database connection");
  });

  return { query: (sql: string) => console.log("Query:", sql) };
});

const requestHandler = provide(dbConnection, (db, controller) => {
  if (controller.signal?.aborted) {
    return { status: 503, body: "Service shutting down" };
  }

  db.query("SELECT * FROM users");

  return { status: 200, body: "OK" };
});

async function handleRequest() {
  const result = await appScope.resolve(requestHandler).toPromise();
  console.log("Response:", result);
}

process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, initiating graceful shutdown");

  const ext = appScope["extensions"].find(
    (e) => e.name === "cancellation"
  ) as any;

  if (ext) {
    ext.controller.abort("SIGTERM");
  }

  setTimeout(async () => {
    await appScope.dispose().toPromise();
    console.log("Shutdown complete");
    process.exit(0);
  }, 5000);
});

handleRequest();

setTimeout(() => {
  console.log("\nSimulating shutdown...");
  process.emit("SIGTERM" as any);
}, 1000);
```

**Step 2: Verify example typechecks**

```bash
pnpm -F @pumped-fn/examples typecheck
```

Expected: No errors

**Step 3: Commit**

```bash
git add examples/http-server/graceful-shutdown.ts
git commit -m "docs: add graceful shutdown HTTP server example"
```

---

## Task 9: Update Guide Documentation

**Files:**
- Modify: `docs/guides/03-scope-lifecycle.md` (add graceful shutdown section)

**Step 1: Add graceful shutdown section**

Add to `docs/guides/03-scope-lifecycle.md` after disposal section:

```markdown
## Graceful Shutdown

The `CancellationExtension` provides graceful shutdown capabilities using `AbortController`:

```typescript
import { createScope, createCancellationExtension } from "@pumped-fn/core-next";

const appScope = createScope({
  extensions: [createCancellationExtension()],
});
```

### Signal Propagation

Parent scope abort cascades to children:

```typescript
const parent = createScope({
  extensions: [createCancellationExtension()],
});

const child = createScope({
  extensions: [createCancellationExtension(parent.signal)],
});

parent.extensions[0].controller.abort();
```

### Factory Cancellation

Factories access signal via controller:

```typescript
const worker = provide(() => (controller) => {
  controller.signal?.addEventListener("abort", () => {
    // Clean cancellation
  });

  if (controller.signal?.aborted) {
    throw new AbortError();
  }

  return performWork();
});
```

### Process Signal Integration

```typescript
process.on("SIGTERM", async () => {
  const ext = scope.extensions.find(e => e.name === "cancellation");
  ext?.controller.abort("SIGTERM");

  await scope.dispose().toPromise();
});
```
```

**Step 2: Commit**

```bash
git add docs/guides/03-scope-lifecycle.md
git commit -m "docs: add graceful shutdown to lifecycle guide"
```

---

## Task 10: Update Skill Documentation

**Files:**
- Modify: `.claude/skills/pumped-fn/SKILL.md` (add cancellation patterns)

**Step 1: Add cancellation section**

Add to `.claude/skills/pumped-fn/SKILL.md` in appropriate location (after scope lifecycle section):

```markdown
## Graceful Shutdown Pattern

**When to use:** HTTP servers, CLI apps, background jobs requiring clean shutdown

**API:** `createCancellationExtension(parentSignal?: AbortSignal)`

### Extension Setup

```typescript
import { createScope, createCancellationExtension } from "@pumped-fn/core-next";

const scope = createScope({
  extensions: [createCancellationExtension()],
});
```

### Factory Cancellation

```typescript
const worker = provide(() => (controller) => {
  controller.signal?.addEventListener("abort", () => {
    // Cancel work
  });

  if (controller.signal?.aborted) {
    throw new AbortError();
  }

  return work();
});
```

### Hierarchical Cancellation

```typescript
const parent = createScope({
  extensions: [createCancellationExtension()],
});

const child = createScope({
  extensions: [createCancellationExtension(parent.signal)],
});
```

### Properties

- Parent abort cascades to children automatically
- Complete in-flight operations, reject new operations
- Factories opt-in via `controller.signal`
- Automatic disposal integration
```

**Step 2: Commit**

```bash
git add .claude/skills/pumped-fn/SKILL.md
git commit -m "docs: add graceful shutdown pattern to skill"
```

---

## Task 11: Final Verification

**Step 1: Run all tests**

```bash
pnpm -F @pumped-fn/core-next test
```

Expected: All tests pass

**Step 2: Verify all typechecks**

```bash
pnpm -F @pumped-fn/core-next typecheck && pnpm -F @pumped-fn/core-next typecheck:full
```

Expected: No errors

**Step 3: Verify examples typecheck**

```bash
pnpm -F @pumped-fn/examples typecheck
```

Expected: No errors

**Step 4: Build**

```bash
pnpm -F @pumped-fn/core-next build
```

Expected: Build succeeds

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete graceful shutdown implementation

- Add AbortError for operation cancellation
- Implement CancellationExtension with AbortController
- Add signal to Controller type for factory access
- Support parent-child signal propagation
- Integrate with scope disposal
- Add HTTP server example
- Update documentation and skill"
```

---

## Verification Checklist

- [ ] All 14+ tests passing
- [ ] No TypeScript errors in src
- [ ] No TypeScript errors in tests
- [ ] Examples typecheck
- [ ] Build succeeds
- [ ] Documentation updated
- [ ] Skill updated
- [ ] Example demonstrates usage
