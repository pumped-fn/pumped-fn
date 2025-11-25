# C3 Documentation Table of Contents

> **AUTO-GENERATED** - Do not edit manually. Regenerate with: `.c3/scripts/build-toc.sh`
>
> Last generated: 2025-11-25 15:58:13

## Context Level

### [c3-0](./README.md) - pumped-fn System Overview
> Effect system for TypeScript providing scope-based dependency injection,
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

### [c3-1](./c3-1-core/) - Core Library (@pumped-fn/core-next)
> Core effect system providing executors, scopes, flows, tags, and extensions
for TypeScript dependency injection and execution orchestration.

**Sections**:
- [Overview](#c3-1-overview) - Primary responsibility: effect system foundation
- [Technology Stack](#c3-1-stack) - Runtime and build tooling
- [Component Relationships](#c3-1-relationships) - How internal modules connect
- [Data Flow](#c3-1-data-flow) - Execution sequence
- [Public API](#c3-1-api) - Exported functions and types
- [Cross-Cutting Implementations](#c3-1-cross-cutting) - Where cross-cutting concerns are implemented
- [Components](#c3-1-components) - Component inventory
- [Source Organization](#c3-1-source) - File structure
- [Testing](#c3-1-testing) - Testing strategy

---

## Component Level

### Core Library (@pumped-fn/core-next) Components

#### [c3-101](./c3-1-core/c3-101-scope.md) - Scope & Executor
> Core dependency injection - executor creation, scope lifecycle,
dependency resolution, and accessor pattern.

**Sections**:
- [Overview](#c3-101-overview) - Foundation of the DI system
- [Concepts](#c3-101-concepts)
- [Dependency Resolution](#c3-101-dependencies)
- [Event Hooks](#c3-101-events)
- [Configuration](#c3-101-config)
- [Source Files](#c3-101-source)
- [Testing](#c3-101-testing)

---

#### [c3-102](./c3-1-core/c3-102-flow.md) - Flow & ExecutionContext
> Request/response pattern with schema validation, execution context,
and nested flow support.

**Sections**:
- [Overview](#c3-102-overview) - Request handling pattern
- [Concepts](#c3-102-concepts)
- [Tag Store](#c3-102-tagstore)
- [Journaling](#c3-102-journaling)
- [Execution Lifecycle](#c3-102-lifecycle)
- [Context Lifecycle Management](#c3-102-lifecycle-management)
- [Flow.execute Helper](#c3-102-execute)
- [Configuration](#c3-102-config)
- [Source Files](#c3-102-source)
- [Testing](#c3-102-testing)

---

#### [c3-103](./c3-1-core/c3-103-tag.md) - Tag System
> Metadata attachment and extraction for executors, flows, and scopes.

**Sections**:
- [Overview](#c3-103-overview) - Metadata management
- [Concepts](#c3-103-concepts)
- [Writing Tags](#c3-103-writing)
- [Validation](#c3-103-validation)
- [Common Patterns](#c3-103-patterns)
- [Type Guards](#c3-103-guards)
- [Configuration](#c3-103-config)
- [Source Files](#c3-103-source)
- [Testing](#c3-103-testing)

---

#### [c3-104](./c3-1-core/c3-104-extension.md) - Extension System
> Cross-cutting concern hooks for observability and behavior modification.

**Sections**:
- [Overview](#c3-104-overview) - AOP-style hooks
- [Concepts](#c3-104-concepts)
- [Common Patterns](#c3-104-patterns)
- [Lifecycle](#c3-104-lifecycle)
- [Error Handling](#c3-104-errors)
- [Configuration](#c3-104-config)
- [The extension() Helper](#c3-104-helper)
- [Source Files](#c3-104-source)
- [Testing](#c3-104-testing)

---

#### [c3-105](./c3-1-core/c3-105-errors.md) - Error Classes
> Structured error hierarchy with context-rich error reporting.

**Sections**:
- [Overview](#c3-105-overview) - Structured error handling
- [Error Hierarchy](#c3-105-hierarchy)
- [Error Codes](#c3-105-codes)
- [Error Context](#c3-105-context)
- [Error Factory Functions](#c3-105-factories)
- [Message Formatting](#c3-105-messages)
- [Helper Functions](#c3-105-helpers)
- [Source Files](#c3-105-source)
- [Testing](#c3-105-testing)

---

#### [c3-106](./c3-1-core/c3-106-schema.md) - StandardSchema Validation
> Library-agnostic validation contract for flows and tags.

**Sections**:
- [Overview](#c3-106-overview) - Validation abstraction
- [Concepts](#c3-106-concepts)
- [Usage Patterns](#c3-106-patterns)
- [Compatible Libraries](#c3-106-compat)
- [Error Handling](#c3-106-errors)
- [Type Inference](#c3-106-inference)
- [Source Files](#c3-106-source)
- [Testing](#c3-106-testing)

---

#### [c3-107](./c3-1-core/c3-107-multi.md) - Multi-Executor
> Keyed executor pools for dynamic instance management.

**Sections**:
- [Overview](#c3-107-overview) - Keyed pools
- [Concepts](#c3-107-concepts)
- [API](#c3-107-api)
- [Usage Patterns](#c3-107-patterns)
- [Pool Lifecycle](#c3-107-lifecycle)
- [Source Files](#c3-107-source)
- [Testing](#c3-107-testing)

---

#### [c3-108](./c3-1-core/c3-108-promised.md) - Promised Class
> Enhanced Promise with execution context and utility methods.

**Sections**:
- [Overview](#c3-108-overview) - Enhanced Promise
- [Instance Methods](#c3-108-methods)
- [Static Methods](#c3-108-static)
- [Usage Patterns](#c3-108-patterns)
- [Creation](#c3-108-creation)
- [Source Files](#c3-108-source)
- [Testing](#c3-108-testing)

---

## Architecture Decisions

### [ADR-002-core-performance-optimization](./adr/adr-002-core-performance-optimization.md) - Core Package Performance Optimization
> Comprehensive performance optimization for @pumped-fn/core-next targeting memory
allocation, async patterns, type guard overhead, and module structure. Includes
critical bug fixes for un-awaited cleanup promises.

**Status**: Proposed

**Sections**:
- [Status](#adr-002-status)
- [Problem/Requirement](#adr-002-problem)
- [Exploration Journey](#adr-002-exploration)
- [Solution](#adr-002-solution)
- [Changes Across Layers](#adr-002-changes)
- [Verification](#adr-002-verification)
- [Expected Impact](#adr-002-impact)
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

**Total Documents**: 12
**Contexts**: 1 | **Containers**: 1 | **Components**: 8 | **ADRs**: 2
