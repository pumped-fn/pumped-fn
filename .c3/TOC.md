# C3 Documentation Table of Contents

> **AUTO-GENERATED** - Do not edit manually. Regenerate with: `.c3/scripts/build-toc.sh`
>
> Last generated: 2025-12-12 15:24:13

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

### [c3-3](./c3-3-lite-react/) - Lite React Library (@pumped-fn/lite-react)
> Minimal React bindings for @pumped-fn/lite with Suspense and ErrorBoundary
integration via useSyncExternalStore for React 18+ applications.

**Sections**:
- [Overview](#c3-3-overview)
- [Technology Stack](#c3-3-stack)
- [Component Relationships](#c3-3-relationships)
- [State Handling](#c3-3-states)
- [Public API](#c3-3-api)
- [Source Organization](#c3-3-source)
- [Components](#c3-3-components)
- [Usage Patterns](#c3-3-patterns)
- [Testing](#c3-3-testing)
- [SSR Compatibility](#c3-3-ssr)
- [Related](#c3-3-related)

---

### [c3-4](./c3-4-lite-devtools/) - Lite Devtools Library (@pumped-fn/lite-devtools)
> Observability extension with fire-and-forget transports.

**Sections**:
- [Overview](#c3-4-overview)
- [API](#c3-4-api)
- [Source Organization](#c3-4-source)
- [Related](#c3-4-related)

---

### [c3-5](./c3-5-lite-hmr/) - Lite HMR Plugin (@pumped-fn/lite-hmr)
> Build-time Vite plugin preserving atom state across hot module reloads.

**Sections**:
- [Overview](#c3-5-overview)
- [Architecture](#c3-5-architecture)
- [API](#c3-5-api)
- [Transform Rules](#c3-5-transforms)
- [Production Safety](#c3-5-production)
- [Source Organization](#c3-5-source)
- [Related](#c3-5-related)

---

### [c3-6](./c3-6-lite-devtools-server/) - Lite Devtools Server (@pumped-fn/lite-devtools-server)
> Standalone TUI server receiving devtools events via HTTP from application processes.

**Sections**:
- [Overview](#c3-6-overview)
- [Architecture](#c3-6-architecture)
- [Technology Stack](#c3-6-stack)
- [API](#c3-6-api)
- [Source Organization](#c3-6-source)
- [Related](#c3-6-related)

---

### [c3-7](./c3-7-lite-extension-otel/) - Lite Extension OTel (@pumped-fn/lite-extension-otel)
> OpenTelemetry integration extension providing distributed tracing, metrics,
and W3C context propagation for pumped-fn applications.

**Sections**:
- [Overview](#c3-7-overview)
- [Technology Stack](#c3-7-stack)
- [Architecture](#c3-7-architecture)
- [Span Hierarchy Flow](#c3-7-hierarchy)
- [API](#c3-7-api)
- [Lifecycle Management](#c3-7-lifecycle)
- [Source Organization](#c3-7-source)
- [Testing](#c3-7-testing)
- [Related](#c3-7-related)

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
- [Direct Value Mutation](#c3-201-set-update)
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
- [Service Helper](#c3-202-service)
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
- [Hierarchical Execution](#c3-203-hierarchical)
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

### Lite React Library (@pumped-fn/lite-react) Components

#### [c3-301](./c3-3-lite-react/c3-301-hooks.md) - React Hooks
> React hooks for @pumped-fn/lite integration - useScope, useAtom, useSelect,
and useController with Suspense/ErrorBoundary support via useSyncExternalStore.

**Sections**:
- [Overview](#c3-301-overview)
- [Concepts](#c3-301-concepts)
- [useScope](#c3-301-use-scope)
- [useController](#c3-301-use-controller)
- [useAtom](#c3-301-use-atom)
- [useSelect](#c3-301-use-select)
- [Source Files](#c3-301-source)
- [Testing](#c3-301-testing)
- [Related](#c3-301-related)

---

## Architecture Decisions

### [adr-025](./adr/adr-025-otel-simplification.md) - Simplify OTEL Extension with Self-Contained Provider Management
> Refactor @pumped-fn/lite-extension-otel to be self-contained with tag-based
configuration, AsyncLocalStorage context propagation, and automatic provider
lifecycle management, reducing complexity by ~60%.

**Status**: Accepted

**Sections**:
- [Status](#adr-025-status)
- [Problem/Requirement](#adr-025-problem)
- [Exploration Journey](#adr-025-exploration)
- [Solution](#adr-025-solution)
- [Changes Across Layers](#adr-025-changes)
- [Verification](#adr-025-verification)
- [Related](#adr-025-related)

---

### [adr-024](./adr/adr-024-exec-fn-name-option.md) - Add name Option to ExecFnOptions for API Consistency
> Add optional name property to ExecFnOptions to match ExecFlowOptions,
allowing callers to provide explicit names for function executions.

**Status**: Accepted

**Sections**:
- [Status](#adr-024-status)
- [Problem/Requirement](#adr-024-problem)
- [Exploration Journey](#adr-024-exploration)
- [Solution](#adr-024-solution)
- [Changes Across Layers](#adr-024-changes)
- [Verification](#adr-024-verification)
- [Related](#adr-024-related)

---

### [ADR-023-tag-deps-seek-hierarchy](./adr/adr-023-tag-deps-seek-hierarchy.md) - Tag Dependencies Use seekTag for Hierarchical Lookup
> Change tags.required(), tags.optional(), and tags.all() to look up values
via seekTag() across the ExecutionContext parent chain, enabling flows to
access tag values set via ctx.data.setTag() in parent contexts.

**Status**: Proposed

**Sections**:
- [Status](#adr-023-status)
- [Problem/Requirement](#adr-023-problem)
- [Exploration Journey](#adr-023-exploration)
- [Solution](#adr-023-solution)
- [Changes Across Layers](#adr-023-changes)
- [Verification](#adr-023-verification)
- [Related](#adr-023-related)

---

### [ADR-022-execution-context-name](./adr/adr-022-execution-context-name.md) - ExecutionContext Name Property for Extension Visibility
> Add name property to ExecutionContext so extensions can access the resolved
flow/exec name without inspecting the target object directly.

**Status**: Accepted

**Sections**:
- [Status](#adr-022-status)
- [Problem/Requirement](#adr-022-problem)
- [Exploration Journey](#adr-022-exploration)
- [Solution](#adr-022-solution)
- [Changes Across Layers](#adr-022-changes)
- [Verification](#adr-022-verification)
- [Related](#adr-022-related)

---

### [ADR-021-hierarchical-data-seek](./adr/adr-021-hierarchical-data-seek.md) - Hierarchical Data Lookup via seek() Method
> Add seek() method to ContextData for looking up tag values across the
ExecutionContext parent chain, enabling shared data patterns without
breaking existing isolated data semantics.

**Status**: Accepted

**Sections**:
- [Status](#adr-021-status)
- [Problem/Requirement](#adr-021-problem)
- [Exploration Journey](#adr-021-exploration)
- [Solution](#adr-021-solution)
- [Changes Across Layers](#adr-021-changes)
- [Verification](#adr-021-verification)
- [Related](#adr-021-related)

---

### [adr-020](./adr/adr-020-raw-input-execution.md) - Raw Input Execution for Flows with Parse
> Add rawInput option to ctx.exec() allowing unknown input when flow has parse,
enabling callers to delegate validation to the flow instead of pre-typing input.

**Status**: Accepted

**Sections**:
- [Status](#adr-020-status)
- [Problem/Requirement](#adr-020-problem)
- [Exploration Journey](#adr-020-exploration)
- [Solution](#adr-020-solution)
- [Changes Across Layers](#adr-020-changes)
- [Verification](#adr-020-verification)
- [Related](#adr-020-related)

---

### [adr-019](./adr/adr-019-scope-controller-options.md) - Scope.controller() Options for API Consistency
> Add optional { resolve: true } flag to scope.controller() to match the
controller() dependency helper, eliminating API inconsistency and enabling
the same convenience pattern outside of atom dependencies.

**Status**: Accepted

**Sections**:
- [Status](#adr-019-status)
- [Problem/Requirement](#adr-019-problem)
- [Exploration Journey](#adr-019-exploration)
- [Solution](#adr-019-solution)
- [Changes Across Layers](#adr-019-changes)
- [Verification](#adr-019-verification)
- [Related](#adr-019-related)

---

### [adr-018](./adr/adr-018-otel-extension.md) - OpenTelemetry Extension for Lite Package
> Create @pumped-fn/lite-extension-otel package providing OpenTelemetry integration
with tracing, metrics, and context propagation using the Extension system and
hierarchical ExecutionContext from ADR-016.

**Status**: Accepted

**Sections**:
- [Status](#adr-018-status)
- [Problem/Requirement](#adr-018-problem)
- [Exploration Journey](#adr-018-exploration)
- [Solution](#adr-018-solution)
- [Changes Across Layers](#adr-018-changes)
- [Verification](#adr-018-verification)
- [Related](#adr-018-related)

---

### [adr-017](./adr/adr-017-controller-auto-resolution.md) - Controller Auto-Resolution Option
> Add optional { resolve: true } flag to controller() helper that auto-resolves
the atom before passing the controller to the factory, eliminating the need
for redundant atom+controller deps or manual resolve() calls.

**Status**: Accepted

**Sections**:
- [Status](#adr-017-status)
- [Problem/Requirement](#adr-017-problem)
- [Exploration Journey](#adr-017-exploration)
- [Solution](#adr-017-solution)
- [Changes Across Layers](#adr-017-changes)
- [Verification](#adr-017-verification)
- [Related](#adr-017-related)

---

### [ADR-016-hierarchical-execution-context](./adr/adr-016-hierarchical-execution-context.md) - Hierarchical ExecutionContext with Parent-Child Per Exec
> Create child ExecutionContext per exec() call with parent reference and
isolated data map, enabling nested span tracing without race conditions
or AsyncLocalStorage dependency.

**Status**: Accepted

**Sections**:
- [Status](#adr-016-status)
- [Problem/Requirement](#adr-016-problem)
- [Exploration Journey](#adr-016-exploration)
- [Solution](#adr-016-solution)
- [Breaking Changes](#adr-016-breaking)
- [Complexity Estimate](#adr-016-complexity)
- [Alternative Considered: Shared Context with Stack](#adr-016-alternative)
- [Changes Across Layers](#adr-016-changes)
- [Verification](#adr-016-verification)
- [Migration Guide](#adr-016-migration)
- [Related](#adr-016-related)

---

### [adr-015](./adr/adr-015-devtools-integration.md) - Devtools via Extension + Fire-and-Forget Transports
> 

**Status**: Accepted

**Sections**:

---

### [adr-014](./adr/adr-014-datastore-map-semantics.md) - DataStore Map-like Semantics
> Documents that DataStore has Map semantics - get() always returns T | undefined
(pure lookup), defaults only used by getOrSet() not get().

**Status**: Implemented

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

**Status**: Implemented

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

**Total Documents**: 38
**Contexts**: 1 | **Containers**: 6 | **Components**: 6 | **ADRs**: 25
