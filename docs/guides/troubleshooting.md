# Troubleshooting Guide

This guide helps diagnose common issues by linking symptoms to scenario diagrams.

## Quick Index

| Symptom | Likely Cause | See Diagram |
|---------|-------------|-------------|
| Flow executed multiple times | Reactive invalidation | [Flow Lifecycle](../diagrams/scenarios/01-flow-lifecycle-happy-path.md#reactive-invalidation) |
| Cleanup didn't run | Executor not resolved or cached | [Flow Lifecycle](../diagrams/scenarios/01-flow-lifecycle-happy-path.md#key-points) |
| Unexpected execution order | Parallel flows, no order guarantee | [Parallel Execution](../diagrams/scenarios/03-parallel-execution-order.md) |
| Error disappeared | Extension handler caught it | [Error Propagation](../diagrams/scenarios/02-error-propagation.md#extension-hooks) |
| Can't find error source | Need to trace context chain | [Error Tracing](../diagrams/scenarios/04-error-tracing-root-cause.md) |
| Wrong cleanup order | Expected FIFO, actual is LIFO | [Flow Lifecycle](../diagrams/scenarios/01-flow-lifecycle-happy-path.md#cleanup-order) |

## Diagnostic Workflows

### My Flow Executed Twice

**Questions:**
1. Are you using reactive dependencies?
2. Did a dependency value change?
3. Is the flow registered with `onUpdate`?

**Debug Steps:**
1. Check if executor has `reactive` type
2. Inspect dependency chain for mutations
3. See [Flow Lifecycle - Reactive Invalidation](../diagrams/scenarios/01-flow-lifecycle-happy-path.md#reactive-invalidation)

---

### Cleanup Didn't Run

**Questions:**
1. Was the flow actually executed?
2. Did you register cleanup during execution?
3. Was there an error before cleanup registration?

**Debug Steps:**
1. Check scope cache: `scope.resolve(executor)` actually called?
2. Verify cleanup registered: `controller.cleanup(fn)` called?
3. Check error timing: error before or after cleanup registration?
4. See [Flow Lifecycle - Cleanup Registration](../diagrams/scenarios/01-flow-lifecycle-happy-path.md#code-references)

---

### Unexpected Execution Order

**Questions:**
1. Are flows running in parallel?
2. Did you assume submission order = completion order?
3. Are there async operations with different durations?

**Debug Steps:**
1. Check if using `Promise.all` or sequential `await`
2. Add timing logs to measure actual duration
3. See [Parallel Execution Order](../diagrams/scenarios/03-parallel-execution-order.md)

---

### Where Did This Error Come From?

**Questions:**
1. Do you have the `FlowExecution` object?
2. What is `execution.status`?
3. Does `execution.ctx.details.error` exist?

**Debug Steps:**
1. Access `execution.ctx`
2. Check `details.error` for error object
3. Follow `parent` chain if error not in current context
4. See [Error Tracing](../diagrams/scenarios/04-error-tracing-root-cause.md)

---

## Common Pitfalls

### Assuming Sequential Execution

**Problem:** Multiple `scope.resolve()` calls assumed to execute in order

**Solution:** Flows execute asynchronously. Use explicit sequencing:
- `await` each flow sequentially
- Use dependencies to enforce order
- See [Parallel Execution](../diagrams/scenarios/03-parallel-execution-order.md)

---

### Expecting FIFO Cleanup Order

**Problem:** Cleanups run in reverse order (LIFO), not registration order (FIFO)

**Solution:** This is by design for proper resource cleanup (like stack unwinding)
- Last registered cleans up first
- See [Flow Lifecycle - Cleanup Order](../diagrams/scenarios/01-flow-lifecycle-happy-path.md#key-points)

---

### Missing Error Context

**Problem:** Error thrown but `execution.ctx` is undefined

**Solution:** Check execution status first:
- `status === "failed"` → error occurred
- `status === "cancelled"` → aborted
- Access `ctx` only after execution completes
- See [Error Propagation](../diagrams/scenarios/02-error-propagation.md)

---

## Related Documentation

- [Flow Lifecycle Happy Path](../diagrams/scenarios/01-flow-lifecycle-happy-path.md)
- [Error Propagation](../diagrams/scenarios/02-error-propagation.md)
- [Parallel Execution Order](../diagrams/scenarios/03-parallel-execution-order.md)
- [Error Tracing](../diagrams/scenarios/04-error-tracing-root-cause.md)
