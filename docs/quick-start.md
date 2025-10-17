# Quick Start

Get running with Pumped-FN in 5 minutes.

## Installation

```bash
pnpm add @pumped-fn/core-next
```

## Basic Example

### Simple Provider

<<< @/code/basic-patterns.ts#simple-provider

### Derived with Dependencies

<<< @/code/basic-patterns.ts#derived-with-deps

## Core Concepts

- **Executors** - Nodes in dependency graph (created with `provide` or `derive`)
- **Scope** - Actualizes the graph, manages lifecycle
- **Dependencies** - Explicitly declared in arrays

## Next Steps

- [Decision Guides](./decisions/) - When to use what
- [Pattern Catalog](./patterns/) - Real scenarios with trade-offs
- [Concept Deep-Dives](./concepts/) - Executors, flows, extensions

## Related Examples

See executable examples in [`docs/code/`](./code/) directory.
