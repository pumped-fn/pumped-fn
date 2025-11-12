# Flow Execution Simplification Design

**Date**: 2025-11-12
**Status**: Design
**Scope**: Refactor `packages/next/src/flow.ts` exec() method

## Problem Statement

Current `FlowContext.exec()` has critical issues:

1. **Validation bug**: Non-journaled subflows skip input/output validation (flow.ts:632-637)
2. **Duplication**: 190 lines, 4 execution paths with duplicated validation/wrapping logic
3. **Safety risks**: Context creation and extension wrapping scattered across 4 code paths
4. **Test coverage**: Current tests have significant overlap, unclear coverage gaps

## Goals

1. Fix validation bug - ALL flows must validate input/output
2. Simplify exec() via functional decomposition
3. Enforce structural invariants via TypeScript
4. Rebuild tests from scratch - 100% coverage, zero overlap, 500 lines max in 2 files

## Design

### Architecture: Functional Composition

Extract pure functions for each concern, compose in exec():

```typescript
// Type: Signals executor needs wrapping before execution
type UnwrappedExecutor<T> = {
  executor: () => Promised<T>;
  operation: Extension.Operation;
}

// Type: Forces parent linkage
type ContextConfig = {
  parent: FlowContext;
  tags?: Tag.Tagged[];
  abortController?: AbortController;
  flowName: string;
  isParallel: boolean;
}
```

### Core Functions

**1. Context Management**
```typescript
const createChildContext = (config: ContextConfig): FlowContext => {
  const childCtx = new FlowContext(
    config.parent.scope,
    config.parent['extensions'],
    config.tags,
    config.parent,  // Always required - enforced by type
    config.abortController || config.parent['abortController']
  )
  childCtx.initializeExecutionContext(config.flowName, config.isParallel)
  return childCtx
}
```

**2. Validation (fixes bug)**
```typescript
const executeFlowHandler = (
  handler: Flow.Handler<S, I>,
  definition: Flow.Definition<S, I>,
  input: I,
  context: FlowContext
): Promise<S> => {
  const validated = validate(definition.input, input)  // Always validate
  const result = await handler(context, validated)
  validate(definition.output, result)  // Always validate
  return result
}
```

**3. Flow Execution**
```typescript
const executeJournaledFlow = (
  config: ExecConfig.Flow,
  parentCtx: FlowContext,
  controller: AbortController
): UnwrappedExecutor<S> => {
  const journalKey = createJournalKey(...)

  return {
    executor: () => parentCtx.scope.resolve(config.flow).map(async (handler) => {
      const { isReplay, value } = checkJournalReplay(journal, journalKey)
      if (isReplay) return value

      const childCtx = createChildContext({
        parent: parentCtx,
        tags: config.tags,
        abortController: controller,
        flowName: definition.name,
        isParallel: false
      })

      try {
        const result = await executeFlowHandler(handler, definition, config.input, childCtx)
        journal.set(journalKey, result)
        return result
      } catch (error) {
        journal.set(journalKey, { __error: true, error })
        throw error
      }
    }),
    operation: {
      kind: 'execution',
      target: { type: 'flow', flow: config.flow, definition },
      input: config.input,
      key: journalKey.split(':')[2],
      context: parentCtx
    }
  }
}

const executeNonJournaledFlow = (
  config: ExecConfig.Flow,
  parentCtx: FlowContext,
  controller: AbortController
): UnwrappedExecutor<S> => {
  return {
    executor: () => parentCtx.scope.resolve(config.flow).map(async (handler) => {
      const childCtx = createChildContext({
        parent: parentCtx,
        tags: config.tags,
        abortController: controller,
        flowName: definition.name,
        isParallel: false
      })
      return executeFlowHandler(handler, definition, config.input, childCtx)
    }),
    operation: {
      kind: 'execution',
      target: { type: 'flow', flow: config.flow, definition },
      input: config.input,
      key: undefined,
      context: parentCtx
    }
  }
}
```

