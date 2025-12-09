# Scope

Scope is the core DI container providing resolution caching, lifecycle states, and reactive patterns.

## Requirements

### Requirement: Scope Creation

The system SHALL provide a `createScope()` function that returns a Scope instance synchronously.

#### Scenario: Synchronous creation with ready promise

- **WHEN** `createScope()` is called
- **THEN** a Scope instance is returned immediately
- **AND** the Scope has a `ready` promise property for extension initialization

### Requirement: Atom Resolution

The Scope SHALL cache resolved atom values for the scope's lifetime.

#### Scenario: Cache hit on subsequent resolve

- **WHEN** `scope.resolve(atom)` is called for an atom already resolved
- **THEN** the cached value is returned without re-running the factory

#### Scenario: Dependency resolution

- **WHEN** an atom factory requests dependencies via `ctx.resolve()`
- **THEN** dependencies are resolved recursively before the factory runs
- **AND** all resolved values are cached

### Requirement: Controller Access

The Scope SHALL provide a `controller(atom)` method for reactive access patterns.

#### Scenario: Get controller for atom

- **WHEN** `scope.controller(atom)` is called
- **THEN** a Controller instance is returned for the specified atom
- **AND** the controller provides `get()`, `resolve()`, `invalidate()`, and `on()` methods

### Requirement: Disposal

The Scope SHALL provide a `dispose()` method for cleanup.

#### Scenario: Cleanup on dispose

- **WHEN** `scope.dispose()` is called
- **THEN** all registered cleanup functions are executed in LIFO order
- **AND** all cached values are cleared
- **AND** subsequent resolve calls fail

### Requirement: Preset Support

The Scope SHALL support presets for value injection and atom redirection.

#### Scenario: Value preset

- **WHEN** `createScope({ presets: [preset(atom, value)] })` is called
- **THEN** the preset value is used instead of running the factory

## Source ADRs

- ADR-002: Lightweight lite package design
- ADR-008: Synchronous createScope with ready promise
