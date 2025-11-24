---
id: c3-102
c3-version: 3
title: Flow & ExecutionContext
summary: >
  Request/response pattern with schema validation, execution context,
  and nested flow support.
---

# Flow & ExecutionContext

## Overview {#c3-102-overview}
<!-- Request handling pattern -->

The Flow system provides a structured request/response pattern:

- **Flow** - A schema-validated request handler (specialized executor)
- **ExecutionContext** - Runtime context for flow execution with tag store, abort signal, and nesting support
- **Journaling** - Execution recording for replay/caching patterns

Flows combine the dependency injection of executors with input/output validation and context propagation.

## Concepts {#c3-102-concepts}

### Flow

A flow is an executor specialized for request handling. It adds:

1. **Definition** - Name, version, input schema, output schema
2. **Handler** - Function that processes input and returns output
3. **Validation** - Input validated before handler, output validated after

**Flow creation patterns:**

| Pattern | Use Case |
|---------|----------|
| `flow(handler)` | Simple flow, no validation |
| `flow(deps, handler)` | Flow with dependencies |
| `flow(config)` | Returns FlowDefinition for `.handler()` chaining |
| `flow(config, handler)` | Complete flow with validation |
| `flow(config, deps, handler)` | Full flow with deps and validation |

**Flow definition config:**

| Field | Purpose |
|-------|---------|
| `name` | Identifier for debugging/logging |
| `version` | Schema version for compatibility |
| `input` | StandardSchema for input validation |
| `output` | StandardSchema for output validation |
| `tags` | Metadata tags attached to flow |

### ExecutionContext

The context provided to every flow handler. It provides:

1. **Tag Store** - Hierarchical metadata storage
2. **Abort Signal** - For cancellation propagation
3. **Nested Execution** - `exec()` for calling other flows/functions
4. **Parallel Execution** - `parallel()` and `parallelSettled()`
5. **Parent Context** - Access to enclosing context (for nested flows)

**Key properties:**

| Property | Type | Purpose |
|----------|------|---------|
| `scope` | Core.Scope | Parent scope for dependency resolution |
| `parent` | Context | Parent context (for nested flows) |
| `id` | string | Unique execution ID |
| `signal` | AbortSignal | For cancellation |
| `tagStore` | Tag.Store | Hierarchical tag storage |
| `details` | Details | Execution metadata (name, timing, error) |

### Execution Flow

```
scope.exec({ flow, input })
    │
    ├── Create ExecutionContext
    │
    ├── Resolve flow executor (get handler)
    │
    ├── Validate input against schema
    │
    ├── Call handler(context, validatedInput)
    │   │
    │   └── Handler can:
    │       ├── ctx.exec(otherFlow, input) - nested flows
    │       ├── ctx.exec({ fn, params }) - arbitrary functions
    │       ├── ctx.parallel([...]) - concurrent execution
    │       ├── ctx.get(tag) - read tag values
    │       └── ctx.set(tag, value) - write tag values
    │
    ├── Validate output against schema
    │
    └── Return Promised<S> with execution snapshot
```

### Nested Execution

Context provides `exec()` for nested operations:

| Overload | Purpose |
|----------|---------|
| `exec(flow, input)` | Call nested flow |
| `exec(key, flow, input)` | Call with journal key |
| `exec({ flow, input, key?, timeout?, tags? })` | Full config |
| `exec({ fn, params?, key?, timeout? })` | Call arbitrary function |

**Key parameter:**
When a `key` is provided, the execution result is journaled. Subsequent calls with the same key return cached result (replay pattern).

### Parallel Execution

| Method | Behavior |
|--------|----------|
| `parallel([...])` | All must succeed, fails fast |
| `parallelSettled([...])` | Collects all results (fulfilled/rejected) |

Both return `ParallelResult` with results array and stats.

### Flow Metadata

The `flowMeta` object provides tags for execution context:

| Tag | Type | Purpose |
|-----|------|---------|
| `flowMeta.depth` | number | Nesting level (0 = root) |
| `flowMeta.flowName` | string | Current flow name |
| `flowMeta.parentFlowName` | string | Parent flow name |
| `flowMeta.isParallel` | boolean | Running in parallel context |
| `flowMeta.journal` | Map | Journal entries |

**Reading metadata:**
```typescript
const depth = ctx.get(flowMeta.depth)
const name = ctx.find(flowMeta.flowName)
```

## Tag Store {#c3-102-tagstore}

The tag store is hierarchical:
1. Context's own tags (highest priority)
2. Scope tags
3. Parent context tags (for nested flows)

**Operations:**

| Method | Purpose |
|--------|---------|
| `ctx.get(tag)` | Read tag value (throws if missing for required tags) |
| `ctx.find(tag)` | Read tag value (returns undefined if missing) |
| `ctx.set(tag, value)` | Write tag value to current context |

## Journaling {#c3-102-journaling}

The journal provides replay capability:

1. **Recording** - When `key` is provided to `exec()`, result is stored
2. **Replay** - Subsequent calls with same key return cached result
3. **Reset** - `ctx.resetJournal(pattern?)` clears journal entries

**Journal key format:** `{flowName}:{depth}:{userKey}`

**Use cases:**
- Idempotent retries
- Workflow checkpointing
- Testing/debugging

## Execution Lifecycle {#c3-102-lifecycle}

| Phase | What Happens |
|-------|--------------|
| Creation | `ExecutionContextImpl` constructed with config |
| Initialization | `initializeExecutionContext()` sets depth, name |
| Execution | Handler runs, may nest other executions |
| Completion | `end()` called, snapshot created |
| Cleanup | Scope may dispose if auto-created |

**Execution details:**

| Field | Set When |
|-------|----------|
| `startedAt` | Context creation |
| `completedAt` | `end()` called |
| `error` | If execution fails |
| `metadata` | User-provided metadata |

## Flow.execute Helper {#c3-102-execute}

The `flow.execute()` convenience function:

| Variant | Behavior |
|---------|----------|
| `flow.execute(flow, input)` | Create scope, execute, dispose |
| `flow.execute(flow, input, { scope })` | Use existing scope |
| `flow.execute(flow, input, { details: true })` | Return ExecutionDetails |

**When to use:**
- One-shot flow execution
- Testing flows in isolation
- Simple scripts without scope management

## Configuration {#c3-102-config}

**DefineConfig** (flow definition):

| Option | Type | Default |
|--------|------|---------|
| `name` | string | "anonymous" |
| `version` | string | "1.0.0" |
| `input` | StandardSchemaV1 | required |
| `output` | StandardSchemaV1 | required |
| `tags` | Tag.Tagged[] | [] |

**Execution options (via scope.exec):**

| Option | Purpose |
|--------|---------|
| `timeout` | Abort after milliseconds |
| `tags` | Additional execution tags |

## Source Files {#c3-102-source}

| File | Contents |
|------|----------|
| `flow.ts` | flow(), FlowDefinition, execute helper |
| `execution-context.ts` | ExecutionContextImpl, flowMeta, flowImpl |
| `flow-execution.ts` | FlowExecutionImpl status tracking |
| `internal/journal-utils.ts` | Journal key creation, replay logic |
| `internal/abort-utils.ts` | Timeout/abort controller utilities |

## Testing {#c3-102-testing}

Primary tests:
- `execution-context.behavior.test.ts` - Context parity, journaling, timeouts
- `flow/execute.test.ts` - Flow execution patterns
- `flow/parallel.test.ts` - Parallel execution helpers

Key test scenarios:
- Nested flow execution
- Tag propagation through context hierarchy
- Journal replay behavior
- Timeout and cancellation
- Parallel execution stats
