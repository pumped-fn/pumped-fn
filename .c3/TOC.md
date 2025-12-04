# C3 Documentation Table of Contents

> **AUTO-GENERATED** - Do not edit manually. Regenerate with: `.c3/scripts/build-toc.sh`
>
> Last generated: 2025-12-04 09:14:38

## Context Level

### [c3-0](./README.md) - pumped-fn System Overview
> Lightweight effect system for TypeScript providing scope-based dependency injection,
flow execution patterns, and metadata tagging.

**Sections**:
- [Overview](#c3-0-overview) - TypeScript effect system for dependency injection and execution orchestration
- [Architecture](#c3-0-architecture) - High-level view of system components
- [Actors](#c3-0-actors) - Who/what interacts with this system
- [Containers](#c3-0-containers) - Separately deployable/publishable units
- [Protocols](#c3-0-protocols) - How containers communicate
- [Cross-Cutting Concerns](#c3-0-cross-cutting) - Decisions that affect multiple containers
- [Deployment](#c3-0-deployment) - How this system is distributed
- [System Testing](#c3-0-testing) - Cross-container testing strategy

---

## Container Level

### [c3-2](./c3-2-lite/) - Lite Library (@pumped-fn/lite)
> Lightweight dependency injection with minimal reactivity - atoms, flows, tags,
and controllers for TypeScript applications with zero external dependencies.

**Sections**:
- [Overview](#c3-2-overview) - Lightweight DI with minimal reactivity
- [Technology Stack](#c3-2-stack) - Runtime and build tooling
- [Component Relationships](#c3-2-relationships) - How internal modules connect
- [Data Flow](#c3-2-data-flow) - Execution sequence
- [Public API](#c3-2-api) - Exported functions and types
- [Source Organization](#c3-2-source) - File structure
- [Components](#c3-2-components) - Component inventory
- [Extension System](#c3-2-extension) - Cross-cutting concern hooks
- [Testing](#c3-2-testing) - Testing strategy
- [Related](#c3-2-related)

---

## Component Level

### Lite Library (@pumped-fn/lite) Components

#### [c3-201](./c3-2-lite/c3-201-scope.md) - Scope & Controller
> Core DI container with resolution caching, lifecycle states, and reactive
Controller pattern for subscribing to atom state changes.

**Sections**:
- [Overview](#c3-201-overview) - Foundation of the DI system
- [Concepts](#c3-201-concepts)
- [Scope API](#c3-201-api)
- [Resolution](#c3-201-resolution)
- [Controller Usage](#c3-201-controller)
- [Select Usage](#c3-201-select)
- [Invalidation](#c3-201-invalidation)
- [Event Listening](#c3-201-events)
- [Cleanup & Disposal](#c3-201-cleanup)
- [Source Files](#c3-201-source)
- [Testing](#c3-201-testing)
- [Related](#c3-201-related)

---

#### [c3-202](./c3-2-lite/c3-202-atom.md) - Atom
> Long-lived dependency definition with factory function, optional dependencies,
and controller dependency helper for reactive patterns.

**Sections**:
- [Overview](#c3-202-overview) - Long-lived dependency definition
- [Concepts](#c3-202-concepts)
- [Creating Atoms](#c3-202-creating)
- [Type Inference](#c3-202-types)
- [Controller Dependency](#c3-202-controller)
- [Cleanup Registration](#c3-202-cleanup)
- [Self-Invalidation](#c3-202-invalidation)
- [Per-Atom Private Storage](#c3-202-data)
- [Type Guard](#c3-202-guards)
- [Source Files](#c3-202-source)
- [Testing](#c3-202-testing)
- [Related](#c3-202-related)

---

#### [c3-203](./c3-2-lite/c3-203-flow.md) - Flow & ExecutionContext
> Short-lived request/response execution pattern with input handling,
context lifecycle, and dependency resolution.

**Sections**:
- [Overview](#c3-203-overview) - Request handling pattern
- [Concepts](#c3-203-concepts)
- [Creating Flows](#c3-203-creating)
- [Executing Flows](#c3-203-executing)
- [ExecutionContext Lifecycle](#c3-203-lifecycle)
- [Nested Execution](#c3-203-nested)
- [Type Safety](#c3-203-types)
- [Type Guard](#c3-203-guards)
- [Common Patterns](#c3-203-patterns)
- [Source Files](#c3-203-source)
- [Testing](#c3-203-testing)
- [Related](#c3-203-related)

---

#### [c3-204](./c3-2-lite/c3-204-tag.md) - Tag System
> Metadata attachment and extraction with required, optional, and collect modes
for cross-cutting data propagation.

**Sections**:
- [Overview](#c3-204-overview) - Metadata attachment and extraction
- [Concepts](#c3-204-concepts)
- [Creating Tags](#c3-204-creating)
- [Tag Extraction Modes](#c3-204-modes)
- [Tag Sources](#c3-204-sources)
- [Direct Tag Methods](#c3-204-methods)
- [Type Inference](#c3-204-types)
- [Type Guards](#c3-204-guards)
- [Common Patterns](#c3-204-patterns)
- [Performance Note](#c3-204-performance)
- [Source Files](#c3-204-source)
- [Testing](#c3-204-testing)
- [Related](#c3-204-related)

---

#### [c3-205](./c3-2-lite/c3-205-preset.md) - Preset
> Value injection and atom redirection for testing and configuration,
allowing factory bypassing or atom substitution at scope creation.

**Sections**:
- [Overview](#c3-205-overview) - Value injection and atom redirection
- [Concepts](#c3-205-concepts)
- [Creating Presets](#c3-205-creating)
- [Using Presets](#c3-205-using)
- [Testing Patterns](#c3-205-patterns)
- [Preset vs Factory Override](#c3-205-comparison)
- [Type Safety](#c3-205-types)
- [Type Guard](#c3-205-guards)
- [Limitations](#c3-205-limitations)
- [Source Files](#c3-205-source)
- [Testing](#c3-205-testing)
- [Related](#c3-205-related)

---

## Architecture Decisions

### [adr-014](./adr/adr-014-datastore-map-semantics.md) - DataStore Map-like Semantics
> Align DataStore with Map semantics - get() always returns T | undefined
(pure lookup), defaults only used by getOrSet() not get().

**Status**: Proposed

**Sections**:
- [Status](#adr-014-status)
- [Problem/Requirement](#adr-014-problem)
- [Exploration Journey](#adr-014-exploration)
- [Solution](#adr-014-solution)
- [Changes Across Layers](#adr-014-changes)
- [Verification](#adr-014-verification)
- [Migration Guide](#adr-014-migration)
- [Related](#adr-014-related)

---

### [adr-013](./adr/adr-013-controller-set-update.md) - Controller.set() and Controller.update() for Direct Value Mutation
> Add set() and update() methods to Controller for pushing values directly
without re-running the factory, enabling external data sources (WebSocket,
etc.) to update atom values reactively while preserving the invalidation queue.

**Status**: Proposed

**Sections**:
- [Status](#adr-013-status)
- [Problem/Requirement](#adr-013-problem)
- [Exploration Journey](#adr-013-exploration)
- [Solution](#adr-013-solution)
- [Changes Across Layers](#adr-013-changes)
- [Direct Value Mutation](#c3-201-set-update)
- [Verification](#adr-013-verification)
- [Related](#adr-013-related)

---

### [ADR-012-datastore-api-improvements](./adr/adr-012-datastore-api-improvements.md) - DataStore API Improvements - Relaxed Signatures and getOrSet
> Fix overly strict has/delete signatures that reject valid Tag types, and add
getOrSet convenience method to eliminate repetitive get-check-set boilerplate.

**Status**: Accepted

**Sections**:
- [Status](#adr-012-status)
- [Problem/Requirement](#adr-012-problem)
- [Exploration Journey](#adr-012-exploration)
- [Solution](#adr-012-solution)
- [Changes Across Layers](#adr-012-changes)
- [Verification](#adr-012-verification)
- [Related](#adr-012-related)

---

### [adr-011](./adr/adr-011-sequential-invalidation-chain.md) - Sequential Invalidation Chain with Loop Detection
> Replace parallel fire-and-forget invalidation with sequential awaited chain,
add infinite loop detection, and guarantee deterministic frame control.

**Status**: Accepted

**Sections**:
- [Status](#adr-011-status)
- [Problem/Requirement](#adr-011-problem)
- [Exploration Journey](#adr-011-exploration)
- [Solution](#adr-011-solution)
- [Changes Across Layers](#adr-011-changes)
- [Verification](#adr-011-verification)
- [Related](#adr-011-related)

---

### [ADR-010-typed-data-store](./adr/adr-010-typed-data-store.md) - Tag-based Typed DataStore API for ctx.data
> Replace Map<string, unknown> with typed DataStore interface using Tag as
keys for compile-time type safety, consistent API with existing tag system,
and default value support.

**Status**: Accepted

**Sections**:
- [Status](#adr-010-status)
- [Problem/Requirement](#adr-010-problem)
- [Exploration Journey](#adr-010-exploration)
- [Solution](#adr-010-solution)
- [Changes Across Layers](#adr-010-changes)
- [Verification](#adr-010-verification)
- [Migration Guide](#adr-010-migration)
- [Related](#adr-010-related)

---

### [ADR-009-fix-duplicate-listener-notifications](./adr/adr-009-fix-duplicate-listener-notifications.md) - Fix Duplicate Listener Notifications and Improve Controller.on() API
> Fix bug where Controller.on() listeners are called 3 times per invalidation
cycle, and improve API to allow filtering by state ('resolving', 'resolved', '*').

**Status**: Accepted

**Sections**:
- [Status](#adr-009-status)
- [Problem/Requirement](#adr-009-problem)
- [Exploration Journey](#adr-009-exploration)
- [Solution](#adr-009-solution)
- [Changes Across Layers](#adr-009-changes)
- [Implementation](#adr-009-implementation)
- [Verification](#adr-009-verification)
- [Test Cases](#adr-009-test)
- [Related](#adr-009-related)

---

### [ADR-008-sync-create-scope](./adr/adr-008-sync-create-scope.md) - Synchronous createScope with Ready Promise
> Change createScope() from async function to sync function that returns
a Scope with a `ready` promise property for extension initialization.

**Status**: Accepted

**Sections**:
- [Status](#adr-008-status)
- [Problem/Requirement](#adr-008-problem)
- [Exploration Journey](#adr-008-exploration)
- [Solution](#adr-008-solution)
- [Changes Across Layers](#adr-008-changes)
- [Implementation](#adr-008-implementation)
- [Verification](#adr-008-verification)
- [Migration](#adr-008-migration)
- [Related](#adr-008-related)

---

### [ADR-007-resolve-context-data](./adr/adr-007-resolve-context-data.md) - Per-Atom Private Storage via ctx.data
> Add lazy per-atom storage to ResolveContext, enabling state that survives
invalidation while remaining truly private to the atom factory.

**Status**: Accepted

**Sections**:
- [Status](#adr-007-status)
- [Problem/Requirement](#adr-007-problem)
- [Exploration Journey](#adr-007-exploration)
- [Solution](#adr-007-solution)
- [Changes Across Layers](#adr-007-changes)
- [Verification](#adr-007-verification)
- [Alternatives Considered](#adr-007-alternatives)
- [Related](#adr-007-related)

---

### [ADR-006-select-fine-grained-reactivity](./adr/adr-006-select-fine-grained-reactivity.md) - Fine-Grained Reactivity with select()
> Add select() method to Scope for derived subscriptions with equality-based
change detection, enabling fine-grained reactivity for frontend rendering optimization.

**Status**: Accepted

**Sections**:
- [Status](#adr-006-status)
- [Problem/Requirement](#adr-006-problem)
- [Exploration Journey](#adr-006-exploration)
- [Solution](#adr-006-solution)
- [Implementation](#adr-006-implementation)
- [Changes Across Layers](#adr-006-changes)
- [Verification](#adr-006-verification)
- [React Integration](#adr-006-react)
- [Future Considerations](#adr-006-future)
- [Related](#adr-006-related)

---

### [ADR-005-parser-functions](./adr/adr-005-flow-schema-slots.md) - Parser Functions for Type-Safe Input/Output Validation
> Add parser functions to Flow and Tag for library-agnostic validation with
full TypeScript type inference. TInput/TOutput inferred from parser return types.

**Status**: Accepted

**Sections**:
- [Status](#adr-005-status)
- [Problem/Requirement](#adr-005-problem)
- [Exploration Journey](#adr-005-exploration)
- [Solution](#adr-005-solution)
- [Changes Across Layers](#adr-005-changes)
- [Verification](#adr-005-verification)
- [Related](#adr-005-related)

---

### [ADR-004-lite-c3-documentation](./adr/adr-004-lite-c3-documentation.md) - C3 Documentation Structure for @pumped-fn/lite
> Create Container and Component level C3 documentation for @pumped-fn/lite
to make the package consumer-ready with clear architecture documentation.

**Status**: Accepted

**Sections**:
- [Status](#adr-004-status)
- [Problem/Requirement](#adr-004-problem)
- [Exploration Journey](#adr-004-exploration)
- [Solution](#adr-004-solution)
- [Changes Across Layers](#adr-004-changes)
- [Implementation Plan](#adr-004-plan)
- [Verification](#adr-004-verification)
- [Related](#adr-004-related)

---

### [ADR-003-controller-reactivity](./adr/adr-003-controller-reactivity.md) - Controller-based Reactivity for @pumped-fn/lite
> Add minimal reactivity to the lite package through Controller pattern,
enabling atoms to self-invalidate and subscribers to react to state changes
while maintaining the package's lightweight principles.

**Status**: Accepted

**Sections**:
- [Status](#adr-003-status)
- [Problem/Requirement](#adr-003-problem)
- [Exploration Journey](#adr-003-exploration)
- [Solution](#adr-003-solution)
- [Changes Across Layers](#adr-003-changes)
- [Migration from ADR-002](#adr-003-migration)
- [Verification](#adr-003-verification)
- [Performance Considerations](#adr-003-performance)
- [Alternatives Considered](#adr-003-alternatives)
- [Related](#adr-003-related)

---

### [ADR-002-lightweight-lite-package](./adr/adr-002-lightweight-lite-package.md) - Lightweight Lite Package (@pumped-fn/lite)
> Create a minimal DI/effect package as an alternative to core-next, focusing on
zero-dependency simplicity with a reduced API surface for lightweight applications.

**Status**: Accepted

**Sections**:
- [Status](#adr-002-status)
- [Problem/Requirement](#adr-002-problem)
- [Exploration Journey](#adr-002-exploration)
- [Solution](#adr-002-solution)
- [Changes Across Layers](#adr-002-changes)
- [Performance Trade-offs](#adr-002-performance)
- [Comparison with core-next](#adr-002-comparison)
- [Migration Path](#adr-002-migration)
- [Verification](#adr-002-verification)
- [Future Considerations](#adr-002-future)
- [Alternatives Considered](#adr-002-alternatives)
- [Related](#adr-002-related)

---

### [ADR-001-execution-context-lifecycle](./adr/adr-001-execution-context-lifecycle.md) - ExecutionContext Explicit Lifecycle with close()
> Add close() method to ExecutionContext for middleware integration patterns,
enabling explicit lifecycle management with graceful/abort modes and cascading
to child contexts.

**Status**: Accepted

**Sections**:
- [Status](#adr-001-status)
- [Problem/Requirement](#adr-001-problem)
- [Exploration Journey](#adr-001-exploration)
- [Solution](#adr-001-solution)
- [Changes Across Layers](#adr-001-changes)
- [Verification](#adr-001-verification)
- [Future Considerations](#adr-001-future)
- [Alternatives Considered](#adr-001-alternatives)
- [Related](#adr-001-related)

---

## Quick Reference

**Total Documents**: 21
**Contexts**: 1 | **Containers**: 1 | **Components**: 5 | **ADRs**: 14
