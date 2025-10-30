# Graceful Disposal Implementation Plan

## Task 1: Add Scope State Types and Error Classes

**Objective:** Add foundational types and error classes for graceful disposal.

**Files to modify:**
- `packages/next/src/scope.ts`

**Implementation:**

1. Add `ScopeState` type:
```typescript
type ScopeState = 'active' | 'disposing' | 'disposed';
```

2. Add error classes:
```typescript
class ScopeDisposingError extends Error {
  constructor() {
    super('Scope is disposing, operation canceled');
    this.name = 'ScopeDisposingError';
  }
}

class GracePeriodExceededError extends Error {
  constructor(gracePeriod: number) {
    super(`Operation exceeded grace period of ${gracePeriod}ms`);
    this.name = 'GracePeriodExceededError';
  }
}
```

3. Add state tracking fields to `BaseScope`:
```typescript
private scopeState: ScopeState = 'active';
private activeExecutions: Set<Promise<unknown>> = new Set();
private pendingResolutions: Set<Promise<unknown>> = new Set();
```

**Tests:**
- Create `packages/next/tests/graceful-disposal.test.ts`
- Test error classes instantiate correctly
- Test error messages are correct
- Test error names are correct

**Verification:**
```bash
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
pnpm -F @pumped-fn/core-next test
```

**Commit message:**
```
feat: add scope state types and error classes for graceful disposal

Add foundational types and error classes:
- ScopeState type with active/disposing/disposed states
- ScopeDisposingError for operations during disposal
- GracePeriodExceededError for timeout scenarios
- State tracking fields in BaseScope

Part of graceful disposal implementation (Task 1/5)
```

## Task 2: Update dispose() Method Signature

**Objective:** Update dispose method to accept gracePeriod option.

**Files to modify:**
- `packages/next/src/types.ts`
- `packages/next/src/scope.ts`

**Implementation:**

1. Update `Scope.dispose()` type signature in types.ts:
```typescript
dispose(options?: { gracePeriod?: number }): Promised<void>
```

2. Update `BaseScope.dispose()` implementation signature (no logic changes yet)

**Tests:**
- Test dispose() can be called without options
- Test dispose() can be called with gracePeriod option
- Test return type is Promised<void>

**Verification:**
```bash
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
pnpm -F @pumped-fn/core-next test
```

**Commit message:**
```
feat: update dispose method signature to accept gracePeriod option

Update dispose() signature to accept optional { gracePeriod?: number }.
Maintains backward compatibility with existing dispose() calls.

Part of graceful disposal implementation (Task 2/5)
```

## Task 3: Implement State Checks in resolve() and exec()

**Objective:** Add state validation to reject new operations during disposal.

**Files to modify:**
- `packages/next/src/scope.ts`

**Implementation:**

1. Add state check at start of `AccessorImpl.resolveCore()`:
```typescript
if (this.scope['scopeState'] === 'disposing') {
  throw new ScopeDisposingError();
}
if (this.scope['scopeState'] === 'disposed') {
  throw new Error('Scope is disposed');
}
```

2. Add state check at start of `~executeFlow()`:
```typescript
if (scope['scopeState'] === 'disposing') {
  throw new ScopeDisposingError();
}
if (scope['scopeState'] === 'disposed') {
  throw new Error('Scope is disposed');
}
```

**Tests:**
- Test resolve() throws ScopeDisposingError when scope is disposing
- Test resolve() throws error when scope is disposed
- Test exec() throws ScopeDisposingError when scope is disposing
- Test exec() throws error when scope is disposed
- Test resolve() and exec() work normally when scope is active

**Verification:**
```bash
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
pnpm -F @pumped-fn/core-next test
```

**Commit message:**
```
feat: add state validation to resolve() and exec()

Reject new operations during disposal:
- throw ScopeDisposingError when scope is disposing
- throw error when scope is disposed
- allow operations when scope is active

Part of graceful disposal implementation (Task 3/5)
```

## Task 4: Add Operation Tracking

**Objective:** Track pending and active operations for graceful disposal.

**Files to modify:**
- `packages/next/src/scope.ts`

**Implementation:**

1. In `AccessorImpl.resolveCore()`:
   - Add to pendingResolutions at start
   - Move to activeExecutions before executeFactory()
   - Remove from activeExecutions after factory completes

2. In `~executeFlow()`:
   - Add to pendingResolutions at start
   - Move to activeExecutions before handler call
   - Remove from activeExecutions after handler completes

**Tests:**
- Test pending operations are tracked before factory execution
- Test operations move to active during factory execution
- Test operations are removed after completion
- Test tracking works for both resolve() and exec()

**Verification:**
```bash
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
pnpm -F @pumped-fn/core-next test
```

**Commit message:**
```
feat: add operation tracking for pending and active executions

Track operations in two phases:
- pendingResolutions: operations waiting to start
- activeExecutions: operations currently running
Enables graceful disposal with proper grace period handling.

Part of graceful disposal implementation (Task 4/5)
```

## Task 5: Implement Graceful Disposal Logic

**Objective:** Implement two-phase disposal with grace period.

**Files to modify:**
- `packages/next/src/scope.ts`

**Implementation:**

1. Update `BaseScope.dispose()`:
   - Extract gracePeriod from options (default 5000ms)
   - Transition scopeState to 'disposing'
   - Cancel all pending operations (clear pendingResolutions)
   - Wait for active operations with timeout: `Promise.race([Promise.allSettled(activeExecutions), timeout(gracePeriod)])`
   - Run existing disposal logic
   - Transition scopeState to 'disposed'

**Tests:**
- Test pending operations canceled immediately
- Test active operations get grace period
- Test grace period timeout behavior
- Test different grace period values (0, 1000, 5000)
- Test state transitions (active -> disposing -> disposed)
- Test existing disposal logic still runs

**Verification:**
```bash
pnpm -F @pumped-fn/core-next typecheck
pnpm -F @pumped-fn/core-next typecheck:full
pnpm -F @pumped-fn/core-next test
```

**Commit message:**
```
feat: implement two-phase graceful disposal with grace period

Implement graceful disposal flow:
1. Transition to disposing state
2. Cancel pending operations immediately
3. Wait for active operations (up to gracePeriod)
4. Run existing disposal logic
5. Transition to disposed state

Default grace period: 5000ms
Configurable via dispose({ gracePeriod })

Part of graceful disposal implementation (Task 5/5)
```
