## ADDED Requirements

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

### Requirement: Queue Integration

Both `set()` and `update()` SHALL use the same queue mechanism as `invalidate()`.

#### Scenario: Same frame model

- **WHEN** multiple `set()` or `update()` calls are made synchronously
- **THEN** they are batched and processed on the microtask queue
- **AND** loop detection still applies
