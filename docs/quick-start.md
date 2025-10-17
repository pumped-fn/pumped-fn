# Quick Start

Get running with Pumped-FN in 5 minutes.

## Installation

```bash
pnpm add @pumped-fn/core-next
```

## Basic Example

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next"

// Simple provider
const config = provide(() => ({ port: 3000 }))

// Derived with dependencies
const server = derive([config], ([cfg]) => ({
  start: () => {
    console.log(`Server starting on port ${cfg.port}`)
  }
}))

// Create scope and resolve
const scope = createScope()
const app = await scope.resolve(server)
app.start()
```

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
