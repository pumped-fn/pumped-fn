# Installation

## Package Overview

Pumped Fn consists of several packages:

- `@pumped-fn/core-next` - Core functionality (executors, scopes, reactive patterns)
- `@pumped-fn/react` - React integration (hooks, components)
- `@pumped-fn/extra` - Additional utilities for full-stack applications

## Installation

### For React Applications

Most React applications need both the core package and React bindings:

```bash
npm install @pumped-fn/core-next @pumped-fn/react
```

Or with pnpm:

```bash
pnpm add @pumped-fn/core-next @pumped-fn/react
```

Or with yarn:

```bash
yarn add @pumped-fn/core-next @pumped-fn/react
```

### Core Only

If you're building a non-React application or want just the core functionality:

```bash
npm install @pumped-fn/core-next
```

### Full Stack Features

For additional full-stack utilities:

```bash
npm install @pumped-fn/extra
```

## TypeScript Support

Pumped Fn is built with TypeScript and provides excellent type safety out of the box. No additional type packages are needed.

## Peer Dependencies

The React package has peer dependencies on:
- `react` ^18.0.0 || ^19.0.0
- `@pumped-fn/core-next` ^0.5.40

Make sure these are installed in your project.

## Verification

Verify your installation by importing the main functions:

```typescript
import { provide, derive, createScope } from '@pumped-fn/core-next';
import { useResolves, ScopeProvider } from '@pumped-fn/react';

console.log('Pumped Fn installed successfully!');
```

## Next Steps

Now that you have Pumped Fn installed, let's create your first application with our [Quick Start](./quick-start.md) guide!