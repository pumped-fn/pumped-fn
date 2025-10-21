---
name: Pumped-fn TypeScript
description: Auto-activating guidance for @pumped-fn/core-next ensuring type-safe, pattern-consistent code
when_to_use: automatically activates when detecting @pumped-fn/core-next imports
version: 1.0.0
---

# Pumped-fn TypeScript Skill

## Overview

Ensures high-quality, consistent TypeScript code when using `@pumped-fn/core-next` through automatic pattern checking and example-driven guidance.

**Core principle:** Enforce type safety, guide dependency patterns, reference canonical examples.

**Auto-activates when:** Code contains `import ... from '@pumped-fn/core-next'` or `from "@pumped-fn/core-next"`

## Detection Logic

When you detect pumped-fn usage:
1. Scan imports for `@pumped-fn/core-next`
2. Identify context: new project, integration, or extension
3. Load pattern reference for quick lookups
4. Apply 3-tier pattern checking as you write/review code

## Three-Tier Pattern Enforcement

### Tier 1: Critical (Block/require fixes)

These patterns MUST be followed. Violations prevent proceeding until fixed.

**Type Safety**
- ❌ No `any` types
- ❌ No `unknown` without proper type guards
- ❌ No type casting (`as Type`)
- ✅ Use derive() for type propagation
- ✅ Leverage factory function destructuring
- ✅ Let TypeScript infer from graph structure

**Reference**: `examples/type-inference.ts`

**Dependency Modifiers**
- ✅ `.reactive()` - downstream re-executes on upstream changes (declare on consumer side)
- ✅ `.lazy()` - conditional dependency resolution (only resolves when accessed)
- ✅ `.static()` - controller/updater pattern (doesn't re-execute on changes)
- ❌ Missing modifier when reactivity needed
- ❌ Wrong modifier for use case

**References**:
- `.reactive()`: `examples/reactive-updates.ts`
- `.lazy()`: `examples/flow-composition.ts`
- `.static()`: `examples/scope-lifecycle.ts`

**Tag System**
- ✅ Define tags with explicit types using tag() helper
- ✅ Type-safe tag references across graph
- ❌ String-based tag references
- ❌ Inconsistent tag usage

**Reference**: `examples/tags-foundation.ts`

**Lifecycle Separation**
- ✅ Long-running resources (DB, servers) in scope
- ✅ Short-span operations (requests, transactions) in flows
- ❌ Request-specific data in scope
- ❌ Connection pools in flows

**References**:
- Scope: `examples/scope-lifecycle.ts`
- Flow: `examples/flow-composition.ts`

### Tier 2: Important (Strong warnings)

These patterns should be followed. Warn clearly but allow override with justification.

**Flow Patterns**
- Root context for flow-specific data
- Proper sub-flow execution (sequential vs parallel)
- Flow disposal for cleanup
- Transaction management per flow

**References**:
- Context: `examples/flow-composition.ts`
- Transactions: `examples/database-transaction.ts`

**Meta Usage**
- Proper decoration of executors with metadata
- Scope configuration via meta
- Flow configuration via meta
- Extension configuration

**Reference**: `examples/extension-logging.ts`

**Extension Decisions**
- Use extensions for cross-cutting concerns (logging, metrics, transactions)
- Use regular executors for domain logic
- Extension lifecycle hooks (scope/flow/executor)

**Reference**: `examples/extension-logging.ts`

### Tier 3: Best Practices (Educational)

Suggest improvements when detected, but don't block.

**Testing Patterns**
- Graph swapping for mocks
- Test-specific scope configuration
- Isolated test setups

**Reference**: `examples/testing-setup.ts`

**Code Organization**
- Logical executor grouping
- Clear dependency structure
- Consistent naming

**Error Handling**
- Error boundaries
- Type-safe error propagation

**Reference**: `examples/error-handling.ts`

## Guidance Flow

When writing or reviewing pumped-fn code:

1. **Scan for violations**
   - Check Tier 1 patterns first
   - Then Tier 2
   - Finally Tier 3

2. **Provide guidance**
   - **Tier 1 violation**: Block with clear explanation + reference to example
   - **Tier 2 violation**: Strong warning with explanation + example reference
   - **Tier 3 opportunity**: Suggest improvement with example reference

3. **Reference examples**
   - Always point to specific example file
   - Quote relevant code sections from examples
   - Explain why pattern matters (graph implications)

4. **Allow overrides**
   - If user provides good justification
   - Explain trade-offs clearly
   - Document decision

## Context Detection

Detect which scenario user is in:

**New Project**
- No existing pumped-fn code
- Guide scope setup first
- Reference: `examples/basic-handler.ts` → `examples/scope-lifecycle.ts`

**Integration**
- Existing codebase, adding pumped-fn
- Guide gradual adoption
- Show how to integrate with existing patterns

**Extension**
- Existing pumped-fn code
- Adding new executors/flows
- Ensure consistency with existing graph

## Focus Areas (Common Pain Points)

### 1. Conceptual Model

**Challenge**: Graph resolution vs imperative/OOP thinking

**Guidance**:
- Executors declare factory functions, not values
- Dependencies declared explicitly, resolved by scope
- Think in terms of dependency graphs, not call chains
- Scope actualizes the graph (detects deps, resolves in order)

**Reference**: `examples/basic-handler.ts` for simplest mental model

### 2. Dependency Declaration

**Challenge**: Understanding upstream relationships and modifiers

**Guidance**:
- Upstream dependencies declared in factory function parameters
- Modifiers control resolution behavior:
  - `.reactive()`: consumer re-executes when producer changes
  - `.lazy()`: only resolve when accessed
  - `.static()`: never re-execute (controllers/updaters)
- Default behavior: resolve once, cache forever

**References**:
- Basic: `examples/basic-handler.ts`
- Reactive: `examples/reactive-updates.ts`
- Lazy: `examples/flow-composition.ts`
- Static: `examples/scope-lifecycle.ts`

### 3. Type Inference

**Challenge**: Maintaining strict types through graph without escape hatches

**Guidance**:
- Use derive() to propagate types from factories
- Destructure factory functions for better inference
- Let graph structure inform types
- Never use `any`, `unknown` without guards, or `as` casting

**Reference**: `examples/type-inference.ts`

## Quick Pattern Lookup

For detailed pattern mapping, see: `pattern-reference.md`

Common lookups:
- "How do I make this reactive?" → `examples/reactive-updates.ts`
- "Where do I put DB connection?" → `examples/scope-lifecycle.ts`
- "How do I handle requests?" → `examples/flow-composition.ts`
- "How do I maintain types?" → `examples/type-inference.ts`
- "How do I use tags?" → `examples/tags-foundation.ts`
- "How do I test this?" → `examples/testing-setup.ts`
- "How do I add logging?" → `examples/extension-logging.ts`

## Key Behaviors

- **Non-intrusive**: Only activate on detected usage
- **Example-driven**: Always reference concrete code
- **Type-focused**: Relentless about maintaining inference
- **Conceptual**: Explain *why* patterns matter (graph implications)
- **Pragmatic**: Allow overrides with good justification

## Remember

- Examples live in `examples/` directory - read them when needed
- Pattern reference provides quick mapping
- Focus on Tier 1 (critical) first
- Explain graph implications, not just syntax
- Point to docs for deep dives: See pumped-fn documentation at https://github.com/lagz0ne/pumped-fn/tree/main/docs
