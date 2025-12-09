# Select

Select provides fine-grained reactivity with derived subscriptions and equality-based change detection.

## Requirements

### Requirement: Select Method

The Scope SHALL provide a `select()` method for derived subscriptions.

#### Scenario: Create select handle

- **WHEN** `scope.select(atom, selector, options?)` is called
- **THEN** a SelectHandle is returned
- **AND** the selector is applied to the atom's current value

#### Scenario: Atom must be resolved

- **WHEN** `scope.select(atom, selector)` is called for an unresolved atom
- **THEN** an error is thrown: "Cannot select from unresolved atom"

### Requirement: SelectHandle.get()

The SelectHandle SHALL provide a synchronous `get()` method.

#### Scenario: Synchronous value access

- **WHEN** `handle.get()` is called
- **THEN** the current derived value is returned synchronously
- **AND** this enables `useSyncExternalStore` integration

### Requirement: SelectHandle.subscribe()

The SelectHandle SHALL provide a `subscribe(listener)` method for change notifications.

#### Scenario: Subscribe to changes

- **WHEN** `handle.subscribe(listener)` is called
- **THEN** an unsubscribe function is returned
- **AND** the listener is called when the derived value changes

#### Scenario: No fire on subscribe

- **WHEN** `handle.subscribe(listener)` is called
- **THEN** the listener is NOT called immediately
- **AND** only fires on subsequent changes

### Requirement: Equality-Based Change Detection

The SelectHandle SHALL only notify when derived value actually changes.

#### Scenario: Default reference equality

- **WHEN** no `eq` option is provided
- **THEN** reference equality (`===`) is used
- **AND** listeners are only notified when `prev !== next`

#### Scenario: Custom equality function

- **WHEN** `{ eq: (prev, next) => boolean }` option is provided
- **THEN** the custom function determines equality
- **AND** listeners are only notified when `eq(prev, next)` returns `false`

### Requirement: Auto-Cleanup

The SelectHandle SHALL clean up resources when no subscribers remain.

#### Scenario: Cleanup on last unsubscribe

- **WHEN** the last subscriber unsubscribes
- **THEN** the underlying Controller subscription is released
- **AND** no memory leaks occur

### Requirement: Independent Handles

Multiple select handles on the same atom SHALL work independently.

#### Scenario: Multiple selectors

- **WHEN** `scope.select(atom, selectorA)` and `scope.select(atom, selectorB)` are called
- **THEN** each handle operates independently
- **AND** each has its own subscribers and derived value

## Source ADRs

- ADR-006: Fine-grained reactivity with select()
