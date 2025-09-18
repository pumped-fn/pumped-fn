# @pumped-fn/core-next

Enhanced function utilities for TypeScript

## Installation

```bash
npm install @pumped-fn/core-next
```

## Quick Start

```typescript
import { provide, derive, createScope } from '@pumped-fn/core-next';

const config = provide(() => ({ port: 3000 }));
const server = derive([config], ([cfg]) => `Server on ${cfg.port}`);

const scope = createScope();
const result = scope.resolve(server); // "Server on 3000"
```

## Documentation

📚 **[Complete Documentation](./docs/index.md)** - Expert-level documentation for context engineering and component development

The comprehensive documentation includes:
- **Core Library Reference** - Graph-based dependency resolution system
- **Business Logic Flows** - Structured business logic with validation
- **Metadata System** - Typed metadata decoration patterns
- **Component Creation Guide** - Reusable, configurable component patterns
- **Plugin Development** - Extending scope and flow functionality

## License

MIT