**4. Function Execution**
```typescript
const executeJournaledFn = (
  config: ExecConfig.Fn,
  parentCtx: FlowContext
): UnwrappedExecutor<T> => {
  const journalKey = createJournalKey(...)

  return {
    executor: () => {
      const { isReplay, value } = checkJournalReplay(journal, journalKey)
      if (isReplay) return Promised.create(value)

      return Promised.try(async () => {
        const result = await config.fn(...config.params)
        journal.set(journalKey, result)
        return result
      }).catch((error) => {
        journal.set(journalKey, { __error: true, error })
        throw error
      })
    },
    operation: {
      kind: 'execution',
      target: { type: 'fn', params: config.params.length > 0 ? config.params : undefined },
      input: undefined,
      key: journalKey.split(':')[2],
      context: parentCtx
    }
  }
}

const executeNonJournaledFn = (
  config: ExecConfig.Fn
): UnwrappedExecutor<T> => {
  return {
    executor: () => Promised.create(config.fn(...config.params)),
    operation: {
      kind: 'execution',
      target: { type: 'fn', params: config.params.length > 0 ? config.params : undefined },
      input: undefined,
      key: undefined,
      context: undefined  // Non-journaled fn has no context
    }
  }
}
```

**5. Extension Wrapping (enforced)**
```typescript
const executeAndWrap = <T>(
  unwrapped: UnwrappedExecutor<T>,
  ctx: FlowContext
): Promised<T> => {
  const wrapped = ctx.wrapWithExtensions(unwrapped.executor, unwrapped.operation)
  return Promised.create(wrapped())
}
```

**6. Timeout Handling**
```typescript
const executeWithTimeout = <T>(
  executor: () => Promised<T>,
  timeout: number | undefined,
  timeoutId: NodeJS.Timeout | null,
  controller: AbortController
): Promise<T> => {
  if (!timeout) return executor()

  const abortPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => {
      reject(controller.signal.reason || new Error('Operation aborted'))
    }, { once: true })
  })

  try {
    return await Promise.race([executor(), abortPromise])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
```

### Simplified exec()

```typescript
exec<F extends Flow.UFlow>(...args): Promised<any> {
  this.throwIfAborted()

  const config = this.parseExecOverloads(...args)
  const { controller, timeoutId } = createAbortWithTimeout(config.timeout, this.signal)

  // Route to appropriate executor
  const unwrapped = config.type === 'fn'
    ? (config.key
        ? executeJournaledFn(config, this)
        : executeNonJournaledFn(config))
    : (config.key
        ? executeJournaledFlow(config, this, controller)
        : executeNonJournaledFlow(config, this, controller))

  // Wrap with extensions (REQUIRED - TypeScript enforces)
  const wrapped = () => executeAndWrap(unwrapped, this)

  // Execute with timeout
  return Promised.create(
    executeWithTimeout(wrapped, config.timeout, timeoutId, controller)
  )
}
```

### Safety Guarantees

**1. Context hierarchy always valid**
- `createChildContext` requires `parent: FlowContext` via type
- TypeScript error if parent not provided
- Single context creation site - impossible to miss parent linkage

**2. Extension wrapping never skipped**
- Core functions return `UnwrappedExecutor<T>` - signals "not ready"
- exec() must call `executeAndWrap` to get `Promised<T>`
- Cannot return without wrapping - TypeScript blocks it
- Single wrapping site in exec() - impossible to skip

**3. Validation always happens**
- `executeFlowHandler` validates input/output for ALL flows
- Journaled and non-journaled flows both use `executeFlowHandler`
- No code path bypasses validation

## Test Strategy

Rebuild tests from scratch with strict constraints:
- **2 files maximum**
- **500 lines total** (250 lines/file)
- **100% coverage**
- **Zero overlap** between tests

### File 1: flow-execution.test.ts (~250 lines)
**Consumer**: App developers using flows
**Focus**: API behavior, data flow, correctness

