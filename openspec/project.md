# Project Context

## Purpose

pumped-fn is a lightweight TypeScript effect system that provides:
- Scope-based dependency injection with automatic lifecycle management
- Flow execution patterns for request/response handling
- Tag-based metadata system for cross-cutting concerns
- Extension hooks for observability and behavior modification
- Controller-based reactivity for state observation

The library is designed to be framework-agnostic with zero runtime dependencies.

## Tech Stack

- **Language**: TypeScript 5.x
- **Build**: Vite, Rollup (via tsup)
- **Testing**: Vitest
- **Package Manager**: pnpm (monorepo)
- **Versioning**: Changesets for semantic versioning
- **Documentation**: VitePress (docs site), C3 Architecture Docs (.c3/)
- **Diagrams**: Mermaid

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| @pumped-fn/lite | 1.5.0 | Core library - lightweight DI with minimal reactivity (atoms, flows, tags, controllers) |
| @pumped-fn/react-lite | 0.3.0 | Minimal React bindings with Suspense and useSyncExternalStore |
| @pumped-fn/devtools | 0.1.0 | Observability extension with fire-and-forget transports |
| @pumped-fn/vite-hmr | 0.1.0 | Build-time Vite plugin preserving atom state across HMR reloads |

## Project Conventions

### Code Style

- Zero external runtime dependencies in core packages
- TypeScript strict mode
- Type inference preferred over explicit annotations where possible
- Factory functions for creating primitives (atom, flow, tag, service)

### Architecture Patterns

- **C3 Documentation**: Architecture is documented using C3 (Context/Container/Component) methodology in `.c3/`
- **Extension System**: Cross-cutting behavior via Extension interface with `wrapResolve` and `wrapExec` hooks
- **Tag-Based Metadata**: Tags for metadata propagation with `required`, `optional`, `all` extraction modes
- **Controller Reactivity**: Atoms can self-invalidate; listeners subscribe with event filtering (`resolved`, `resolving`, `*`)
- **Scope Lifecycle**: Hierarchical scopes with cleanup cascading

### Core Concepts

| Concept | Description | Lifetime |
|---------|-------------|----------|
| Atom | Long-lived dependency definition with factory function | Scope lifetime |
| Flow | Short-lived request/response execution pattern | Single execution |
| Tag | Metadata attachment and extraction | Attached to atoms/flows |
| Scope | DI container with resolution caching | Application/request lifetime |
| Controller | Reactive state observation pattern | Scope lifetime |
| Service | Context-aware method containers | Scope lifetime |
| Preset | Value injection and atom redirection for testing | Scope creation |

### Testing Strategy

- **Unit tests**: Individual module behavior using Vitest
- **Behavior tests**: Integration scenarios
- **Type tests**: TypeScript inference verification
- Per-package testing via public APIs
- Run all tests: `pnpm test`
- Typecheck: `pnpm typecheck`

### Git Workflow

- Main branch: `main`
- Feature branches for development
- Changesets for version management
- Automated changelog generation
- npm publishing via changesets

## Domain Context

### Key Abstractions

- **Atom**: Think of it as a lazily-evaluated, cached, reactive singleton within a scope
- **Flow**: Think of it as a typed request handler with dependency injection
- **Scope**: Think of it as a DI container that tracks what's been resolved and their cleanup functions
- **Controller**: Think of it as a subscription mechanism for atom state changes

### Resolution Flow

1. `scope.resolve(atom)` checks cache
2. If not cached, factory runs with ResolveContext
3. Dependencies resolved recursively
4. Result cached for scope lifetime
5. Cleanup registered for disposal

### Invalidation Chain

When an atom invalidates:
1. Sequential (not parallel) invalidation
2. Dependents notified in order
3. Loop detection prevents infinite cycles
4. Listeners called with state filter

## Important Constraints

- Zero runtime dependencies for @pumped-fn/lite
- Framework-agnostic design
- No AsyncLocalStorage dependency for concurrent safety
- React 18+ for react-lite (useSyncExternalStore requirement)
- SSR compatibility required for react-lite

## External Dependencies

- **npm registry**: Package distribution
- **GitHub**: Source control and CI/CD
- **BroadcastChannel/WebSocket**: Devtools transport options (optional)

## Architecture Documentation

This project uses C3 (Context/Container/Component) methodology for architecture documentation. The `.c3/` directory contains:

- `README.md` - System overview (Context level)
- `c3-2-lite/` - @pumped-fn/lite container docs
- `c3-3-react-lite/` - @pumped-fn/react-lite container docs
- `c3-4-devtools/` - @pumped-fn/devtools container docs
- `c3-5-vite-hmr/` - @pumped-fn/vite-hmr container docs
- `adr/` - Architecture Decision Records (to be migrated to OpenSpec)

## ADR Migration

The following ADRs from `.c3/adr/` are being migrated to OpenSpec specs:

| ADR | Status | Topic |
|-----|--------|-------|
| ADR-001 | Accepted | ExecutionContext close() lifecycle |
| ADR-002 | Accepted | Lightweight lite package design |
| ADR-003 | Accepted | Controller-based reactivity |
| ADR-004 | Accepted | C3 documentation structure |
| ADR-005 | Accepted | Parser functions for validation |
| ADR-006 | Accepted | Fine-grained reactivity with select() |
| ADR-007 | Accepted | Per-atom private storage (ctx.data) |
| ADR-008 | Accepted | Synchronous createScope |
| ADR-009 | Accepted | Fix duplicate listener notifications |
| ADR-010 | Accepted | Tag-based typed DataStore |
| ADR-011 | Accepted | Sequential invalidation chain |
| ADR-012 | Accepted | DataStore API improvements |
| ADR-013 | Proposed | Controller.set() and update() |
| ADR-014 | Proposed | DataStore Map-like semantics |
| ADR-015 | Proposed | Devtools integration |
| ADR-016 | Accepted | Hierarchical ExecutionContext |

## Verification Commands

```bash
# Build all packages
pnpm build

# Run all tests
pnpm test

# Type checking
pnpm typecheck

# Full verification
pnpm verify

# Release flow
pnpm release
```
