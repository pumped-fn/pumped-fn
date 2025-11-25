---
id: c3-107
c3-version: 3
title: Multi-Executor
summary: >
  Keyed executor pools for dynamic instance management.
---

# Multi-Executor

## Overview {#c3-107-overview}
<!-- Keyed pools -->

Multi-executor provides keyed executor pools:

- **Pool** - Collection of executors identified by keys
- **Key validation** - Keys validated via StandardSchema
- **Key transform** - Optional key transformation for storage
- **Pool lifecycle** - Release all instances from a scope

Use cases: per-tenant resources, per-request caches, dynamic service instances.

## Concepts {#c3-107-concepts}

### MultiExecutor

A multi-executor is callable AND an executor:

```typescript
const tenantDb = multi.provide(
  { keySchema: z.string() },
  (tenantId, ctl) => new Database(`tenant_${tenantId}`)
)

// As callable: get executor for key
const db = tenantDb('tenant-123')  // Returns Core.Executor<Database>

// As executor: resolve to get accessor factory
const factory = await scope.resolve(tenantDb)
const accessor = factory('tenant-123')  // Returns Core.Accessor<Database>
```

### Key Processing

1. **Validation** - Key validated against `keySchema`
2. **Transform** - Optional `keyTransform` applied for storage key
3. **Caching** - Same transformed key returns same executor

```typescript
const userCache = multi.provide(
  {
    keySchema: z.object({ userId: z.string(), region: z.string() }),
    keyTransform: (k) => `${k.region}:${k.userId}`  // Storage key
  },
  (key, ctl) => new Cache(key.userId)
)
```

### Pool Management

Each multi-executor maintains a key pool:

| Operation | Description |
|-----------|-------------|
| `multi(key)` | Get or create executor for key |
| `multi.release(scope)` | Release all pool executors from scope |
| `multi.id` | Tag identifying this pool's executors |

## API {#c3-107-api}

### multi.provide

Create multi-executor without dependencies:

```typescript
multi.provide<T, K>(
  option: Multi.Option<K>,
  valueFn: (key: K, controller: Core.Controller) => T | Promise<T>,
  ...tags: Tag.Tagged[]
): Multi.MultiExecutor<T, K>
```

**Option:**

| Field | Type | Description |
|-------|------|-------------|
| `keySchema` | StandardSchemaV1<K> | Schema for key validation |
| `keyTransform?` | (key: K) => unknown | Transform key for storage |

### multi.derive

Create multi-executor with dependencies:

```typescript
multi.derive<T, K, D>(
  option: Multi.DeriveOption<K, D>,
  valueFn: (deps: InferOutput<D>, key: K, controller: Core.Controller) => T,
  ...tags: Tag.Tagged[]
): Multi.MultiExecutor<T, K>
```

**DeriveOption** extends Option with:

| Field | Type | Description |
|-------|------|-------------|
| `dependencies` | D | Executor dependencies |

## Usage Patterns {#c3-107-patterns}

### Per-Tenant Database

```typescript
const tenantDb = multi.provide(
  { keySchema: z.string() },
  (tenantId, ctl) => {
    const conn = new TenantConnection(tenantId)
    ctl.cleanup(() => conn.close())
    return conn
  }
)

// In flow
const db = await scope.resolve(tenantDb('tenant-abc'))
```

### Per-Request Cache

```typescript
const requestCache = multi.provide(
  { keySchema: z.string() },
  (requestId) => new Map<string, unknown>()
)

// Auto-cleanup per request via scope lifecycle
```

### With Dependencies

```typescript
const tenantService = multi.derive(
  {
    keySchema: z.string(),
    dependencies: { config: configExecutor, logger: loggerExecutor }
  },
  ({ config, logger }, tenantId, ctl) => {
    return new TenantService(tenantId, config, logger)
  }
)
```

## Pool Lifecycle {#c3-107-lifecycle}

### Creation

Executors are created lazily:
1. `multi(key)` called
2. Key validated and transformed
3. If not in pool, create new executor
4. Return executor (cached for future calls)

### Release

```typescript
await tenantDb.release(scope)  // Release all tenant connections
```

- Finds all pool executors resolved in scope
- Calls `scope.release()` on each
- Runs cleanup functions

### Pool Identification

Each pool has a unique tag:

```typescript
const poolTag = tenantDb.id  // Tag identifying pool executors
```

All executors in the pool carry this tag.

## Source Files {#c3-107-source}

| File | Contents |
|------|----------|
| `multi.ts` | MultiExecutorImpl, provide(), derive() |
| `types.ts` | Multi namespace (MultiExecutor, Key, Option, DeriveOption) |

## Testing {#c3-107-testing}

Primary tests: `index.test.ts` - "Multi-Executor" describe block

Key test scenarios:
- multi.provide() creates keyed pools
- multi.derive() with dependencies
- Key caching (same key = same instance)
- Release mechanics via accessor.release()
- Integration with scope lifecycle and cleanup
