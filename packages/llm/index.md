# @pumped-fn/core-next Documentation Index

_Expert-level documentation for context engineering and component development_

---

# Coding style to strictly follow
- strictly no type of any. Type casting is normally caused by missing of some type definitions. Design the type in layers so that won't happen
- *ALWAYS* make sure typecheck passed. If there's no typecheck instruction, install typescript in the closest package.json as dev dependency and run `<package manager to detect> tsc --noEmit`
- *ALWAYS* make typecheck passed for both code and tests. Need to inspect the tsconfig.json upfront to understand of the file coverages
- *ALWAYS* ignore extension import for .ts and .js
- Strictly no comments in code. Make the name of variables meaningful so it won't impact the readability
- *ALWAYS* put testability in mind on composing code. Focus on integration layers so we will not be overwhelmed by too small components
- *ALWAYS* wrap nodesdk/browser usage in `provide` and extract only the material that we actually use. For example, `fetch` is built-in, wrapping fetch into provide and reexporting it gives us ability to mock by using `preset`. Or `node:fs` is node sdk library, but we use very limited amount of fs, as such, it's easier to wrap and expose the function that we used, rather than everything

## Document Organization

### Core Library Documentation

#### [**api.md**](./api.md) - Complete API Reference
**Primary Context**: Comprehensive API surface for LLM discovery
- **All Public APIs**: Complete listing of exported functions, classes, and types
- **Type Signatures**: Full type definitions for all APIs
- **Import Paths**: Exact module imports for each API
- **Quick Discovery**: Task-based and pattern-based API lookup
- **Error System**: All error classes and utilities
- **Extension Points**: Complete extension interface documentation

**Use When**: Discovering available APIs, understanding type signatures, finding specific functions, API-first development

#### [**llm.md**](./llm.md) - Core Library Reference
**Primary Context**: Graph-based dependency resolution system that surpasses traditional DI
- **Dependency Graph Orchestration**: Automatic resolution ordering vs manual wiring
- **Graph Traversal Patterns**: Depth-first resolution with intelligent caching
- **Reactive Graph Updates**: Updates propagate through dependency edges
- **Graph Lifecycle Management**: Scope creation, resolution, and cleanup phases
- **Testing with Graph Substitution**: Strategic preset injection into dependency nodes

**Use When**: Understanding graph-centric architecture, implementing dependency resolution, optimizing application structure

#### [**flow.md**](./flow.md) - Business Logic Flows
**Primary Context**: Structured business logic with validation
- Input/output validation using StandardSchema
- Flow definition and handlers
- Context management and execution
- Nested and parallel flow patterns
- Extension integration

**Use When**: Implementing business processes, API handlers, validation-heavy operations

#### [**meta.md**](./meta.md) - Metadata System
**Primary Context**: Typed metadata decoration without logic inference
- Meta creation and query patterns
- Integration with executors and flows
- Extension configuration via meta
- Domain-specific metadata design

**Use When**: Building plugins, adding debugging information, configuration management

#### [**accessor.md**](./accessor.md) - Type-Safe Data Access
**Primary Context**: Type-safe key-value storage with schema validation
- DataStore pattern for Map-like structures
- Integration with Flow contexts and Meta containers
- Schema validation on read/write operations
- Default value support with AccessorWithDefault
- Symbol-based key management for conflict avoidance

**Use When**: Managing context data, flow execution state, extension data storage, configuration access, Map-like data structures

#### [**authoring.md**](./authoring.md) - Reusable services/reusable components
**Primary Context**: Reusable, configurable component patterns via dependency graphs
- **Graph Configuration Strategies**: Late binding and strategic injection points
- **Multi-Environment Graph Variations**: Same structure, different configurations
- **Component Graph Composition**: Building complex dependency hierarchies
- **Graph-Based Testing**: Mock injection and configuration isolation

**Use When**: Building reusable component, services libraries, implementing configuration systems, creating testable architectures

#### [**extension.md**](./extension.md) - Extension Development
**Primary Context**: Extending dependency graph functionality and flow execution
- **Graph-Aware Extensions**: Hook into dependency resolution lifecycle
- **Graph Telemetry**: Monitor resolution performance and cache efficiency
- **Graph Debugging**: Inspect dependency chains and resolution paths
- **Graph Composition**: Extension interaction with dependency hierarchies

