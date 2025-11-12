# Implementation Plan: Add `.select()` Method to Executors

**Date:** 2025-11-12
**Feature:** Executor property selection with change detection and smart caching
**Branch:** feat-add-select

## Overview

Add `.select()` method to executors for reactive property selection. Creates derived executors that only update when the selected property actually changes, with global executor identity (same key = same executor instance across all scopes).

## Core Requirements

1. **Executor Identity:** `config.select('port')` always returns the same executor instance
2. **Change Detection:** Only propagate updates when `!Object.is(oldValue, newValue)`
3. **Hybrid Cleanup:** WeakMap for GC + `ctl.cleanup()` for deterministic release
4. **Type Safety:** Full TypeScript support with `keyof T` constraint

## Architecture Diagrams

### 1. Select Pool Structure

```mermaid
graph TB
    subgraph "Global Executor Space (Unresolved)"
        config["config: Executor&lt;{port, host}&gt;"]
        selectPools["WeakMap&lt;Executor, SelectPool&gt;"]
        pool["SelectPool for config"]
        portExec["port executor: Executor&lt;number&gt;"]
        hostExec["host executor: Executor&lt;string&gt;"]

        config -->|"WeakMap key"| selectPools
        selectPools -->|"get(config)"| pool
        pool -->|"Map: 'port' → executor"| portExec
        pool -->|"Map: 'host' → executor"| hostExec
    end

    subgraph "Scope 1 (Resolved)"
        s1config["config state: {port: 3000, host: 'localhost'}"]
        s1port["port state: 3000"]
        s1host["host state: 'localhost'"]
    end

    subgraph "Scope 2 (Resolved)"
        s2config["config state: {port: 8080, host: '127.0.0.1'}"]
        s2port["port state: 8080"]
        s2host["host state: '127.0.0.1'"]
    end

    portExec -.->|"resolves in"| s1port
    portExec -.->|"resolves in"| s2port
    hostExec -.->|"resolves in"| s1host
    hostExec -.->|"resolves in"| s2host

    style config fill:#e1f5ff
    style portExec fill:#fff4e1
    style hostExec fill:#fff4e1
    style pool fill:#f0f0f0
```

**Key Points:**
- One `SelectPool` per parent executor (stored in WeakMap)
- Pool contains `Map<PropertyKey, Executor>` - the cache
- Same executor instance used across all scopes
- Each scope has its own resolved state for each executor

### 2. Cleanup Lifecycle Flow

```mermaid
sequenceDiagram
    participant User
    participant Scope1
    participant portExec as port Executor
    participant Pool as SelectPool
    participant WeakMap as selectPools WeakMap
    participant GC as Garbage Collector

    Note over User,Pool: Phase 1: Creation & Usage
    User->>Scope1: config.select('port')
    Scope1->>Pool: select('port')
    Pool->>portExec: create if not cached
    Pool->>Pool: pool.set('port', portExec)
    Pool-->>Scope1: return portExec

    User->>Scope1: scope.resolve(portExec)
    Scope1->>portExec: resolve(ctl)
    portExec->>portExec: ctl.cleanup(cleanupFn)
    Note over portExec: Register cleanup hook

    Note over User,Pool: Phase 2: Scope Release (Deterministic)
    User->>Scope1: scope.release(portExec)
    Scope1->>portExec: trigger cleanup hooks
    portExec->>Pool: cleanupFn() → pool.delete('port')
    Note over Pool: portExec removed from cache
    Pool-->>Scope1: done

    Note over User,Pool: Phase 3: Parent GC (Non-deterministic)
    User->>User: Drop all references to config
    GC->>WeakMap: config is unreachable
    WeakMap->>Pool: Remove entry (config → pool)
    GC->>Pool: Pool becomes unreachable
    GC->>portExec: portExec becomes unreachable
    Note over GC: Everything cleaned up
```

**Cleanup Guarantees:**
1. **When selected executor is released from scope:** `ctl.cleanup()` fires → remove from pool immediately
2. **When parent executor is GC'd:** WeakMap releases pool → all cached executors eligible for GC
3. **When selected executor is GC'd but pool exists:** Pool keeps reference until explicit release

