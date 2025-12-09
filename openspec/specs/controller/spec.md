# Controller

Controller provides reactive state observation and lifecycle management for atoms.

## Requirements

### Requirement: State Machine

Atoms SHALL have explicit lifecycle states: `idle | resolving | resolved | failed`.

#### Scenario: State transitions

- **WHEN** `scope.resolve(atom)` is called for an unresolved atom
- **THEN** state transitions from `idle` to `resolving` to `resolved`
- **AND** on error, state transitions to `failed`

### Requirement: Controller.get()

The Controller SHALL provide a synchronous `get()` method for value access.

#### Scenario: Get returns current value

- **WHEN** `controller.get()` is called on a resolved atom
- **THEN** the current cached value is returned

#### Scenario: Get throws on idle

- **WHEN** `controller.get()` is called on an atom in `idle` state
- **THEN** an error is thrown with message "not resolved"

#### Scenario: Get returns stale during resolving

- **WHEN** `controller.get()` is called on an atom in `resolving` state
- **THEN** the previous resolved value is returned

#### Scenario: Get throws on failed

- **WHEN** `controller.get()` is called on an atom in `failed` state
- **THEN** the error that caused failure is thrown

### Requirement: Controller.invalidate()

The Controller SHALL provide an `invalidate()` method to trigger re-resolution.

#### Scenario: Invalidation runs cleanup

- **WHEN** `controller.invalidate()` is called
- **THEN** all cleanup functions are executed in LIFO order
- **AND** the cached value is cleared
- **AND** the factory is re-run

#### Scenario: Listeners notified on invalidation

- **WHEN** an atom is invalidated
- **THEN** state transitions to `resolving`, then `resolved`
- **AND** all registered listeners are notified at each transition

### Requirement: Controller.on()

The Controller SHALL provide an `on(event, listener)` method for state change subscriptions.

#### Scenario: Listen to resolved events

- **WHEN** `controller.on('resolved', listener)` is called
- **THEN** the listener is called only when state becomes `resolved`

#### Scenario: Listen to resolving events

- **WHEN** `controller.on('resolving', listener)` is called
- **THEN** the listener is called only when state becomes `resolving`

#### Scenario: Listen to all events

- **WHEN** `controller.on('*', listener)` is called
- **THEN** the listener is called on any state transition

#### Scenario: Unsubscribe

- **WHEN** the unsubscribe function returned by `on()` is called
- **THEN** the listener is no longer notified

### Requirement: Self-Invalidation

Atoms SHALL be able to invalidate themselves from within the factory.

#### Scenario: Scheduled invalidation

- **WHEN** `ctx.invalidate()` is called inside a factory
- **THEN** invalidation is scheduled after current resolution completes
- **AND** does NOT interrupt current factory execution

### Requirement: Sequential Invalidation Chain

Invalidation SHALL process atoms sequentially with loop detection.

#### Scenario: Sequential chain processing

- **WHEN** atom A invalidates and its listener triggers atom B to invalidate
- **THEN** atom A fully resolves before atom B starts resolving
- **AND** the entire chain processes in a single microtask frame

#### Scenario: Loop detection

- **WHEN** an invalidation chain creates a cycle (A → B → A)
- **THEN** an error is thrown: "Infinite invalidation loop detected: A → B → A"

#### Scenario: Duplicate deduplication

- **WHEN** `invalidate()` is called multiple times synchronously for the same atom
- **THEN** the factory only runs once

### Requirement: Frame Control

Invalidation SHALL follow a deterministic 3-frame model.

#### Scenario: Three frame model

- **WHEN** `invalidate()` is called
- **THEN** Frame 0: invalidate called, atom queued, microtask scheduled
- **AND** Frame 1: entire chain processes sequentially
- **AND** Frame 2: chain settled, no pending work

### Requirement: Direct Value Mutation via set()

The Controller SHALL provide a `set(value: T): void` method that replaces the atom's cached value without re-running the factory.

#### Scenario: Replace value and notify listeners

- **WHEN** `controller.set(newValue)` is called on a resolved atom
- **THEN** the value is queued for replacement
- **AND** cleanups run in LIFO order
- **AND** state transitions from `resolved` to `resolving` to `resolved`
- **AND** all listeners are notified at each transition

#### Scenario: Throw when atom not resolved

- **WHEN** `controller.set(value)` is called on an atom in `idle` state
- **THEN** an error is thrown with message "Atom not resolved"

#### Scenario: Queue when atom is resolving

- **WHEN** `controller.set(value)` is called on an atom in `resolving` state
- **THEN** the set operation is queued as `pendingSet`
- **AND** executes after the current resolution completes

### Requirement: Value Transformation via update()

The Controller SHALL provide an `update(fn: (prev: T) => T): void` method that transforms the current value.

#### Scenario: Transform value using function

- **WHEN** `controller.update(fn)` is called on a resolved atom
- **THEN** the current value is passed to `fn`
- **AND** the return value replaces the cached value
- **AND** listeners are notified

### Requirement: set()/update() Queue Integration

Both `set()` and `update()` SHALL use the same queue mechanism as `invalidate()`.

#### Scenario: Same frame model

- **WHEN** multiple `set()` or `update()` calls are made synchronously
- **THEN** they are batched and processed on the microtask queue
- **AND** loop detection still applies

## Source ADRs

- ADR-003: Controller-based reactivity
- ADR-009: Fix duplicate listener notifications
- ADR-011: Sequential invalidation chain with loop detection
- ADR-013: Controller.set() and Controller.update() for direct value mutation
