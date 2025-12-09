## MODIFIED Requirements

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

### Requirement: DataStore getOrSet() Method

The DataStore `getOrSet()` method SHALL initialize storage if missing and return the value.

#### Scenario: Uses tag default when no value provided

- **WHEN** `ctx.data.getOrSet(tagWithDefault)` is called for a tag not yet stored
- **THEN** the tag's default value is stored
- **AND** the default value is returned

#### Scenario: Uses provided value over tag default

- **WHEN** `ctx.data.getOrSet(tagWithDefault, value)` is called
- **THEN** the provided value is stored (not the tag default)
- **AND** the provided value is returned

#### Scenario: Returns existing without overwriting

- **WHEN** `ctx.data.getOrSet(tag, newValue)` is called for a tag already stored
- **THEN** the existing stored value is returned
- **AND** the stored value is not overwritten
