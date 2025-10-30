# Graceful Shutdown Design

**Date:** 2025-10-30
**Status:** Approved Design

## Overview

Implement graceful shutdown for pumped-fn scopes using AbortController/AbortSignal, similar to Go's context cancellation. This enables hierarchical cancellation, clean resource cleanup, and controlled shutdown behavior.

## Requirements

### Validated Requirements
1. **Trigger**: AbortSignal from parent context
2. **Execution behavior**: Complete in-flight operations, reject new operations
3. **Factory API**: Add `signal` to controller for opt-in cancellation
4. **Propagation**: Parent abort cascades to children automatically

## Architecture

### Extension-Based Implementation

**Core Principle:** Implement as extension to keep core scope unchanged. Extension manages AbortController lifecycle and signal propagation.

**Benefits:**
- Non-invasive to core scope
- Optional feature (enable only when needed)
- Composable with other extensions
- Clean separation of concerns

### Extension Structure

```typescript
interface CancellationExtension extends Extension.Extension {
  controller: AbortController
  parentSignal?: AbortSignal
  aborted: boolean

  init(scope: Core.Scope): void
  wrap<T>(scope: Core.Scope, executor: () => Promised<T>, context: Extension.Operation): Promised<T>
  dispose(scope: Core.Scope): void
}

function createCancellationExtension(parentSignal?: AbortSignal): CancellationExtension
```

## Signal Propagation

### Parent-Child Linking

Child scopes inherit parent's abort signal through extension configuration:

```typescript
// Parent scope with cancellation
const parent = createScope({
  extensions: [createCancellationExtension()]
})

// Child inherits parent's signal
const child = createScope({
  extensions: [createCancellationExtension(parent.signal)]
})
```

### Propagation Mechanism

1. Parent abort triggers `AbortController.abort()`
2. Parent signal fires 'abort' event
3. Child extension listens to parent signal
4. Child automatically calls its own `controller.abort()`
5. Cascade continues through entire scope tree

### Implementation Pattern

```typescript
function createCancellationExtension(parentSignal?: AbortSignal) {
  const controller = new AbortController()

  if (parentSignal) {
    parentSignal.addEventListener('abort', () => {
      controller.abort(parentSignal.reason)
    })
  }

  return {
    controller,
    aborted: false,
    // ... extension methods
  }
}
```

### Properties
- Automatic cascade from parent to children
- Preserves abort reason through chain
- No manual coordination needed
- One-way flow (child abort doesn't affect parent)

## Operation Wrapping

### Wrap Implementation

Extension intercepts resolve/update operations via `wrap()`:

```typescript
wrap<T>(scope: Core.Scope, executor: () => Promised<T>, context: Extension.Operation): Promised<T> {
  if (this.aborted) {
    return Promised.reject(
      new AbortError(this.controller.signal.reason)
    )
  }

  return executor()
}
```

### Controller Signal Injection

During executor resolution:
1. Extension provides signal via scope context
2. Controller object gets `signal` property
3. Factories access: `controller.signal`

### Behavioral Guarantees

- New operations rejected immediately after abort
- In-flight operations complete without interruption
- Factories check `controller.signal.aborted` for early exit
- Factories listen to abort events for cleanup
- No forced timeout (factories responsible for timely completion)

### Factory Example

```typescript
const worker = provide(() => (controller) => {
  const handle = setInterval(() => work(), 1000)

  controller.signal.addEventListener('abort', () => {
    clearInterval(handle)
  })

  controller.cleanup(() => clearInterval(handle))

  return result
})
```

## Error Handling

### AbortError Definition

```typescript
class AbortError extends Error {
  constructor(reason?: unknown) {
    super('Operation aborted')
    this.name = 'AbortError'
    this.cause = reason
  }
}
```

### Disposal Integration

Extension hooks into scope lifecycle:

```typescript
dispose(scope: Core.Scope): void {
  if (!this.aborted) {
    this.controller.abort('Scope disposed')
    this.aborted = true
  }
}
```

### Behavior
- `scope.dispose()` triggers `extension.dispose()`
- Extension aborts controller
- In-flight operations complete
- Cleanup runs after completion
- New operations rejected during disposal

### Error Propagation
- AbortError surfaces through normal error handling
- `scope.onError()` catches abort errors
- Factories can catch and handle gracefully
- Extensions can observe abort errors

## API Surface

### Extension Creation

```typescript
// Standalone scope
const scope = createScope({
  extensions: [createCancellationExtension()]
})

// Child scope with parent signal
const child = createScope({
  extensions: [createCancellationExtension(parent.signal)]
})

// Manual abort
scope.extensions[0].controller.abort('User requested')
```

### Factory Usage

```typescript
const worker = provide(() => (controller) => {
  if (controller.signal.aborted) {
    throw new AbortError()
  }

  controller.signal.addEventListener('abort', () => {
    // Cancel ongoing work
  })

  return doWork()
})
```

## Use Cases

### HTTP Servers
- Parent signal from process signals (SIGTERM/SIGINT)
- Scope per request inherits parent signal
- Graceful connection draining

### CLI Applications
- Parent signal from user interrupt (Ctrl+C)
- All operations abort cleanly
- Show cleanup progress

### Background Jobs
- Parent signal from scheduler shutdown
- Jobs complete current work
- New jobs rejected

### Tests
- Manual abort for timeout testing
- Verify cancellation behavior
- Test cleanup logic

## Type Extensions

### Controller Type Extension

```typescript
declare module './types' {
  namespace Core {
    interface Controller {
      signal?: AbortSignal
    }
  }
}
```

The `signal` property is optional (only present when CancellationExtension is active).

## Implementation Considerations

### YAGNI Applied
- No timeout mechanism (factories handle timing)
- No abort reason inspection API (use signal.reason directly)
- No abort callbacks on scope (use signal events)
- No abort state queries on scope (check extension directly)

### Compatibility
- Works with existing executor patterns
- Compatible with native APIs (fetch, etc.)
- Standard AbortSignal API (familiar pattern)
- Factories opt-in to cancellation awareness

## Summary

Extension-based graceful shutdown provides:
- Hierarchical cancellation (parent → children)
- Clean resource cleanup (via signal events)
- Controlled shutdown (complete in-flight, reject new)
- Opt-in factory cancellation (via controller.signal)
- Non-invasive implementation (optional extension)
- Standard patterns (AbortController/AbortSignal)
