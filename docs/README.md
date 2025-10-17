# Pumped-FN Documentation

Documentation optimized for Context7 and human consumption.

## Structure

### Quick Start
- [Quick Start](./quick-start.md) - Get running in 5 minutes

### Decision Guides
"When to use X vs Y" comparisons:
- [Executors vs Flows](./decisions/executors-vs-flows.md)
- [Lazy vs Reactive](./decisions/lazy-vs-reactive.md)
- [Graph Design Principles](./decisions/graph-design.md)
- [Anti-Patterns](./decisions/anti-patterns.md)

### Pattern Catalog
Real scenarios with trade-offs:
- [Testing Strategies](./patterns/testing-strategies.md)
- [Lifecycle Management](./patterns/lifecycle-management.md)
- [Framework Integration](./patterns/framework-integration.md)

### Concept Deep-Dives
- [Executors and Scopes](./concepts/executors-and-scopes.md)
- [Flows](./concepts/flows.md)
- [Extensions](./concepts/extensions.md)
- [Multi-Executors](./concepts/multi-executors.md)
- [Accessors](./concepts/accessors.md)

### Executable Examples
- [Code Examples](./code/) - TypeScript examples validated in CI

### LLM Guide
- [LLM Guide](./llm-guide.md) - Comprehensive guide for AI assistants

## Context7 Integration

This documentation is indexed by Context7. See [context7.json](../context7.json) for configuration.

## Contributing

Keep documentation:
- **Self-contained** - Each page should be understandable independently
- **Concrete** - Include code examples
- **Concise** - Focus on essentials
- **Cross-referenced** - Link to related docs

Code examples in `docs/code/` are validated during build.
