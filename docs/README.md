# Documentation

Graph-based dependency injection with complete type inference.

## Getting Started

1. **[Executors and Dependencies](./guides/01-executors-and-dependencies.md)** - Create executors with `provide()` and `derive()`
2. **[Tags: The Type System](./guides/02-tags-the-type-system.md)** - Type-safe runtime data access
3. **[Scope Lifecycle](./guides/03-scope-lifecycle.md)** - Manage long-running resources
4. **[Type Inference Patterns](./guides/04-type-inference-patterns.md)** - Zero-annotation TypeScript

## Core Concepts

### Guides
- [Executors and Dependencies](./guides/01-executors-and-dependencies.md)
- [Tags: The Type System](./guides/02-tags-the-type-system.md)
- [Scope Lifecycle](./guides/03-scope-lifecycle.md)
- [Type Inference Patterns](./guides/04-type-inference-patterns.md)
- [Flow Basics](./guides/05-flow-basics.md)
- [Flow Composition](./guides/06-flow-composition.md)
- [Promised API](./guides/07-promised-api.md)
- [Reactive Patterns](./guides/08-reactive-patterns.md)
- [Extensions](./guides/09-extensions.md)
- [Error Handling](./guides/10-error-handling.md)

### Patterns
- [HTTP Server Setup](./patterns/http-server-setup.md)
- [Database Transactions](./patterns/database-transactions.md)
- [Testing Strategies](./patterns/testing-strategies.md)
- [Middleware Composition](./patterns/middleware-composition.md)

### Reference
- [API Cheatsheet](./reference/api-cheatsheet.md)
- [Type Verification](./reference/type-verification.md)
- [Common Mistakes](./reference/common-mistakes.md)
- [Error Solutions](./reference/error-solutions.md)

## Philosophy

**Tags provide type safety. Inference provides ergonomics.**

- All typed runtime data flows through tags
- 99% type inference - zero annotations
- Verified with `tsc --noEmit` on all examples

## Examples

Working examples in `examples/http-server/`:
- Basic handlers with executors
- Tag-based type safety
- Type inference patterns
- Promised API usage
- Complete HTTP server

## Quick Example

```typescript
import { provide, derive, createScope, tag, custom } from '@pumped-fn/core-next'

// Tags for type-safe config
const appConfig = tag(custom<{ port: number }>(), { label: 'app.config' })

// Executors with dependencies
const config = provide(() => ({ port: 3000 }))
const db = derive(config, (cfg) => createConnection(cfg))
const userService = derive({ db, config }, ({ db, config }) => ({
  getUser: (id: string) => db.query('...')
}))

// Resolve in scope
const scope = createScope()
const service = await scope.resolve(userService)
const user = await service.getUser('123')
await scope.dispose()
```

## Verification

All documentation examples are verified:

```bash
pnpm -F @pumped-fn/core-next typecheck:full
```

Zero TypeScript errors, no type assertions, complete inference.
