# @pumped-fn/core-next Documentation

_Graph-based dependency injection and orchestration for TypeScript applications_

## 🚀 Quick Start

```typescript
import { provide, derive, createScope } from "@pumped-fn/core-next";

// Define nodes in dependency graph
const config = provide(() => ({ port: 3000 }));
const server = derive([config], ([cfg]) => startServer(cfg.port));

// Resolve graph and run application
const scope = createScope();
await scope.resolve(server); // Automatically resolves config first
```

## 📚 Documentation Structure

### Getting Started

#### [**concepts.md**](./concepts.md) - Core Concepts
Foundation for understanding pumped-fn's dependency graph architecture
- Dependency graph theory and visualization
- Core building blocks (Executors, Flows, Meta, Accessor)
- Graph resolution lifecycle
- Architecture patterns

#### [**api.md**](./api.md) - API Reference
- Complete function signatures and type definitions
- Import paths and module exports
- Available methods and properties

### Building Applications

#### [**configuration.md**](./configuration.md) - Configuration Management
Managing configuration from userland to library components
- Reading from environment, files, CLI
- Transforming to type-safe meta configuration
- Injecting via scope
- Environment-specific configurations

#### [**testing.md**](./testing.md) - Testing Strategies
Graph-aware testing patterns
- Unit testing with presets
- Integration testing approaches
- Configuration testing
- Mock strategies and utilities

#### [**troubleshooting.md**](./troubleshooting.md) - Troubleshooting Guide
Common issues and solutions
- Graph resolution errors
- Reactive update issues
- Memory management
- Performance optimization

### Core Library

#### [**core.md**](./core.md) - Core Dependency System
Core dependency graph system and reactive patterns
- Graph traversal and resolution
- Reactive updates and subscriptions
- Scope and pod lifecycle
- Controller patterns

#### [**flow.md**](./flow.md) - Business Logic
Structured business flows with validation
- Flow definition and handlers
- Context management
- Nested and parallel execution
- Input/output validation

#### [**meta.md**](./meta.md) - Metadata System
Type-safe component decoration
- Meta creation and queries
- Component configuration
- Extension integration

#### [**accessor.md**](./accessor.md) - Data Access
Type-safe runtime data management
- DataStore patterns
- Context data access
- Default value support

#### [**authoring.md**](./authoring.md) - Component Authoring
Building reusable, configurable components
- Meta-based configuration
- Multi-environment support
- Component composition

#### [**extension.md**](./extension.md) - Extensions
Extending framework functionality
- Lifecycle hooks
- Telemetry and monitoring
- Cross-cutting concerns

### Examples

#### [**patterns/examples.md**](./patterns/examples.md) - Production Examples
Complete working implementations
- Order processing with error handling
- Database service patterns
- Telemetry integration
- Application bootstrap
- Testing setups

## 🧭 Quick Navigation

### By Task

| Task | Start With | Also See |
|------|------------|----------|
| **New to pumped-fn** | [concepts.md](./concepts.md) | [api.md](./api.md) |
| **Setting up configuration** | [configuration.md](./configuration.md) | [meta.md](./meta.md) |
| **Writing tests** | [testing.md](./testing.md) | [configuration.md](./configuration.md) |
| **Building services** | [authoring.md](./authoring.md) | [core.md](./core.md) |
| **Implementing business logic** | [flow.md](./flow.md) | [accessor.md](./accessor.md) |
| **Adding monitoring** | [extension.md](./extension.md) | [meta.md](./meta.md) |
| **Looking up APIs** | [api.md](./api.md) | - |

### By Architecture Pattern

| Pattern | Documents |
|---------|-----------|
| **Dependency Injection** | [concepts.md](./concepts.md), [core.md](./core.md) |
| **Configuration Management** | [configuration.md](./configuration.md), [meta.md](./meta.md) |
| **Testing & Mocking** | [testing.md](./testing.md) |
| **Reactive Updates** | [core.md](./core.md) |
| **Business Flows** | [flow.md](./flow.md) |
| **Cross-cutting Concerns** | [extension.md](./extension.md) |

## 🎯 Core Principles

1. **Graph Resolution** - Dependencies form a directed acyclic graph, resolved automatically
2. **Lazy Evaluation** - Nodes execute only when needed
3. **Type Safety** - Full TypeScript inference throughout
4. **Testability** - Easy mocking via presets
5. **No Comments** - Code should be self-documenting through clear naming