**Use When**: Needs cross-cut, repeatable use, verbosity cut, sysmatic enforcement component, non user-input like component (like healthcheck, devtools, observability etc), those components should not impact how user write the business units

---

## Context Navigation Strategy

### Context Loading Strategy

| Task | Primary Document | Supporting Documents | Context Size |
|------|------------------|---------------------|----------------|
| **API Discovery** | [api.md](./api.md) | - | High (600+ lines) |
| **Build Applications** | [llm.md](./llm.md) | authoring.md, api.md | High (497 lines) |
| **Business Logic** | [flow.md](./flow.md) | llm.md, extension.md, accessor.md, api.md | Medium (252 lines) |
| **Reusable Components** | [authoring.md](./authoring.md) | llm.md, meta.md, api.md | High (400+ lines) |
| **Extension Development** | [extension.md](./extension.md) | llm.md, meta.md, accessor.md, api.md | Medium (200+ lines) |
| **Metadata Systems** | [meta.md](./meta.md) | extension.md, accessor.md, api.md | Medium (411 lines) |
| **Data Access** | [accessor.md](./accessor.md) | flow.md, meta.md, api.md | High (450+ lines) |

**Loading Strategy**: Start with primary document for deep context, then add supporting documents only when needed for cross-system integration.

---

## Quick Reference Maps

### API Quick Access

**For comprehensive API documentation with all type signatures and imports, see [api.md](./api.md)**

#### Quick Reference
```typescript
// Core (llm.md)
provide(() => value), derive([deps], ([d]) => result), createScope(), preset(executor, value)
executor.reactive, executor.static, scope.resolve(), scope.update(), scope.dispose()

// Flows (flow.md)
flow.define({ input, success, error }), flow.handler(deps, handler), flow.execute()
ctx.ok(data), ctx.ko(error), ctx.execute(subflow, input)

// Meta (meta.md)
meta(key, schema), meta.find(source), meta.get(source)

// Accessor (accessor.md)
accessor(key, schema), accessor(key, schema, default), accessor.get(source), accessor.set(source, value)
accessor.find(source), accessor.preset(value)

// Extensions (extension.md)
Extension.Extension: { name, wrapResolve, wrapExecute, init, initPod }

// Authoring (authoring.md)
meta(key, schema), createScope({ meta: [...metas] }), configMeta.get(ctl.scope)
```

### Common Task Mapping

| Task | Primary Document | Supporting Documents |
|------|------------------|---------------------|
| Discover all APIs | api.md | - |
| Find specific function | api.md | relevant concept doc |
| Create app structure | llm.md | authoring.md, api.md |
| Build API handlers | flow.md | llm.md, extension.md, accessor.md, api.md |
| Design reusable components | authoring.md | llm.md, meta.md, api.md |
| Add monitoring/logging | extension.md | meta.md, accessor.md, api.md |
| Configure for different environments | authoring.md | llm.md, api.md |
| Test business logic | flow.md | authoring.md, accessor.md, api.md |
| Debug dependency issues | llm.md | extension.md, api.md |
| Create custom validation | flow.md | meta.md, api.md |
| Manage context data | accessor.md | flow.md, extension.md, api.md |
| Access Map-like data structures | accessor.md | flow.md, api.md |

---

## Context Engineering Guidelines

### Single Document Context (Recommended)
**When to use**: Understanding specific concepts, implementing focused features
**Benefits**: Deep context, no cognitive load from other concepts
**Strategy**: Load one document fully, refer to index for cross-references

### Multi-Document Context (Advanced)
**When to use**: Complex integrations, full-stack implementations
**Benefits**: Complete understanding across subsystems
**Strategy**: Load related documents in sequence, starting with primary context

### Reference Context (Expert)
**When to use**: API lookups, pattern verification, debugging
**Benefits**: Quick access to specific information
**Strategy**: Use quick reference maps and targeted document sections

**Context Tips**: Start narrow with task-specific document → Add supporting docs only for integration → Use index to prevent overflow

---

## Document Relationships

**Document Dependencies**: api.md (reference) + llm.md (core) → flow.md, authoring.md, extension.md → meta.md (cross-cutting)

**Integration Points**: api.md provides complete reference; authoring.md uses llm.md executors with meta.md configuration; extension.md extends flow.md; meta.md decorates all types

This index ensures optimal context loading while maintaining expert-level depth across all pumped-fn development scenarios.