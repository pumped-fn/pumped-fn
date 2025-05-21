# @pumped-fn/core-next API Documentation

`@pumped-fn/core-next` is a TypeScript library that provides enhanced function utilities for building reactive and dependency-managed applications. It offers a powerful system for creating, managing, and composing functions with dependencies, reactivity, and metadata.

## Table of Contents

- [Core Concepts](#core-concepts)
- [Main APIs](#main-apis)
  - [Executor Functions](#executor-functions)
  - [Scope API](#scope-api)
  - [Meta API](#meta-api)
  - [Schema Validation](#schema-validation)
  - [Type Utilities](#type-utilities)
- [Usage Examples](#usage-examples)

## Core Concepts

### Executors

Executors are the fundamental building blocks in `@pumped-fn/core-next`. They represent functions with dependencies and metadata that can be resolved, cached, and reacted to.

There are four main types of executors:

1. **Main Executor**: The primary executor that contains a factory function and dependencies.
2. **Lazy Executor**: Returns an accessor without immediately resolving the value.
3. **Reactive Executor**: Automatically updates when dependencies change.
4. **Static Executor**: Similar to lazy but doesn't track for reactivity.

### Scope

A scope manages the lifecycle of executors, including caching, dependency resolution, and cleanup. It provides methods for resolving, updating, and releasing executors.

### Meta

Metadata can be attached to executors to provide additional information or behavior. The Meta API provides utilities for creating, finding, and validating metadata.

### Schema Validation

The library includes a schema validation system for validating data against a schema.

## Main APIs

### Executor Functions

#### `provide<T>(factory: (scope: Controller) => T | Promise<T>, ...metas: Meta[]): Executor<T>`

Creates an executor with no dependencies.

**Parameters:**
- `factory`: A function that returns a value or a promise of a value
- `metas`: Optional metadata to attach to the executor

**Returns:**
- An `Executor<T>` instance

**Example:**
```typescript
const countExecutor = provide(() => 0);
```

#### `derive<T, D>(dependencies, factory, ...metas): Executor<T>`

Creates an executor with dependencies.

**Parameters:**
- `dependencies`: A single executor, an array of executors, or a record of executors
- `factory`: A function that receives resolved dependencies and returns a value
- `metas`: Optional metadata to attach to the executor

**Returns:**
- An `Executor<T>` instance

**Example:**
```typescript
const doubledCount = derive(countExecutor, (count) => count * 2);
```

#### `preset<T>(executor: Executor<T>, value: T): Preset<T>`

Creates a preset with a predefined value for an executor.

**Parameters:**
- `executor`: The executor to preset
- `value`: The value to preset

**Returns:**
- A `Preset<T>` object

**Example:**
```typescript
const presetCount = preset(countExecutor, 10);
```

#### Type Guards

The library provides several type guards for checking executor types:

- `isExecutor<T>(input: unknown): input is BaseExecutor<T>`
- `isMainExecutor(executor: unknown): executor is Executor<unknown>`
- `isLazyExecutor(executor: BaseExecutor<unknown>): executor is Lazy<unknown>`
- `isReactiveExecutor(executor: BaseExecutor<unknown>): executor is Reactive<unknown>`
- `isStaticExecutor(executor: BaseExecutor<unknown>): executor is Static<unknown>`

### Scope API

#### `createScope(...presets: Preset<unknown>[]): Scope`

Creates a new scope with optional presets.

**Parameters:**
- `presets`: Optional preset values for executors

**Returns:**
- A `Scope` instance

**Example:**
```typescript
const scope = createScope(preset(countExecutor, 5));
```

#### Scope Methods

The `Scope` interface provides the following methods:

##### `accessor<T>(executor: Executor<T>, eager?: boolean): Accessor<T>`

Gets an accessor for an executor.

**Parameters:**
- `executor`: The executor to get an accessor for
- `eager`: Whether to eagerly resolve the executor

**Returns:**
- An `Accessor<T>` instance

##### `resolve<T>(executor: Executor<T>): Promise<T>`

Resolves an executor and returns its value.

**Parameters:**
- `executor`: The executor to resolve

**Returns:**
- A promise that resolves to the executor's value

##### `resolveAccessor<T>(executor: Executor<T>): Promise<Accessor<T>>`

Resolves an executor and returns its accessor.

**Parameters:**
- `executor`: The executor to resolve

**Returns:**
- A promise that resolves to the executor's accessor

##### `update<T>(executor: Executor<T>, updateFn: T | ((current: T) => T)): Promise<void>`

Updates an executor's value.

**Parameters:**
- `executor`: The executor to update
- `updateFn`: A new value or a function that returns a new value based on the current value

**Returns:**
- A promise that resolves when the update is complete

##### `reset<T>(executor: Executor<T>): Promise<void>`

Resets an executor by releasing it and resolving it again.

**Parameters:**
- `executor`: The executor to reset

**Returns:**
- A promise that resolves when the reset is complete

##### `release(executor: Executor<any>, soft?: boolean): Promise<void>`

Releases an executor, triggering cleanup.

**Parameters:**
- `executor`: The executor to release
- `soft`: Whether to perform a soft release (no error if not resolved)

**Returns:**
- A promise that resolves when the release is complete

##### `dispose(): Promise<void>`

Disposes of the scope, releasing all executors.

**Returns:**
- A promise that resolves when the disposal is complete

##### `onUpdate<T>(executor: Executor<T>, callback: (accessor: Accessor<T>) => void): Cleanup`

Registers a callback to be called when an executor updates.

**Parameters:**
- `executor`: The executor to watch for updates
- `callback`: A function to call when the executor updates

**Returns:**
- A cleanup function that unregisters the callback

### Accessor API

The `Accessor<T>` interface provides methods for interacting with resolved executors:

#### `lookup(): T`

Returns the current value without checking if it's resolved.

**Returns:**
- The current value

#### `get(): T`

Gets the current value, throwing an error if not resolved.

**Returns:**
- The current value

#### `resolve(force?: boolean): Promise<T>`

Resolves the executor, optionally forcing a re-resolution.

**Parameters:**
- `force`: Whether to force re-resolution

**Returns:**
- A promise that resolves to the value

#### `release(soft?: boolean): Promise<void>`

Releases the executor.

**Parameters:**
- `soft`: Whether to perform a soft release

**Returns:**
- A promise that resolves when the release is complete

#### `update(updateFn: T | ((current: T) => T)): Promise<void>`

Updates the executor's value.

**Parameters:**
- `updateFn`: A new value or a function that returns a new value

**Returns:**
- A promise that resolves when the update is complete

#### `subscribe(callback: (value: T) => void): Cleanup`

Subscribes to updates to the executor's value.

**Parameters:**
- `callback`: A function to call when the value updates

**Returns:**
- A cleanup function that unsubscribes from updates

### Meta API

#### `meta<V>(key: string | symbol, schema: StandardSchemaV1<V>): MetaFn<V>`

Creates a metadata function for attaching metadata to executors.

**Parameters:**
- `key`: A string or symbol key for the metadata
- `schema`: A schema for validating the metadata value

**Returns:**
- A `MetaFn<V>` function

**Example:**
```typescript
const nameMeta = meta('name', stringSchema);
const namedExecutor = provide(() => 42, nameMeta('answer'));
```

#### MetaFn Methods

The `MetaFn<V>` interface provides the following methods:

##### `partial<D extends Partial<V>>(d: D): D`

Creates a partial metadata object.

**Parameters:**
- `d`: A partial metadata value

**Returns:**
- The partial metadata object

##### `some(source: MetaContainer | Meta[] | undefined): V[]`

Finds all metadata values with the given key in the source.

**Parameters:**
- `source`: The source to search for metadata

**Returns:**
- An array of metadata values

##### `find(source: MetaContainer | Meta[] | undefined): V | undefined`

Finds the first metadata value with the given key in the source.

**Parameters:**
- `source`: The source to search for metadata

**Returns:**
- The metadata value, or undefined if not found

##### `get(source: MetaContainer | Meta[] | undefined): V`

Gets the first metadata value with the given key in the source, throwing an error if not found.

**Parameters:**
- `source`: The source to search for metadata

**Returns:**
- The metadata value

### Schema Validation

#### `validate<TSchema extends StandardSchemaV1>(schema: TSchema, data: unknown): StandardSchemaV1.InferOutput<TSchema>`

Validates data against a schema.

**Parameters:**
- `schema`: The schema to validate against
- `data`: The data to validate

**Returns:**
- The validated data

**Example:**
```typescript
const validatedData = validate(stringSchema, "hello");
```

#### `validateAsync<TSchema extends StandardSchemaV1>(schema: TSchema, data: unknown): Promise<StandardSchemaV1.InferOutput<TSchema>>`

Validates data against a schema asynchronously.

**Parameters:**
- `schema`: The schema to validate against
- `data`: The data to validate

**Returns:**
- A promise that resolves to the validated data

#### `custom<T>(): StandardSchemaV1<T, T>`

Creates a custom schema that accepts any value of type T.

**Returns:**
- A schema that accepts any value of type T

### Type Utilities

The library provides several type utilities:

#### `StandardSchemaV1<Input = unknown, Output = Input>`

A standard schema interface for validation.

#### `StandardSchemaV1.InferInput<Schema extends StandardSchemaV1>`

Infers the input type of a schema.

#### `StandardSchemaV1.InferOutput<Schema extends StandardSchemaV1>`

Infers the output type of a schema.

#### `Core.InferOutput<T>`

Infers the output type of an executor.

## Usage Examples

### Basic Usage

```typescript
import { provide, derive, createScope } from '@pumped-fn/core-next';

// Create a simple counter executor
const counter = provide(() => 0);

// Create a derived executor that doubles the counter
const doubledCounter = derive(counter, (count) => count * 2);

// Create a scope
const scope = createScope();

// Resolve the counter value
const count = await scope.resolve(counter); // 0

// Update the counter
await scope.update(counter, 5);

// Resolve the doubled counter
const doubled = await scope.resolve(doubledCounter); // 10
```

### Using Metadata

```typescript
import { provide, meta, createScope } from '@pumped-fn/core-next';
import { string } from 'zod'; // Example schema library

// Create a name metadata
const nameMeta = meta('name', {
  '~standard': {
    version: 1,
    vendor: 'pumped-fn',
    validate: (value) => {
      if (typeof value !== 'string') {
        return { issues: [{ message: 'Name must be a string' }] };
      }
      return { value };
    },
    types: { input: String, output: String }
  }
});

// Create an executor with metadata
const greeter = provide(() => 'Hello, world!', nameMeta('greeter'));

// Create a scope
const scope = createScope();

// Find metadata
const name = nameMeta.find(greeter); // 'greeter'
```

### Reactive Updates

```typescript
import { provide, derive, createScope } from '@pumped-fn/core-next';

// Create a counter executor
const counter = provide(() => 0);

// Create a derived executor that doubles the counter
const doubledCounter = derive(counter, (count) => count * 2);

// Create a scope
const scope = createScope();

// Subscribe to updates to the doubled counter
const cleanup = scope.onUpdate(doubledCounter, (accessor) => {
  console.log('Doubled counter updated:', accessor.get());
});

// Update the counter, which will trigger the update callback
await scope.update(counter, 5); // Logs: "Doubled counter updated: 10"

// Clean up the subscription
cleanup();
```

### Using Lazy and Reactive Executors

```typescript
import { provide, createScope } from '@pumped-fn/core-next';

// Create a counter executor
const counter = provide(() => 0);

// Create a scope
const scope = createScope();

// Get a lazy accessor for the counter
const lazyAccessor = await scope.resolveAccessor(counter.lazy);

// The counter is not resolved yet
console.log(lazyAccessor.lookup()); // undefined

// Resolve the counter
await lazyAccessor.resolve();

// Now the counter is resolved
console.log(lazyAccessor.get()); // 0

// Get a reactive accessor for the counter
const reactiveAccessor = await scope.resolveAccessor(counter.reactive);

// Subscribe to updates
const cleanup = reactiveAccessor.subscribe((value) => {
  console.log('Counter updated:', value);
});

// Update the counter, which will trigger the subscription
await scope.update(counter, 5); // Logs: "Counter updated: 5"

// Clean up the subscription
cleanup();
```

