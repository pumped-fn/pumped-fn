# Graceful Disposal with Cancelation

## Overview

Add graceful shutdown mechanism to pumped-fn Scope with:
- Two-phase disposal with grace period
- Automatic cancelation of pending operations
- Grace period for active executions to complete cleanly
- Deadline/timeout mechanism for force termination

## Requirements

1. Cancel long-running executor resolutions during application shutdown
2. Deadline/timeout mechanism before forcing cancelation
3. Grace period for clean completion before force termination
4. Automatic internal handling (no factory function changes required)
5. Handle both executor resolutions and flow executions

## Architecture: Two-Phase Dispose with State Transitions

### State Machine

Scope lifecycle states:
- `active`: Normal operation, accepts new resolutions/executions
- `disposing`: Grace period active, rejects new operations, waits for in-flight
- `disposed`: Fully shut down, all operations canceled

### Operation Tracking

Track operations in two categories:

**Pending Operations** (not yet executing factory):
- Waiting for dependency resolution
- Not yet started factory execution
- Canceled immediately during disposal

**Active Operations** (factory currently running):
- Factory function actively executing
- Flow handler actively executing
- Given grace period to complete

### Disposal Flow

When `dispose(options?: { gracePeriod?: number })` is called:

1. Transition to `disposing` state
2. Reject new `resolve()` and `exec()` calls with `ScopeDisposingError`
3. Cancel all pending operations immediately (clear `pendingResolutions`)
4. Start grace period timer (default 5000ms)
5. Wait: `Promise.race([Promise.allSettled(activeExecutions), timeout(gracePeriod)])`
6. After grace period or completion:
   - Run existing disposal logic (release executors, trigger cleanups, clear caches)
   - Transition to `disposed` state

## Implementation Details

### Scope State Tracking

```typescript
type ScopeState = 'active' | 'disposing' | 'disposed';

class BaseScope {
  private scopeState: ScopeState = 'active';
  private activeExecutions: Set<Promise<unknown>> = new Set();
  private pendingResolutions: Set<Promise<unknown>> = new Set();
}
```

### Executor Resolution Tracking

In `AccessorImpl.resolveCore()`:

1. Start resolution → add to `pendingResolutions`
2. Before `executeFactory()` → move to `activeExecutions`
3. After factory completes → remove from `activeExecutions`

State checks in `resolve()`:
```typescript
if (scopeState === 'disposing') throw new ScopeDisposingError();
if (scopeState === 'disposed') throw new Error('Scope is disposed');
```

### Flow Execution Tracking

In `~executeFlow()`:

1. Start execution → add to `pendingResolutions`
2. Before calling handler → move to `activeExecutions`
3. After handler completes → remove from `activeExecutions`

State checks in `exec()`:
```typescript
if (scopeState === 'disposing') throw new ScopeDisposingError();
if (scopeState === 'disposed') throw new Error('Scope is disposed');
```

### Error Types

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

**Error behavior:**
- Pending operations → throw `ScopeDisposingError` when they try to start
- Active operations after grace period → untracked, state updates fail silently
- New operations during disposal → throw `ScopeDisposingError` immediately

## API Changes

### Dispose Method Signature

```typescript
dispose(options?: { gracePeriod?: number }): Promised<void>
```

Default grace period: 5000ms

### Usage Examples

```typescript
// Default 5 second grace period
await scope.dispose();

// Custom grace period
await scope.dispose({ gracePeriod: 10000 });

// No grace period (immediate force)
await scope.dispose({ gracePeriod: 0 });
```

### Backward Compatibility

No breaking changes:
- Existing `dispose()` calls work with default grace period
- Behavior change: now waits for in-flight operations instead of immediate cancel

## Implementation Scope

### Files to Modify

**packages/next/src/scope.ts:**
- Add `ScopeState` type and state field
- Add `activeExecutions` and `pendingResolutions` Sets
- Modify `dispose()` signature and implementation
- Add tracking in `AccessorImpl.resolveCore()`
- Add tracking in `~executeFlow()`
- Add state checks in `resolve()` and `exec()`

**packages/next/src/types.ts:**
- Update `Scope.dispose()` type signature

**packages/next/tests/graceful-disposal.test.ts (new):**
- Test pending operations canceled immediately
- Test active operations get grace period
- Test grace period timeout behavior
- Test different grace period values
- Test state transitions
- Test error types thrown

## Callback Behavior During Disposal

- `onUpdate`, `onChange`, `onError`, `onRelease`: won't fire for canceled operations
- Extension `dispose()` hooks: still run after grace period completes
- No new callbacks can be registered during disposing state

## Success Criteria

1. Pending operations (not yet started) cancel immediately
2. Active operations get full grace period to complete
3. Operations exceeding grace period are force-terminated
4. New operations rejected during disposal
5. Existing code continues working without changes
6. All tests pass with new graceful disposal behavior
