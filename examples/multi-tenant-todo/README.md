# Multi-Tenant Todo Actor System

Example demonstrating actor pattern implementation with pumped-fn where each tenant manages isolated todo state through message-based communication.

## Architecture

**Actor Model:**
- Each tenant is an isolated actor with encapsulated state
- Actors process messages sequentially via internal queue
- Message handlers are type-safe flows with discriminated unions
- Built-in pooling via `multi.provide()` manages actor lifecycle

**Message Flow:**
1. Client sends message to actor via `send()`
2. Message queued in actor's internal queue
3. Actor processes messages sequentially using flow handlers
4. Flow handlers validate input and return typed results
5. Actor updates state based on handler results

## Components

**types.ts** - Type definitions
- `Todo.Item` - Todo item structure (id, title, completed, createdAt)
- `Todo.State` - Tenant state (tenantId, todos Map)
- `TenantMessage.*` - Message types (CREATE_TODO, UPDATE_TODO, DELETE_TODO, GET_TODOS)

**actor.tenant.ts** - Tenant actor pool
- Created via `multi.provide()` with key-based pooling
- Each tenant ID gets dedicated actor instance with isolated state
- Internal message queue for sequential processing
- Integrates flow handlers for message processing
- Cleanup handler drains queue on disposal
- Automatic caching: same tenant ID = same actor instance

**flow.message-handler.ts** - Flow-based handlers
- `handleCreateTodo` - Validates and creates todo (checks empty title, duplicate ID)
- `handleUpdateTodo` - Updates existing todo (checks existence)
- `handleDeleteTodo` - Deletes existing todo (checks existence)
- Each handler returns discriminated union result (Success | Error)

**main.ts** - Example usage
- Demonstrates multi-tenant operations
- Shows message-based communication
- Uses condition-based waiting for processing

## Patterns Demonstrated

**Multi-Resource Pattern:**
- Tenant actors created via `multi.provide()` with key-based pooling
- Built-in pool management handles caching and lifecycle
- Proper cleanup with `controller.cleanup()` ensuring queue drainage
- Key schema validation ensures type-safe tenant IDs

**Flow Pattern:**
- Message handlers as reusable flows with `flow()`
- Discriminated union error handling for type-safe results
- Validation logic isolated in flow steps
- Flows tested independently from actor infrastructure

**flow.execute() vs scope.exec():**
This example uses `flow.execute()` instead of `scope.exec()` for message handlers:
- **Stateless execution** - Each handler runs in fresh isolated context
- **Clear dependencies** - All inputs explicitly passed as parameters
- **No lifecycle management** - No scope creation/disposal overhead per message
- **Easier testing** - Each handler testable independently without scope setup
- **Deterministic** - Same inputs always produce same outputs

Use `scope.exec()` when you need shared context/tags across flows or dependency injection. Use `flow.execute()` for independent stateless operations like actor message handlers.

**Actor Pattern:**
- Isolated state per tenant (no shared state)
- Sequential message processing via internal queue
- Message-based communication (fire and forget)
- Asynchronous message handling with flow execution

## Running

```bash
# Run example
pnpm -F @pumped-fn/examples dev:multi-tenant-todo

# Run tests
pnpm -F @pumped-fn/examples test:multi-tenant-todo

# Type check
pnpm -F @pumped-fn/examples typecheck
```

## Key Features

**Isolation:** Each tenant has completely isolated state via multi.provide() key-based pooling

**Type Safety:** All messages and handlers fully typed with discriminated unions

**Testability:** Flows tested independently with preset state, actor behavior tested separately

**Cleanup:** Graceful shutdown drains message queues before disposal via `controller.cleanup()`

**Scalability:** Easy to add new message types as flows without changing actor structure

**Error Handling:** Flow handlers return typed errors (EMPTY_TITLE, DUPLICATE_ID, TODO_NOT_FOUND)

**Simplicity:** No manual pool management - multi.provide() handles caching and lifecycle automatically

## Testing Strategy

**Unit Tests:**
- Flow handlers tested independently with `flow.execute()` and preset state
- Validation logic verified with edge cases (empty title, duplicate ID, not found)
- Tests verify both success and error paths

**Integration Tests:**
- Actor message processing with queue behavior
- Multi-resource pooling with automatic caching
- Flow integration with actor state updates

**Manual Testing:**
- Run `main.ts` to see multi-tenant interaction
- Observe isolated state per tenant
- Verify sequential message processing
