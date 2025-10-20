# Migration Guide: Accessor and Meta to Tag

## Overview

`accessor()` and `meta()` have been unified into a single `tag()` API. This unification provides a consistent interface for both Map-like storage operations and array-based metadata tagging, while maintaining type safety through StandardSchema validation.

## Quick Reference

| Before | After |
|--------|-------|
| `accessor('key', schema)` | `tag(schema, { label: 'key' })` |
| `accessor('key', schema, default)` | `tag(schema, { label: 'key', default })` |
| `meta('key', schema)` | `tag(schema, { label: 'key' })` |
| `accessor.get(source)` | `tag.get(source)` |
| `accessor.find(source)` | `tag.find(source)` |
| `accessor.set(store, value)` | `tag.set(store, value)` |
| `accessor.preset(value)` | `tag.entry(value)` |
| `meta(value)` | `tag(value)` |
| `meta.some(source)` | `tag.some(source)` |
| `meta.find(source)` | `tag.find(source)` |
| `meta.get(source)` | `tag.get(source)` |

## Migration Examples

### Accessor to Tag

#### Basic Accessor Migration

```typescript
// Before
import { accessor, custom } from "@pumped-fn/core-next";

const port = accessor('port', custom<number>(), 3000);
const store = new Map();
port.set(store, 8080);
console.log(port.get(store)); // 8080

// After
import { tag, custom } from "@pumped-fn/core-next";

const port = tag(custom<number>(), { label: 'port', default: 3000 });
const store = new Map();
port.set(store, 8080);
console.log(port.get(store)); // 8080
```

#### Accessor with Map Initialization

```typescript
// Before
const port = accessor('port', custom<number>(), 3000);
const config = new Map([port.preset()]);

// After
const port = tag(custom<number>(), { label: 'port', default: 3000 });
const config = new Map([port.entry()]);
```

#### Accessor Get/Find Operations

```typescript
// Before
const email = accessor('email', custom<string>());
const store = new Map<symbol, unknown>();

// This throws if value not found
const value = email.get(store);

// This returns undefined if not found
const maybeValue = email.find(store);

// After
const email = tag(custom<string>(), { label: 'email' });
const store = new Map<symbol, unknown>();

// Still throws if value not found
const value = email.get(store);

// Still returns undefined if not found
const maybeValue = email.find(store);
```

### Meta to Tag

#### Basic Meta Migration

```typescript
// Before
import { meta, custom, provide } from "@pumped-fn/core-next";

const name = meta('name', custom<string>());
const tagged = name('John');
const executor = provide(() => {}, tagged);
console.log(name.find(executor)); // 'John'

// After
import { tag, custom, provide } from "@pumped-fn/core-next";

const name = tag(custom<string>(), { label: 'name' });
const tagged = name('John');
const executor = provide(() => {}, tagged);
console.log(name.find(executor)); // 'John'
```

#### Meta with Multiple Values

```typescript
// Before
const name = meta('name', custom<string>());
const executor = provide(() => {}, name('John'), name('Jane'));
console.log(name.some(executor)); // ['John', 'Jane']

// After
const name = tag(custom<string>(), { label: 'name' });
const executor = provide(() => {}, name('John'), name('Jane'));
console.log(name.some(executor)); // ['John', 'Jane']
```

#### Meta with Scope Configuration

```typescript
// Before
import { meta, custom, createScope } from "@pumped-fn/core-next";

const config = meta('config', custom<string>());
const scope = createScope({
  meta: [config('production')]
});

const executor = provide((controller) => {
  return config.get(controller.scope);
});

// After
import { tag, custom, createScope } from "@pumped-fn/core-next";

const config = tag(custom<string>(), { label: 'config' });
const scope = createScope({
  meta: [config('production')]
});

const executor = provide((controller) => {
  return config.get(controller.scope);
});
```

#### Flow Execution Meta

```typescript
// Before
import { flow, meta, custom } from "@pumped-fn/core-next";

const requestId = meta('request.id', custom<string>());
const getRequestId = flow((context) => {
  return requestId.get(context);
});

await flow.execute(getRequestId, undefined, {
  meta: [requestId('req-123')]
});

// After
import { flow, tag, custom } from "@pumped-fn/core-next";

const requestId = tag(custom<string>(), { label: 'request.id' });
const getRequestId = flow((context) => {
  return requestId.get(context);
});

await flow.execute(getRequestId, undefined, {
  meta: [requestId('req-123')]
});
```

### Nameless Tags

Tag introduces a new capability: anonymous symbol-based tags without labels.

```typescript
// New capability: anonymous symbol-based tags
const email = tag(custom<string>()); // No label needed
const tagged = email('test@example.com');

// Useful for temporary or local tagging where names aren't necessary
const temp = tag(custom<number>());
const values = [temp(1), temp(2), temp(3)];
console.log(temp.some(values)); // [1, 2, 3]
```

### Advanced Patterns

#### Unified Source Type Handling

Tag works seamlessly with all source types:

```typescript
const name = tag(custom<string>(), { label: 'name' });

// Works with Map (Store)
const store = new Map();
name.set(store, 'Alice');
console.log(name.get(store)); // 'Alice'

// Works with Tagged arrays
const tags = [name('Bob')];
console.log(name.find(tags)); // 'Bob'

// Works with Containers (executors, scopes)
const executor = provide(() => {}, name('Charlie'));
console.log(name.find(executor)); // 'Charlie'

const scope = createScope({ meta: [name('Dave')] });
console.log(name.get(scope)); // 'Dave'
```

#### Type-Safe Defaults

```typescript
// Without default - find() returns T | undefined
const email = tag(custom<string>(), { label: 'email' });
const maybeEmail = email.find(store); // string | undefined

// With default - find() always returns T
const port = tag(custom<number>(), { label: 'port', default: 3000 });
const portValue = port.find(store); // number (never undefined)
```

#### Context-Aware Set Behavior

```typescript
const config = tag(custom<string>(), { label: 'config' });

// Set on Store - mutates the store (returns void)
const store = new Map();
config.set(store, 'production'); // void

// Set on Container/Array - returns Tagged value
const container = { tags: [] };
const tagged = config.set(container, 'production'); // Tag.Tagged<string>
console.log(tagged.value); // 'production'
```

#### Schema Validation

```typescript
const port = tag({
  "~standard": {
    vendor: "app",
    version: 1,
    validate(value: unknown) {
      if (typeof value !== "number" || value < 0 || value > 65535) {
        return { issues: [{ message: "Invalid port number" }] };
      }
      return { value };
    },
  },
}, { label: "port", default: 3000 });

const store = new Map();
port.set(store, 8080); // OK
// port.set(store, 99999); // Throws SchemaError
```

## Breaking Changes

### Removed APIs

1. **`accessor()` removed** - Use `tag()` instead
2. **`meta()` removed** - Use `tag()` instead
3. **`accessor.preset()` removed** - Use `tag.entry()` instead
4. **`getValue()` removed** - Use `tag.get()` instead
5. **`findValue()` removed** - Use `tag.find()` instead
6. **`findValues()` removed** - Use `tag.some()` instead

### Type Changes

The `Meta` and `Accessor` namespaces now alias `Tag` types:

```typescript
// Old types still work but are deprecated
Meta.Meta<T> // Now aliases Tag.Tagged<T>
Meta.MetaFn<T> // Now aliases Tag.Tag<T>
Meta.DefaultMetaFn<T> // Now aliases Tag.Tag<T, true>

// Accessor namespace removed entirely
// Use Tag namespace instead
Tag.Store // Replaces Accessor.DataStore
Tag.Source // Replaces Accessor.AccessorSource
Tag.Tagged<T> // New unified tagged value type
Tag.Tag<T, HasDefault> // New unified tag function type
```

### Behavioral Changes

1. **Symbol keys**: Tags with labels use `Symbol.for(label)` for global symbols. Anonymous tags use `Symbol()` for unique symbols.

2. **Default handling**: Tags without defaults return `undefined` from `find()`, while tags with defaults always return a value.

3. **Source compatibility**: Tags automatically detect and work with `metas` property on executors/scopes for backward compatibility.

## Migration Checklist

- [ ] Replace all `accessor()` calls with `tag()`
- [ ] Replace all `meta()` calls with `tag()`
- [ ] Rename `preset()` calls to `entry()`
- [ ] Update imports to remove `accessor` and `meta`
- [ ] Update type annotations from `Meta.MetaFn` to `Tag.Tag`
- [ ] Run type checking: `pnpm typecheck:full`
- [ ] Run tests to verify behavior: `pnpm test`
- [ ] Update any documentation or comments referencing old APIs

## Compatibility Notes

The `metas` property on executors and scopes continues to work with tags. The migration is designed to be backward compatible at the runtime level - existing code using the `metas` property will continue to work with tag-created values.

```typescript
// Both work the same way
const name = tag(custom<string>(), { label: 'name' });
const executor = provide(() => {}, name('test'));

// Access via tag API
name.find(executor); // 'test'

// Access via metas property (backward compatible)
executor.metas?.find(m => m.key === name.key)?.value; // 'test'
```

## Migration Strategy

### For Library Authors

1. Start by adding tag imports alongside existing accessor/meta imports
2. Create new tags for all accessor/meta definitions
3. Gradually migrate call sites to use tags
4. Remove old accessor/meta imports once all call sites are migrated
5. Update type definitions to use Tag types

### For Application Developers

1. Update dependencies to get the new tag API
2. Run your build/typecheck to find all accessor/meta usage
3. Use find-replace with caution (patterns vary by usage)
4. Test thoroughly - especially validation and default value behavior
5. Consider using anonymous tags for internal/temporary tagging

## Further Reading

- [Tag API Documentation](../api/tag.md)
- [Tag Type Definitions](../../packages/next/src/tag-types.ts)
- [Tag Implementation](../../packages/next/src/tag.ts)
- [Migration Implementation Plan](../plans/2025-10-20-unify-accessor-meta-into-tag.md)