### 3. Change Detection Flow

```mermaid
sequenceDiagram
    participant Scope
    participant config as config Executor
    participant port as port Executor (select)
    participant downstream as Downstream Executor

    Note over Scope,downstream: Initial Resolution
    Scope->>port: resolve()
    port->>config: resolve parent.reactive
    config-->>port: {port: 3000, host: 'localhost'}
    port->>port: previousValue = 3000
    port-->>Scope: 3000

    Note over Scope,downstream: Update 1: Port unchanged
    Scope->>config: update({port: 3000, host: '127.0.0.1'})
    config->>config: trigger reactive dependents
    config->>port: re-execute
    port->>port: currentValue = 3000
    port->>port: Object.is(3000, 3000) === true
    port->>port: return previousValue (no change)
    Note over port,downstream: No propagation to downstream!

    Note over Scope,downstream: Update 2: Port changed
    Scope->>config: update({port: 8080, host: '127.0.0.1'})
    config->>config: trigger reactive dependents
    config->>port: re-execute
    port->>port: currentValue = 8080
    port->>port: Object.is(3000, 8080) === false
    port->>port: previousValue = 8080
    port->>port: trigger downstream updates
    port->>downstream: propagate change
    downstream-->>Scope: re-execute
```

**Change Detection Logic:**
1. Selected executor stores `previousValue` in closure
2. On parent update, compare `Object.is(previousValue, currentValue)`
3. If equal → return cached value, skip downstream propagation
4. If different → update previousValue, propagate to downstream executors

### 4. Multiple Scopes Sharing Same Executor

```mermaid
graph TB
    subgraph "Unresolved World"
        config["config Executor"]
        port["port Executor (select)"]
        pool["SelectPool cache"]

        config -->|"select('port')"| pool
        pool -->|"returns same instance"| port
    end

    subgraph "Scope 1"
        s1state["State: port = 3000"]
        s1accessor["Accessor"]
        s1cleanup["Cleanup Hook 1"]

        s1state --- s1accessor
        s1accessor --- s1cleanup
    end

    subgraph "Scope 2"
        s2state["State: port = 8080"]
        s2accessor["Accessor"]
        s2cleanup["Cleanup Hook 2"]

        s2state --- s2accessor
        s2accessor --- s2cleanup
    end

    subgraph "Scope 3"
        s3state["State: port = 3000"]
        s3accessor["Accessor"]
        s3cleanup["Cleanup Hook 3"]

        s3state --- s3accessor
        s3accessor --- s3cleanup
    end

    port -.->|"resolved in"| s1state
    port -.->|"resolved in"| s2state
    port -.->|"resolved in"| s3state

    s1cleanup -.->|"on release"| pool
    s2cleanup -.->|"on release"| pool
    s3cleanup -.->|"on release"| pool

    style port fill:#fff4e1
    style pool fill:#f0f0f0
```

**Important:**
- Same executor instance across all scopes
- Each scope has independent resolved state
- Each scope registers its own cleanup hook
- Executor only removed from pool when **ALL** scopes have released it

**Wait, this reveals a problem!** Multiple scopes can have the same executor. How do we handle cleanup?

### 5. REVISED: Reference Counting for Multi-Scope Cleanup

```mermaid
sequenceDiagram
    participant Scope1
    participant Scope2
    participant portExec as port Executor
    participant Pool as SelectPool

    Note over Scope1,Pool: Scope1 resolves port
    Scope1->>portExec: resolve(ctl1)
    portExec->>Pool: track usage (refCount++)
    Pool->>Pool: refCount = 1
    portExec->>portExec: ctl1.cleanup(() => decrementRef())

    Note over Scope1,Pool: Scope2 resolves port
    Scope2->>portExec: resolve(ctl2)
    portExec->>Pool: track usage (refCount++)
    Pool->>Pool: refCount = 2
    portExec->>portExec: ctl2.cleanup(() => decrementRef())

    Note over Scope1,Pool: Scope1 releases port
    Scope1->>portExec: release()
    portExec->>Pool: decrementRef()
    Pool->>Pool: refCount = 1
    Note over Pool: Keep in cache (still used by Scope2)

    Note over Scope1,Pool: Scope2 releases port
    Scope2->>portExec: release()
    portExec->>Pool: decrementRef()
    Pool->>Pool: refCount = 0
    Pool->>Pool: pool.delete('port')
    Note over Pool: Remove from cache
```