```typescript
describe("Flow API", () => {
  // 50 lines - Flow creation variants
  test.each([
    ["no deps", () => flow((ctx, n: number) => n * 2)],
    ["array deps", () => flow([depA], ([a], ctx, n: number) => a + n)],
    ["object deps", () => flow({ a: depA }, ({ a }, ctx, n: number) => a + n)],
    ["with config", () => flow({ input: z.number(), output: z.number() }, (ctx, n) => n)],
  ])("%s creates executable flow", async (_, createFlow) => {
    const result = await flow.execute(createFlow(), 5)
    expect(typeof result).toBe("number")
  })
})

describe("ctx.exec", () => {
  // 60 lines - All exec() variants
  test.each([
    ["subflow no journal", { flow: childFlow, input: 5 }],
    ["subflow journaled", { flow: childFlow, input: 5, key: "step1" }],
    ["fn no journal", { fn: () => 10 }],
    ["fn journaled", { fn: () => 10, key: "calc" }],
  ])("%s executes correctly", async (_, config) => {
    // Single test covers all exec() variants
  })
})

describe("Input/output validation", () => {
  // 40 lines - Validation for all flow types
  test.each([
    ["journaled flow", { key: "step" }],
    ["non-journaled flow", {}],  // Bug fix verification
  ])("%s validates input and output", async (_, opts) => {
    // Covers validation bug fix
  })

  test("validation errors include schema details")
})

describe("Journaling", () => {
  // 50 lines
  test("stores results and replays on key match")
  test("stores errors with __error flag")
  test("resetJournal clears entries by pattern")
  test("journal key format: flowName:depth:userKey")
})

describe("Parallel execution", () => {
  // 30 lines
  test("ctx.parallel resolves all, returns stats")
  test("ctx.parallelSettled handles mixed results, returns stats")
})

describe("Timeout & abort", () => {
  // 20 lines
  test.each([
    ["flow", { flow: slowFlow, input: 5, timeout: 10 }],
    ["fn", { fn: async () => delay(100), timeout: 10 }],
  ])("%s aborts after timeout")
})
```

### File 2: flow-extensions.test.ts (~250 lines)
**Consumer**: Extension/framework developers
**Focus**: Extension integration, context hierarchy, metadata

```typescript
describe("Extension wrapping", () => {
  // 80 lines - Exhaustive wrapping verification
  test.each([
    ["flow execution", () => flow(ctx => 1), undefined],
    ["journaled subflow", { flow, input: 5, key: "s" }],
    ["non-journaled subflow", { flow, input: 5 }],
    ["journaled fn", { fn: () => 1, key: "f" }],
    ["non-journaled fn", { fn: () => 1 }],
    ["parallel", null],
  ])("%s triggers extension wrap", async (name, config) => {
    const tracker = createOperationTracker()
    const scope = createScope({ extensions: [tracker.ext] })
    // Assert operation kind/metadata
  })
})

describe("Extension ordering", () => {
  // 30 lines
  test("multiple extensions wrap in array order")
  test("nested operations show correct depth")
})

describe("Context hierarchy", () => {
  // 70 lines
  test("child context inherits scope, extensions, abortController")
  test("parent linkage via get() prototype chain")
  test("flow metadata set correctly (depth, flowName, parentFlowName, isParallel)")
  test("parallel execution sets isParallel=true")
})

describe("Tags & metadata", () => {
  // 40 lines
  test("scopeTags accessible from ctx.scope")
  test("executionTags accessible from ctx")
  test("executionTags isolated between executions")
  test("tags inherited via parent chain")
})

describe("Scope lifecycle", () => {
  // 30 lines
  test("auto-created scope disposed on success")
  test("auto-created scope disposed on failure")
  test("provided scope not disposed")
})
```

### Coverage via test.each

Aggressive use of `test.each` to cover multiple code paths in single test:
- Reduces duplication
- Clear variant coverage
- Stays within line budget

