# DataStore

DataStore provides typed per-atom private storage via ctx.data using Tags as keys.

## Requirements

### Requirement: Tag-Based Keys

DataStore SHALL use Tag as keys for type-safe storage.

#### Scenario: Type-safe get/set

- **WHEN** `ctx.data.set(tag, value)` is called
- **THEN** the value must match the tag's type T
- **AND** `ctx.data.get(tag)` returns `T | undefined`

### Requirement: DataStore get() Method

The DataStore `get()` method SHALL be a pure lookup that returns `T | undefined`, never using tag defaults.

#### Scenario: Returns undefined when not stored

- **WHEN** `ctx.data.get(tag)` is called for a tag that has not been set
- **THEN** `undefined` is returned
- **AND** this applies even if the tag has a default value

#### Scenario: Returns stored value

- **WHEN** `ctx.data.get(tag)` is called for a tag that has been set
- **THEN** the stored value is returned

#### Scenario: Consistent with has()

- **WHEN** `ctx.data.get(tag)` returns `undefined`
- **THEN** `ctx.data.has(tag)` returns `false`
- **AND** when `ctx.data.get(tag)` returns a value
- **THEN** `ctx.data.has(tag)` returns `true`

### Requirement: Storage Persistence

DataStore values SHALL survive atom invalidation.

#### Scenario: Data persists across invalidation

- **WHEN** an atom is invalidated and re-resolved
- **THEN** values stored in `ctx.data` are preserved
- **AND** the factory can read previously stored values

### Requirement: Private Scope

DataStore SHALL be private to each atom.

#### Scenario: Isolated storage per atom

- **WHEN** two atoms use the same tag key
- **THEN** they have separate storage
- **AND** one atom cannot access another's data

### Requirement: Map-Like Operations

DataStore SHALL provide Map-like methods: `has()`, `delete()`, `clear()`.

#### Scenario: Check existence

- **WHEN** `ctx.data.has(tag)` is called
- **THEN** `true` is returned if tag has been set
- **AND** `false` otherwise

#### Scenario: Delete entry

- **WHEN** `ctx.data.delete(tag)` is called
- **THEN** the stored value is removed
- **AND** `true` is returned if tag existed
- **AND** `false` if tag was not present

#### Scenario: Clear all

- **WHEN** `ctx.data.clear()` is called
- **THEN** all stored values are removed

### Requirement: getOrSet Method

DataStore SHALL provide `getOrSet()` for initialize-if-missing patterns.

#### Scenario: Initialize with tag default

- **WHEN** `ctx.data.getOrSet(tagWithDefault)` is called for unset tag
- **THEN** the tag's default value is stored
- **AND** the default value is returned

#### Scenario: Initialize with provided value

- **WHEN** `ctx.data.getOrSet(tag, value)` is called for unset tag
- **THEN** the provided value is stored (not tag default)
- **AND** the provided value is returned

#### Scenario: Return existing without overwrite

- **WHEN** `ctx.data.getOrSet(tag, newValue)` is called for existing tag
- **THEN** the existing value is returned
- **AND** the stored value is NOT overwritten

### Requirement: Relaxed Type Signatures

DataStore methods SHALL accept Tag types without overly strict constraints.

#### Scenario: Accept any tag type for has/delete

- **WHEN** `ctx.data.has(tag)` or `ctx.data.delete(tag)` is called
- **THEN** any valid Tag type is accepted
- **AND** the operation succeeds

## Source ADRs

- ADR-007: Per-atom private storage via ctx.data
- ADR-010: Tag-based typed DataStore API
- ADR-012: DataStore API improvements (relaxed signatures, getOrSet)
- ADR-014: DataStore Map-like semantics (clarification)
