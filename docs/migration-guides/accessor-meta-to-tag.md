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

#### Tag with Scope Configuration

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
  tags: [config('production')]
});

const executor = provide((controller) => {
  return config.get(controller.scope);
});
```

#### Flow Execution Tags

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
  tags: [requestId('req-123')]
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

const scope = createScope({ tags: [name('Dave')] });
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

The `Meta` namespace has been removed entirely:

```typescript
// Old - REMOVED
Meta.Meta<T> // No longer exists
Meta.MetaFn<T> // No longer exists
Meta.MetaContainer // No longer exists

// New - Use Tag namespace
Tag.Tagged<T> // Unified tagged value type
Tag.Tag<T, false> // Tag without default
Tag.Tag<T, true> // Tag with default
Tag.Container // Replaces MetaContainer
Tag.Store // Map-like storage
Tag.Source // Union of valid sources
```

### Property and Parameter Names

All instances of `metas` property and `meta` parameter have been renamed to `tags`:

```typescript
// Property access
executor.tags // was: executor.metas
scope.tags // was: scope.metas
accessor.tags // was: accessor.metas

// Function parameters
createScope({ tags: [...] }) // was: { meta: [...] }
scope.exec(flow, input, { tags: [...] }) // was: { meta: [...] }
flow.execute(handler, input, { tags: [...] }) // was: { meta: [...] }
```

**No backward compatibility:** Code using `metas` property or `meta` parameters will break and must be updated.

### Behavioral Changes

1. **Symbol keys**: Tags with labels use `Symbol.for(label)` for global symbols. Anonymous tags use `Symbol()` for unique symbols.

2. **Default handling**: Tags without defaults return `undefined` from `find()`, while tags with defaults always return a value.

## Migration Checklist

- [ ] Replace all `accessor()` calls with `tag()`
- [ ] Replace all `meta()` calls with `tag()`
- [ ] Rename `preset()` calls to `entry()`
- [ ] Update imports to remove `accessor` and `meta`
- [ ] Update type annotations from `Meta.MetaFn` to `Tag.Tag`
- [ ] Rename all `metas` property access to `tags`
- [ ] Rename all `meta:` parameters to `tags:`
- [ ] Run type checking: `pnpm typecheck:full`
- [ ] Run tests to verify behavior: `pnpm test`
- [ ] Update any documentation or comments referencing old APIs

## Compatibility Notes

**No backward compatibility** - This is a breaking change requiring updates:

1. All `metas` property access must change to `tags`
2. All `meta:` parameters must change to `tags:`
3. All `Meta` namespace references must change to `Tag`
4. The `metas` property is no longer checked by tag operations

Migration must be complete - partial migration will result in runtime errors.

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
