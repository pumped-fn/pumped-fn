# Change: Add Controller.set() and Controller.update() for Direct Value Mutation

**Status: MERGED** - 2025-12-09
> Specs merged to `openspec/specs/controller/spec.md`. Implementation was already complete.

## Why

Frontend applications need to push data from external sources (WebSocket, server-sent events, etc.) into the atom system while maintaining reactivity. Currently, the only way to update an atom's value is `invalidate()`, which re-runs the factory. This is problematic when:

1. **Data comes from outside** - WebSocket pushes new user data; factory would re-fetch, missing the pushed value
2. **Factory is expensive** - Re-running setup logic (connections, subscriptions) just to accept a new value
3. **Value is known** - Caller already has the new value; factory can't "receive" it

## What Changes

- Add `set(value: T): void` method to Controller interface
- Add `update(fn: (prev: T) => T): void` method to Controller interface
- Both methods use the same queue as `invalidate()` (ADR-011)
- Both methods run cleanups before setting new value
- Both methods trigger state transitions and listener notifications

## Impact

- Affected specs: `specs/controller`
- Affected code: `packages/lite/src/scope.ts`, `packages/lite/src/types.ts`
- Source ADR: `.c3/adr/adr-013-controller-set-update.md`
