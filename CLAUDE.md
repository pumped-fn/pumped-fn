# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a monorepo for the Pumped Functions library, a TypeScript functional programming library providing container-based dependency injection and reactive programming patterns.

### Key Packages
- `packages/next/` - Core library (`@pumped-fn/core-next`) - Main functional utilities including executors, scopes, and reactive programming
- `packages/react/` - React bindings (`@pumped-fn/react`) - React hooks and components for using Pumped Functions
- `packages/extra/` - Additional utilities (`@pumped-fn/extra`) - Full-stack application utilities with client/server exports
- `packages/cli/` - CLI tool (`@pumped-fn/cli`) - Command-line tool for analyzing and visualizing dependency graphs
- `docs/` - Docusaurus documentation site
- `examples/react/` - React example application demonstrating usage

### Architecture Overview

The library is built around these core concepts:
- **Executors**: Containers that hold values and define how dependencies are resolved
- **Scopes**: Lazy resolution contexts that manage executor lifecycles
- **Reactive Programming**: Executors can be reactive, triggering updates when dependencies change
- **Meta System**: Decorative information system using StandardSchema for type enforcement

## Common Commands

### Development
```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests across all packages
pnpm test

# Type check all packages
pnpm typecheck

# Format code (uses Biome)
npx biome format --write .

# Full verification pipeline
pnpm verify
```

### Working with Individual Packages
```bash
# Build specific package
cd packages/next && pnpm build
cd packages/react && pnpm build
cd packages/extra && pnpm build
cd packages/cli && pnpm build

# Test specific package
cd packages/next && pnpm test
cd packages/react && pnpm test
cd packages/extra && pnpm test
cd packages/cli && pnpm test

# Watch mode testing
cd packages/next && pnpm test:watch
cd packages/react && pnpm test:watch
cd packages/extra && pnpm test:watch
cd packages/cli && pnpm test:watch
```

### Documentation
```bash
# Run docs locally
pnpm docs:dev

# Build docs
pnpm docs:build
```

### Release Process
```bash
# Patch release for both core and react
pnpm release:patch

# Minor release for both core and react
pnpm release:minor
```

## Testing

- Uses **Vitest** for testing across all packages
- React package uses **@testing-library/react** for component testing
- Tests are located in `tests/` or `test/` directories within each package
- Run `pnpm test` from root to run all tests, or `pnpm test:watch` for individual packages

## Code Standards

- **TypeScript**: All packages use TypeScript with strict settings
- **Biome**: Code formatting and linting (linter currently disabled)
- **ESM**: All packages use ES modules
- **Node 18+**: Required runtime version
- The library emphasizes functional programming patterns and type safety
- Meta system integration requires StandardSchema-compatible validation libraries

## Key Files to Understand

- `packages/next/src/executor.ts` - Core executor implementation
- `packages/next/src/scope.ts` - Scope management and resolution
- `packages/next/src/meta.ts` - Meta system for decorative information
- `packages/react/src/index.tsx` - React hooks and bindings
- `packages/extra/src/` - Additional utilities for full-stack development
- `packages/cli/src/ast-analyzer.ts` - TypeScript AST analysis for dependency graph extraction
- `packages/cli/src/cli.ts` - Main CLI interface and commands
- `packages/cli/src/mermaid-generator.ts` - Mermaid diagram generation
- `packages/cli/src/image-generator.ts` - Image export functionality using Puppeteer

## CLI Package (@pumped-fn/cli)

The CLI package provides tools for analyzing and visualizing pumped-fn dependency graphs.

### CLI Commands

```bash
# Analyze dependency graph with TUI output
pumped-dag analyze [path]

# Generate image exports
pumped-dag export [path] <output-file> --format <png|jpg|svg|pdf|webp>

# Validate dependency graph for issues
pumped-dag validate [path]

# Show dependency graph statistics
pumped-dag stats [path]
```

### CLI Development

```bash
# Build CLI
cd packages/cli && pnpm build

# Test CLI locally
node dist/cli.js analyze ./examples/react/src/

# Run CLI tests
cd packages/cli && pnpm test

# Generate test images
node dist/cli.js export ./examples/react/src/ graph.png --format png --theme dark
```

### CLI Features

- **AST Analysis**: Uses TypeScript compiler API to analyze source code
- **Multiple Output Formats**: TUI, Mermaid, HTML, JSON, PNG, JPG, SVG, PDF, WebP
- **Image Generation**: High-quality image export using Puppeteer and Mermaid
- **Complex Graph Support**: Handles sophisticated dependency patterns with cross-references
- **Validation**: Detects circular dependencies, orphaned nodes, and complexity metrics
- **Theming**: Multiple Mermaid themes (default, dark, forest, neutral)
- **Programmatic API**: Can be used as a library in other applications