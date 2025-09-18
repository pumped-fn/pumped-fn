# @pumped-fn/core-next Documentation Index

_Expert-level documentation for context engineering and component development_

---

## Document Organization

### Core Library Documentation

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
- Plugin integration

**Use When**: Implementing business processes, API handlers, validation-heavy operations

#### [**meta.md**](./meta.md) - Metadata System
**Primary Context**: Typed metadata decoration without logic inference
- Meta creation and query patterns
- Integration with executors and flows
- Plugin configuration via meta
- Domain-specific metadata design

**Use When**: Building plugins, adding debugging information, configuration management

#### [**authoring.md**](./authoring.md) - Component Creation Guide
**Primary Context**: Reusable, configurable component patterns via dependency graphs
- **Graph Configuration Strategies**: Late binding and strategic injection points
- **Multi-Environment Graph Variations**: Same structure, different configurations
- **Component Graph Composition**: Building complex dependency hierarchies
- **Graph-Based Testing**: Mock injection and configuration isolation

**Use When**: Building reusable component libraries, implementing configuration systems, creating testable architectures

#### [**plugin.md**](./plugin.md) - Plugin Development
**Primary Context**: Extending dependency graph functionality and flow execution
- **Graph-Aware Plugins**: Hook into dependency resolution lifecycle
- **Graph Telemetry**: Monitor resolution performance and cache efficiency
- **Graph Debugging**: Inspect dependency chains and resolution paths
- **Graph Composition**: Plugin interaction with dependency hierarchies

**Use When**: Building observability tools, implementing cross-cutting concerns, creating development utilities

---

## Context Navigation Strategy

### Context Loading Strategy

| Task | Primary Document | Supporting Documents | Context Size |
|------|------------------|---------------------|----------------|
| **Build Applications** | [llm.md](./llm.md) | authoring.md | High (497 lines) |
| **Business Logic** | [flow.md](./flow.md) | llm.md, plugin.md | Medium (252 lines) |
| **Reusable Components** | [authoring.md](./authoring.md) | llm.md, meta.md | High (400+ lines) |
| **Plugin Development** | [plugin.md](./plugin.md) | llm.md, meta.md | Medium (200+ lines) |
| **Metadata Systems** | [meta.md](./meta.md) | plugin.md | Medium (411 lines) |

**Loading Strategy**: Start with primary document for deep context, then add supporting documents only when needed for cross-system integration.

---

## Quick Reference Maps

### API Quick Access

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

// Plugins (plugin.md)
Core.Plugin: { wrap(next, context) => Promise<T> }, Flow.Plugin: { name, wrap, init }

// Authoring (authoring.md)
preset(config, values), createScope({ initialValues: [...presets] })
```

### Common Task Mapping

| Task | Primary Document | Supporting Documents |
|------|------------------|---------------------|
| Create app structure | llm.md | authoring.md |
| Build API handlers | flow.md | llm.md, plugin.md |
| Design reusable components | authoring.md | llm.md, meta.md |
| Add monitoring/logging | plugin.md | meta.md |
| Configure for different environments | authoring.md | llm.md |
| Test business logic | flow.md | authoring.md |
| Debug dependency issues | llm.md | plugin.md |
| Create custom validation | flow.md | meta.md |

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

**Document Dependencies**: llm.md (core) → flow.md, authoring.md, plugin.md → meta.md (cross-cutting)

**Integration Points**: authoring.md uses llm.md presets; plugin.md extends flow.md; meta.md decorates all types

This index ensures optimal context loading while maintaining expert-level depth across all pumped-fn development scenarios.