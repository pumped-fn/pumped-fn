# Pattern Catalog

Real-world implementation patterns with complete examples, trade-offs, and best practices.

## Quick Navigation

| I need to...                    | Use this pattern                                        |
|---------------------------------|---------------------------------------------------------|
| **Build HTTP/REST API**         | [HTTP Server Setup](./http-server-setup.md)             |
| **Test with mocks**             | [Testing Strategies](./testing-strategies.md)           |
| **Handle database transactions**| [Database Transactions](./database-transactions.md)     |
| **Add logging/tracing/auth**    | [Middleware Composition](./middleware-composition.md)   |

---

## Available Patterns

### Application Infrastructure
- [HTTP Server Setup](./http-server-setup.md) - Complete server lifecycle with graceful shutdown
- [Database Transactions](./database-transactions.md) - Transaction-per-flow pattern with rollback

### Development & Testing
- [Testing Strategies](./testing-strategies.md) - Graph-based testing with presets and mocks

### Cross-Cutting Concerns
- [Middleware Composition](./middleware-composition.md) - Extension pipelines for logging, tracing, auth

---

## See Also

- [API Cheatsheet](../reference/api-cheatsheet.md) - Quick API reference
- [Core Guides](../guides/) - Learn fundamental concepts
- [Common Mistakes](../reference/common-mistakes.md) - Anti-patterns to avoid
