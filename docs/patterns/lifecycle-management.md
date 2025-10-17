# Lifecycle Management

Executors can register cleanup handlers that run when the scope is disposed or when reactive dependencies trigger re-execution.

## Basic Cleanup

Register cleanup for resources that need disposal:

<<< @/code/lifecycle-patterns.ts#cleanup-basic{ts}

**Key Points:**
- `controller.cleanup()` registers disposal logic
- Cleanup runs when scope is disposed
- Use for connections, file handles, timers

## Multiple Cleanup Handlers

Register multiple cleanup handlers for complex resources:

<<< @/code/lifecycle-patterns.ts#cleanup-multiple{ts}

**Cleanup Execution:**
- Handlers execute in **reverse registration order** (LIFO)
- Last registered runs first
- Ensures proper teardown sequence
- Async cleanup handlers are supported

## Cleanup with Reactivity

When reactive dependencies update, cleanup runs before re-execution:

```ts
const counter = provide(() => 0)

const watcher = derive(counter.reactive, (count, controller) => {
  controller.cleanup(() => {
    console.log(`Cleanup for count: ${count}`)
  })
  return count
})

const scope = createScope()
await scope.resolve(watcher)

await scope.update(counter, 1) // Triggers cleanup then re-execution
await scope.dispose() // Final cleanup
```

## Best Practices

- **Register Early**: Add cleanup handlers during executor initialization
- **Async Support**: Cleanup can be async, awaited during disposal
- **Error Safety**: Errors in cleanup don't prevent other cleanups
- **Resource Tracking**: Use arrays/sets to track multiple resources
