# Documentation

Graph-based dependency injection with complete type inference.

**Quick Navigation:** [API Reference](#reference) · [Getting Started](#getting-started) · [Core Guides](#core-guides) · [Patterns](#patterns)

---

## Quick Start

| If you want to...             | Start here                                                    |
|-------------------------------|---------------------------------------------------------------|
| **Learn the basics**          | [Getting Started](#getting-started) (read in order 1-4)       |
| **Find API syntax**           | [API Cheatsheet](./reference/api-cheatsheet.md)               |
| **Build HTTP server**         | [HTTP Server Setup](./patterns/http-server-setup.md)          |
| **Test with mocks**           | [Testing Strategies](./patterns/testing-strategies.md)        |
| **Add logging/tracing**       | [Extensions](./guides/09-extensions.md)                       |
| **Handle errors properly**    | [Error Handling](./guides/10-error-handling.md)               |
| **Fix TypeScript errors**     | [Error Solutions](./reference/error-solutions.md)             |

---

## Getting Started

Read these in order to understand core concepts:

1. **[Executors and Dependencies](./guides/01-executors-and-dependencies.md)** - Create executors with `provide()` and `derive()`
2. **[Tags: The Type System](./guides/02-tags-the-type-system.md)** - Type-safe runtime data access
3. **[Scope Lifecycle](./guides/03-scope-lifecycle.md)** - Manage long-running resources
4. **[Type Inference Patterns](./guides/04-type-inference-patterns.md)** - Zero-annotation TypeScript

## Core Guides

### Fundamentals
- [Executors and Dependencies](./guides/01-executors-and-dependencies.md) - Build dependency graphs
- [Tags: The Type System](./guides/02-tags-the-type-system.md) - Type-safe runtime data
- [Scope Lifecycle](./guides/03-scope-lifecycle.md) - Resource management
- [Type Inference Patterns](./guides/04-type-inference-patterns.md) - Zero-annotation TypeScript

### Advanced
- [Flow](./guides/05-flow.md) - Ephemeral execution contexts
- [Promised API](./guides/07-promised-api.md) - Lazy composition
- [Reactive Patterns](./guides/08-reactive-patterns.md) - Reactive value updates
- [Extensions](./guides/09-extensions.md) - Cross-cutting concerns
- [Error Handling](./guides/10-error-handling.md) - Error boundaries and recovery

---

## Patterns

Real-world implementation patterns:

- [HTTP Server Setup](./patterns/http-server-setup.md) - Complete server lifecycle
- [Database Transactions](./patterns/database-transactions.md) - Transaction-per-flow pattern
- [Testing Strategies](./patterns/testing-strategies.md) - Graph-based testing with presets
- [Middleware Composition](./patterns/middleware-composition.md) - Extension pipelines

---

## Reference

Quick lookups and troubleshooting:

- [API Cheatsheet](./reference/api-cheatsheet.md) - **Quick API reference with decision tree**
- [Common Mistakes](./reference/common-mistakes.md) - Anti-patterns and fixes
- [Error Solutions](./reference/error-solutions.md) - TypeScript error mappings
- [Type Verification](./reference/type-verification.md) - Type safety verification

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
- Flow composition
- Reactive updates
- Extensions and middleware
- Error handling
- Database transactions
- Testing with mocks

## Quick Example

```typescript
import { provide, derive, createScope, tag, custom } from '@pumped-fn/core-next'

const appConfig = tag(custom<{ port: number }>(), { label: 'app.config' })

const config = provide((controller) => appConfig.extractFrom(controller.scope))
const db = derive(config, (cfg) => createConnection(cfg))
const userService = derive({ db, config }, ({ db, config }) => ({
  getUser: (id: string) => db.query('...')
}))

const scope = createScope({
  tags: [appConfig({ port: 3000 })]
})

const service = await scope.resolve(userService)
const user = await service.getUser('123')
await scope.dispose()
```

## Verification

All documentation examples are verified:

```bash
pnpm --filter @pumped-fn/examples typecheck
pnpm docs:build
```

Zero TypeScript errors, no type assertions, complete inference.
