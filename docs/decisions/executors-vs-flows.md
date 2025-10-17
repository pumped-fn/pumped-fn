# When to Use Executors vs Flows

Decision guide for choosing between executors (long-lived) and flows (short-lived operations).

## Use Executors When

- Long-lived resources (database connections, HTTP servers)
- Shared across operations
- Needs lifecycle management (startup, cleanup)
- Part of service dependency graph

## Use Flows When

- Short-lived operations (request handling, workflows)
- Request-scoped data storage needed
- Needs isolation between executions
- Workflow orchestration with sub-flows

## Example: HTTP Service

**Executor for long-lived server:**
- Database connection pool
- Logger
- Configuration

**Flow for short-lived request:**
- HTTP request handler
- Business logic execution
- Response generation

## Related

- [Concepts: Executors and Scopes](../concepts/executors-and-scopes.md)
- [Concepts: Flows](../concepts/flows.md)
- [Pattern: Framework Integration](../patterns/framework-integration.md)
