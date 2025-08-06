# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a monorepo for the Pumped Functions library, a TypeScript functional programming library providing container-based dependency injection and reactive programming patterns.

### Critical Directory Structure
```
/
├── packages/
│   ├── next/          - Core library (@pumped-fn/core-next) [📋 packages/next/CLAUDE.md]
│   ├── react/         - React bindings (@pumped-fn/react) [📋 packages/react/CLAUDE.md]
│   ├── extra/         - Full-stack utilities (@pumped-fn/extra) [📋 packages/extra/CLAUDE.md]
│   └── cli/           - CLI tool (@pumped-fn/cli) [📋 packages/cli/CLAUDE.md]
├── docs/              - Documentation site [📋 docs/CLAUDE.md]
├── examples/          - Usage examples [📋 examples/CLAUDE.md]
└── tests/             - Cross-package integration tests
```

**📋 Legend**: [📋 path/CLAUDE.md] indicates detailed technical context is available in that file.

### When to Use Sub-CLAUDE.md Files

- **packages/next/CLAUDE.md**: Working with core executors, scopes, dependency resolution, reactive patterns
- **packages/react/CLAUDE.md**: React hooks, components, integration patterns, React-specific state management  
- **packages/extra/CLAUDE.md**: Full-stack patterns, client/server utilities, API definitions, telemetry
- **packages/cli/CLAUDE.md**: AST analysis, dependency graph visualization, CLI commands, image generation
- **docs/CLAUDE.md**: Documentation structure, content organization, Next.js documentation site
- **examples/CLAUDE.md**: Example applications, usage patterns, demo implementations

### Core Architecture Concepts

- **Executors**: Containers holding values with dependency resolution (`provide`, `derive`)
- **Scopes**: Lazy resolution contexts managing executor lifecycles (`createScope`)
- **Reactive Programming**: Executors trigger updates when dependencies change (`.reactive`)
- **Meta System**: Type-safe decorative information using StandardSchema (`meta()`)
- **Container Types**: Static, Lazy, Reactive executor variants

## Quick Reference - Common APIs

### Core Executors (`@pumped-fn/core-next`)
- `provide(factory, ...metas)` - Create executor with no dependencies
- `derive(deps, factory, ...metas)` - Create executor with dependencies
- `createScope(...presets)` - Create resolution scope
- `executor.reactive` - Get reactive variant of executor
- `executor.lazy` - Get lazy variant of executor
- `executor.static` - Get static variant of executor

### React Integration (`@pumped-fn/react`)
- `useResolves(...executors)` - Resolve multiple executors in React
- `useResolve(executor, selector)` - Resolve with selector function
- `useUpdate(executor)` - Get update function for executor
- `ScopeProvider` - Provide scope context to React tree
- `<Resolves e={executors}>{values => ...}</Resolves>` - Render prop component

### Full-Stack Utilities (`@pumped-fn/extra`)
- `define.api(spec)` - Define API with input/output schemas
- Client/server utilities for RPC patterns
- Telemetry and logging utilities

## Common Commands

### Development Workflow
```bash
# Install dependencies
pnpm install

# Build all packages (order matters - core first)
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

### Package-Specific Commands
```bash
# Work with individual packages
cd packages/{next|react|extra|cli}

# Build specific package
pnpm build

# Test with watch mode
pnpm test:watch

# Run specific package tests
pnpm test
```

### Documentation & Release
```bash
# Documentation development
pnpm docs:dev

# Release processes  
pnpm release:patch  # Patch version bump
pnpm release:minor  # Minor version bump
```

## Technical Standards

### Testing Framework
- **Vitest** across all packages with consistent configuration
- **@testing-library/react** for React component testing  
- Tests in `tests/` or `test/` directories within each package
- Use `pnpm test` from root or `pnpm test:watch` for individual packages

### Code Standards
- **TypeScript**: Strict settings, ESM modules throughout
- **Biome**: Code formatting (linting disabled)
- **Node 18+**: Minimum runtime requirement
- **Functional Programming**: Core design philosophy
- **StandardSchema**: Type validation in meta system

### File Conventions
- `src/index.ts` - Main package exports
- `src/types.ts` - Core type definitions
- `tests/*.test.ts` - Test files using Vitest
- `package.json` - Contains build/test scripts per package

## Documentation Strategy

### Content Plan Tracking
**IMPORTANT**: Documentation redesign is in progress based on developer relations expert feedback.

Current status tracked in: **`.claude_artifacts/content_plan.md`**

**Key Issues Identified**:
- Documentation suffers from "does everything" syndrome
- Information overload prevents developer adoption
- No clear competitive positioning or value proposition
- Need to focus on single primary use case

**When working on documentation**:
1. ✅ Check `.claude_artifacts/content_plan.md` for current priorities
2. ✅ Follow progressive disclosure principles (simple → complex)
3. ✅ Focus on single use case (dependency injection OR reactive state, not both)
4. ✅ Include competitive comparisons and address adoption barriers
5. ✅ Update checkboxes in content plan as work progresses

**Next Major Updates**:
- Hero section rewrite with concrete problem/solution
- Choose primary use case focus (DI vs reactive state)
- Create comparison page vs existing solutions
- Add FAQ addressing developer concerns