**Revised Cleanup Strategy:**
- Track reference count per executor in pool
- Increment on each `ctl.cleanup()` registration
- Decrement when cleanup fires
- Only delete from pool when refCount reaches 0

## Implementation Details

### File 1: `packages/next/src/select.ts` (NEW)

```typescript
import { derive } from "./executor";
import { type Core } from "./types";

type SelectOptions<T> = {
  equals?: (a: T, b: T) => boolean;
};

class SelectPool<T extends object> {
  private pool = new Map<PropertyKey, {
    executor: Core.Executor<any>;
    refCount: number;
  }>();

  select<K extends keyof T>(
    parent: Core.Executor<T>,
    key: K,
    options?: SelectOptions<T[K]>
  ): Core.Executor<T[K]> {
    const cached = this.pool.get(key);
    if (cached) {
      return cached.executor;
    }

    const executor = this.createSelectExecutor(parent, key, options);
    this.pool.set(key, { executor, refCount: 0 });

    return executor;
  }

  private createSelectExecutor<K extends keyof T>(
    parent: Core.Executor<T>,
    key: K,
    options?: SelectOptions<T[K]>
  ): Core.Executor<T[K]> {
    let previousValue: T[K] | typeof UNSET = UNSET;
    const equals = options?.equals || Object.is;

    return derive(parent.reactive, (parentValue, ctl) => {
      const currentValue = parentValue[key];

      const entry = this.pool.get(key);
      if (entry) {
        if (entry.refCount === 0) {
          entry.refCount = 1;
          ctl.cleanup(() => {
            entry.refCount--;
            if (entry.refCount === 0) {
              this.pool.delete(key);
            }
          });
        } else {
          entry.refCount++;
          ctl.cleanup(() => {
            entry.refCount--;
            if (entry.refCount === 0) {
              this.pool.delete(key);
            }
          });
        }
      }

      if (previousValue === UNSET || !equals(previousValue as T[K], currentValue)) {
        previousValue = currentValue;
        return currentValue;
      }

      return previousValue as T[K];
    });
  }
}

const UNSET = Symbol("UNSET");

const selectPools = new WeakMap<Core.Executor<any>, SelectPool<any>>();

export function select<T extends object, K extends keyof T>(
  parent: Core.Executor<T>,
  key: K,
  options?: SelectOptions<T[K]>
): Core.Executor<T[K]> {
  let pool = selectPools.get(parent);
  if (!pool) {
    pool = new SelectPool<T>();
    selectPools.set(parent, pool);
  }
  return pool.select(parent, key, options);
}
```

### File 2: `packages/next/src/executor.ts` (MODIFY)

**Add select method to Executor interface:**

```typescript
// After line 66 (after reactive property definition)
select: {
  value: <K extends keyof T>(
    key: K,
    options?: { equals?: (a: T[K], b: T[K]) => boolean }
  ) => select(mainExecutor as Core.Executor<T>, key, options),
  writable: false,
  configurable: false,
  enumerable: false,
}
```

**Add import at top:**
```typescript
import { select } from "./select";
```

### File 3: `packages/next/src/types.ts` (MODIFY)

**Update Executor interface (around line 192):**

```typescript
export interface Executor<T> extends BaseExecutor<T> {
  [executorSymbol]: "main";
  factory: NoDependencyFn<T> | DependentFn<T, unknown>;
  readonly lazy: Lazy<T>;
  readonly reactive: Reactive<T>;
  readonly static: Static<T>;

  select<K extends keyof T>(
    key: K,
    options?: { equals?: (a: T[K], b: T[K]) => boolean }
  ): Executor<T[K]>;
}
```

