# Pumped-fn Pattern Reference

Quick lookup for four core elements and their patterns.

## Core Elements Decision

- **Resource** → Integration details (DB, API, external service) - no business logic
- **Flow** → Business logic with journal keys - orchestrates resources
- **Interaction Point** → Entry point (HTTP, CLI, cron) - transforms to flow input
- **Utility** → Pure function - no side effects, no dependencies

## Type Safety & Inference

**Pattern**: Maintaining strict types without `any`/`unknown`/casting
**Example**: `examples/type-inference.ts`
**Key Points**:
- Use derive() for type propagation
- Leverage factory function destructuring
- Let TypeScript infer from graph structure

## Dependency Modifiers

**Pattern**: `.reactive()` - downstream re-executes on upstream changes
**Example**: `examples/reactive-updates.ts`
**Key Points**:
- Use for values that need to trigger downstream re-computation
- Only declare reactive on consuming side, not producing side

**Pattern**: `.lazy()` - conditional dependency resolution
**Example**: `examples/flow-composition.ts`
**Key Points**:
- Dependency only resolved when actually accessed
- Useful for conditional branches in graph

**Pattern**: `.static()` - controller/updater pattern
**Example**: `examples/scope-lifecycle.ts`
**Key Points**:
- Doesn't re-execute when dependencies change
- Used for update functions, controllers

## Tag System

**Pattern**: Type-safe tag declaration and usage
**Example**: `examples/tags-foundation.ts`
**Key Points**:
- Schema-flexible: `tag(z.object({...}), {label, default})` with Zod
- Or custom: `tag(custom<T>(), {label, default})`
- Works with any Standard Schema validator (Valibot, etc)
- Reference tags consistently across graph

## Scope vs Flow Lifecycle

**Pattern**: Long-running resources in scope
**Example**: `examples/scope-lifecycle.ts`
**Key Points**:
- Database connections, servers go in scope
- Scope lives for application lifetime
- Use scope.dispose() for cleanup

**Pattern**: Short-span operations in flows
**Example**: `examples/flow-composition.ts`
**Key Points**:
- Request handling, transactions use flows
- Flow has root context (map-like)
- Sub-flows fork context automatically

## Flow Patterns

**Pattern**: Context management and sub-flow execution
**Example**: `examples/flow-composition.ts`
**Key Points**:
- Always use journal keys: `ctx.exec('key', flow, input)`
- Root context for flow-specific data
- Sequential vs parallel sub-flows via ctx.parallel/parallelSettled
- Max 3 levels deep

**Pattern**: Flow with dependencies
**Example**: `examples/basic-handler.ts`
**Key Points**:
- `flow({ resource1, resource2 }, async (deps, ctx, input) => {})`
- Access resources via deps.resource1, deps.resource2
- Use ctx.run('key', () => operation) for journaled operations

**Pattern**: Database transactions per flow
**Example**: `examples/database-transaction.ts`
**Key Points**:
- Transaction opened in flow context
- Committed/rolled back on flow completion
- Extension pattern for automatic handling

## Extension Patterns

**Pattern**: Cross-cutting concerns via extensions
**Example**: `examples/extension-logging.ts`
**Key Points**:
- Use for logging, metrics, transactions
- Hook into scope/flow/executor lifecycle
- Configure via meta on scope/flow

## Testing Patterns

**Pattern**: Graph swapping for mocks
**Example**: `examples/testing-setup.ts`
**Key Points**:
- Swap executors at scope creation
- Mock dependencies without changing code
- Test-specific configurations via meta

## Basic Patterns

**Pattern**: Simple executor and scope setup
**Example**: `examples/basic-handler.ts`
**Key Points**:
- Define executors with factory functions
- Declare upstream dependencies
- Create scope and access values

## Error Handling

**Pattern**: Error boundaries and propagation
**Example**: `examples/error-handling.ts`
**Key Points**:
- Errors propagate through graph
- Use error boundary extensions
- Type-safe error handling

## Middleware Chain

**Pattern**: Composable middleware pattern
**Example**: `examples/middleware-chain.ts`
**Key Points**:
- Chain executors for request processing
- Use flow context for middleware data
- Type-safe middleware composition

## Comprehensive Example

**Pattern**: Full-featured application structure
**Example**: `examples/promised-comprehensive.ts`
**Key Points**:
- Complete scope/flow/extension setup
- Real-world patterns combined
- Production-ready structure
