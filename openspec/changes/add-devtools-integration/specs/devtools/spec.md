## ADDED Requirements

### Requirement: Devtools Extension Creation

The system SHALL provide a `createDevtools()` factory that returns an Extension for observability.

#### Scenario: Create devtools with transports

- **WHEN** `createDevtools({ transports: [memory(), broadcastChannel()] })` is called
- **THEN** an Extension is returned
- **AND** the extension can be passed to `createScope({ extensions: [...] })`

### Requirement: Atom Resolution Events

The devtools extension SHALL capture atom resolution events via `wrapResolve`.

#### Scenario: Capture atom timing and dependencies

- **WHEN** an atom is resolved
- **THEN** an event is emitted with atom identity, start time, end time, and dependencies
- **AND** the event does not block the resolution

### Requirement: Flow Execution Events

The devtools extension SHALL capture flow execution events via `wrapExec`.

#### Scenario: Capture flow timing and input

- **WHEN** a flow is executed
- **THEN** an event is emitted with flow identity, start time, end time, and input
- **AND** the event does not block the execution

### Requirement: Fire-and-Forget Transport

All transport sends SHALL be fire-and-forget to never block application code.

#### Scenario: Transport send is non-blocking

- **WHEN** an event is sent to a transport
- **THEN** the send is not awaited
- **AND** application code continues immediately

#### Scenario: Transport errors are silent

- **WHEN** a transport throws an error during send
- **THEN** the error is caught and suppressed
- **AND** application code is not affected

### Requirement: Event Batching

Events SHALL be batched and flushed on the microtask queue.

#### Scenario: Multiple events in same frame

- **WHEN** multiple atom resolutions occur synchronously
- **THEN** events are queued
- **AND** flushed together on the next microtask

### Requirement: Built-in Transports

The package SHALL provide built-in transports for common use cases.

#### Scenario: Memory transport

- **WHEN** `memory()` transport is used
- **THEN** events are stored in-memory for same-process inspection

#### Scenario: BroadcastChannel transport

- **WHEN** `broadcastChannel()` transport is used
- **THEN** events are sent via BroadcastChannel API for cross-tab communication

#### Scenario: Console transport

- **WHEN** `consoleTransport()` is used
- **THEN** events are logged to console for debugging