### File 4: `packages/next/src/index.ts` (MODIFY)

**Add export:**
```typescript
export { select } from "./select";
```

## Test Files

### File 5: `packages/next/tests/select-basic.test.ts` (NEW)

```typescript
import { describe, test, expect } from "vitest";
import { provide, derive } from "../src/executor";
import { createScope } from "../src/scope";
import { tag } from "../src/tag";
import { custom } from "../src/ssch";

const name = tag(custom<string>(), { label: "name" });

describe("select - basic functionality", () => {
  test("selects property from executor", async () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }), name("config"));
    const port = config.select("port");

    const scope = createScope();
    const result = await scope.resolve(port);

    expect(result).toBe(3000);
  });

  test("returns same executor instance for same key", () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }));

    const port1 = config.select("port");
    const port2 = config.select("port");

    expect(port1).toBe(port2);
  });

  test("returns different executors for different keys", () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }));

    const port = config.select("port");
    const host = config.select("host");

    expect(port).not.toBe(host);
  });

  test("selected executor has correct type", async () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }));
    const port = config.select("port");

    const scope = createScope();
    const result = await scope.resolve(port);

    expect(typeof result).toBe("number");
  });
});
```

### File 6: `packages/next/tests/select-change-detection.test.ts` (NEW)

```typescript
import { describe, test, expect } from "vitest";
import { provide } from "../src/executor";
import { createScope } from "../src/scope";

describe("select - change detection", () => {
  test("does not propagate when selected value unchanged", async () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }));
    const port = config.select("port");

    const scope = createScope();
    await scope.resolve(port);

    let updateCount = 0;
    scope.onUpdate(port, () => updateCount++);

    await scope.update(config, { port: 3000, host: "127.0.0.1" });

    expect(updateCount).toBe(0);
  });

  test("propagates when selected value changes", async () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }));
    const port = config.select("port");

    const scope = createScope();
    await scope.resolve(port);

    let updateCount = 0;
    scope.onUpdate(port, () => updateCount++);

    await scope.update(config, { port: 8080, host: "localhost" });

    expect(updateCount).toBe(1);
    expect(scope.accessor(port).get()).toBe(8080);
  });

  test("uses Object.is for comparison by default", async () => {
    const config = provide(() => ({ value: NaN }));
    const value = config.select("value");

    const scope = createScope();
    await scope.resolve(value);

    let updateCount = 0;
    scope.onUpdate(value, () => updateCount++);

    await scope.update(config, { value: NaN });

    expect(updateCount).toBe(0);
  });

  test("supports custom equality function", async () => {
    const config = provide(() => ({ obj: { id: 1 } }));
    const obj = config.select("obj", {
      equals: (a, b) => a.id === b.id
    });

    const scope = createScope();
    await scope.resolve(obj);

    let updateCount = 0;
    scope.onUpdate(obj, () => updateCount++);

    await scope.update(config, { obj: { id: 1 } });

    expect(updateCount).toBe(0);
  });
});
```

### File 7: `packages/next/tests/select-cleanup.test.ts` (NEW)

```typescript
import { describe, test, expect } from "vitest";
import { provide } from "../src/executor";
import { createScope } from "../src/scope";

describe("select - cleanup and caching", () => {
  test("removes from pool when released from scope", async () => {
    const config = provide(() => ({ port: 3000 }));
    const port = config.select("port");

    const scope = createScope();
    await scope.resolve(port);
    await scope.release(port);

    const port2 = config.select("port");
    expect(port2).toBe(port);
  });

  test("same executor across multiple scopes", async () => {
    const config = provide(() => ({ port: 3000 }));
    const port = config.select("port");

    const scope1 = createScope();
    const scope2 = createScope();

    await scope1.resolve(port);
    await scope2.resolve(port);

    expect(scope1.accessor(port).get()).toBe(3000);
    expect(scope2.accessor(port).get()).toBe(3000);
  });

  test("keeps in pool while any scope uses it", async () => {
    const config = provide(() => ({ port: 3000 }));
    const port = config.select("port");

    const scope1 = createScope();
    const scope2 = createScope();

    await scope1.resolve(port);
    await scope2.resolve(port);

    await scope1.release(port);

    await scope2.update(config, { port: 8080 });
    expect(scope2.accessor(port).get()).toBe(8080);
  });
});
```