## Implementation Plan

### Phase 1: Extract Helper Functions
**Files**: packages/next/src/flow.ts

1. Extract `createChildContext(config: ContextConfig): FlowContext`
2. Extract `executeFlowHandler(handler, definition, input, context): Promise<S>`
3. Extract `executeJournaledFlow(config, parentCtx, controller): UnwrappedExecutor<S>`
4. Extract `executeNonJournaledFlow(config, parentCtx, controller): UnwrappedExecutor<S>`
5. Extract `executeJournaledFn(config, parentCtx): UnwrappedExecutor<T>`
6. Extract `executeNonJournaledFn(config): UnwrappedExecutor<T>`
7. Extract `executeAndWrap(unwrapped, ctx): Promised<T>`
8. Extract `executeWithTimeout(executor, timeout, timeoutId, controller): Promise<T>`

**Verification**: `pnpm -F @pumped-fn/core-next typecheck`

### Phase 2: Refactor exec() to Use Helpers
**Files**: packages/next/src/flow.ts

1. Simplify exec() to route to appropriate helper
2. Remove duplicated validation/wrapping logic
3. Ensure all code paths use `executeAndWrap`

**Verification**: `pnpm -F @pumped-fn/core-next typecheck`

### Phase 3: Delete Old Flow Tests
**Files**: packages/next/tests/flow-*.test.ts

1. Delete all existing flow test files:
   - flow-router.test.ts
   - flow-type-inference.test.ts
   - flow-execution-meta.test.ts
   - flow-expected.test.ts
   - flow-api-simplification.test.ts
   - flow-execute.test.ts
   - flow-journal-reset.test.ts
   - flow-extension-fix.test.ts

**Verification**: Tests should fail (no flow tests exist)

### Phase 4: Write New Tests
**Files**:
- packages/next/tests/flow-execution.test.ts
- packages/next/tests/flow-extensions.test.ts

1. Write flow-execution.test.ts (~250 lines)
2. Write flow-extensions.test.ts (~250 lines)
3. Run coverage: `pnpm -F @pumped-fn/core-next test:coverage`
4. Verify 100% coverage for flow.ts

**Verification**:
- `pnpm -F @pumped-fn/core-next typecheck:full`
- `pnpm -F @pumped-fn/core-next test`
- All tests pass, 100% flow.ts coverage

### Phase 5: Update Examples (if needed)
**Files**: examples/**

1. Verify examples still work with refactored flow.ts
2. Update if validation changes affect examples

**Verification**: `pnpm -F @pumped-fn/examples typecheck`

### Phase 6: Update Documentation
**Files**: docs/guides/**

1. Document validation now happens for all flows (not just journaled)
2. Update any flow execution examples if needed

**Verification**: `pnpm docs:build`

### Phase 7: Update Skill References
**Files**: .claude/skills/pumped-design/references/**

1. Update flow execution references if API changes
2. Document new validation guarantee

**Verification**: Manual review of skill files

### Phase 8: Create Changeset
**Files**: .changeset/**

1. Create changeset with type: patch (bug fix) or minor (if breaking)
2. Document:
   - Fixed: Non-journaled flows now validate input/output
   - Refactored: Simplified exec() implementation
   - Improved: Better type safety for context creation and extension wrapping

**Verification**: `pnpm changeset`

## Breaking Changes

**None expected** - Refactor maintains exact same public API behavior.

Only change: Non-journaled flows now validate input/output (bug fix, not breaking).

## Success Criteria

1. ✅ All flows validate input/output (bug fixed)
2. ✅ exec() simplified via functional composition
3. ✅ TypeScript enforces context parent linkage
4. ✅ TypeScript enforces extension wrapping
5. ✅ 100% test coverage for flow.ts
6. ✅ Tests fit in 2 files, 500 lines total
7. ✅ Zero test overlap
8. ✅ All existing examples still work
9. ✅ Documentation updated
10. ✅ Skill references updated