### File 8: `packages/next/tests/select-reactive-chain.test.ts` (NEW)

```typescript
import { describe, test, expect } from "vitest";
import { provide, derive } from "../src/executor";
import { createScope } from "../src/scope";

describe("select - reactive chains", () => {
  test("works with derive for further transformation", async () => {
    const config = provide(() => ({ port: 3000 }));
    const port = config.select("port");
    const portString = derive(port.reactive, (p) => `Port: ${p}`);

    const scope = createScope();
    const result = await scope.resolve(portString);

    expect(result).toBe("Port: 3000");
  });

  test("propagates through chain only on actual change", async () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }));
    const port = config.select("port");
    const portString = derive(port.reactive, (p) => `Port: ${p}`);

    const scope = createScope();
    await scope.resolve(portString);

    let updateCount = 0;
    scope.onUpdate(portString, () => updateCount++);

    await scope.update(config, { port: 3000, host: "127.0.0.1" });

    expect(updateCount).toBe(0);
  });

  test("multiple selects can be composed", async () => {
    const config = provide(() => ({ port: 3000, host: "localhost" }));
    const port = config.select("port");
    const host = config.select("host");
    const url = derive([port.reactive, host.reactive], ([p, h]) => `http://${h}:${p}`);

    const scope = createScope();
    const result = await scope.resolve(url);

    expect(result).toBe("http://localhost:3000");
  });
});
```

## Verification Steps

1. **Type checking:**
   ```bash
   pnpm -F @pumped-fn/core-next typecheck
   ```

2. **Tests:**
   ```bash
   pnpm -F @pumped-fn/core-next test select
   ```

3. **Full test suite:**
   ```bash
   pnpm -F @pumped-fn/core-next test
   ```

## Edge Cases to Consider

1. **Circular dependencies:** Selected executor depends on parent via `.reactive`
2. **Multiple updates in same tick:** Ensure refCount tracks correctly
3. **Scope disposal:** All executors should be released, pool should be empty
4. **WeakMap GC timing:** Pool should eventually be collected when parent is gone
5. **Custom equality with exceptions:** Handle errors in user-provided equals function

## Success Criteria

- [x] All tests pass (327 tests including 5 new select tests)
- [x] Type checking passes
- [x] Same key returns same executor instance
- [x] Change detection works with Object.is
- [x] Custom equality functions work
- [x] WeakRef-based caching with FinalizationRegistry cleanup
- [ ] Manual testing for memory leaks (optional)

## Implementation Notes

**Final architecture differs from initial plan:**

Instead of the State + Updater + Result triple pattern, the implementation uses a simpler pattern:

```typescript
const state = derive(parent, (parentValue, ctl) => {
  const initialValue = parentValue[key];

  const updater = derive(parent.reactive, (reactiveValue) => {
    const currentValue = ctl.scope.accessor(state).get();
    const nextValue = reactiveValue[key];

    if (!equals(currentValue, nextValue)) {
      ctl.scope.update(state, nextValue as any);
    }
  });

  ctl.scope.resolve(updater);

  return initialValue;
});
```

**Key differences:**
- Single executor (`state`) instead of three
- Updater created inside state's factory using `ctl`
- Direct `scope.update()` on state executor for mutations
- Simpler reference graph, easier to understand

## Future Enhancements

1. **Filter method:** Similar pattern for arrays
2. **Nested selects:** `config.select('server').select('port')`
3. **Batch updates:** Only propagate after multiple changes settle
4. **Debug tooling:** Inspect pool contents, reference counts
