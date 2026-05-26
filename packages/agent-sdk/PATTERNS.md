# Agent SDK Patterns

Use this package as a small convention layer over `@pumped-fn/lite`. If a use case can be expressed with `flow`, state/service, markers, and `ctx.exec`, do that before adding another primitive.

## 0. Standalone Suspense

Use suspense when the system needs deterministic replay or external resolution, but not agents, workers, or remote routing.

```ts
import { createSuspenseExtension, suspend, suspenseRun } from "@pumped-fn/lite-extension-suspense"

const waitForCommit = flow({
  name: "wait-for-commit",
  parse: typed<{ revision: number }>(),
  tags: [suspend(true)],
  factory: () => {
    throw new Error("resolved by sync service")
  },
})

const scope = createScope({
  extensions: [createSuspenseExtension({ log })],
})

const ctx = scope.createContext(suspenseRun({ taskId: "doc-123", runId: "sync-42" }))
```

Suspense has no agent knowledge. It sees marked `ctx.exec` calls, assigns `(taskId, runId, step)`, returns completed/resolved log entries, writes pending entries for suspended steps, and throws `SuspendSignal`.

## 1. Workflow Flow

Use a workflow flow when code chooses order, branching, retries, and fan-out.

```ts
export const processPr = flow({
  name: "process_pr",
  parse: typed<PrEvent>(),
  tags: [workflow(true)],
  factory: async (ctx) => {
    const lint = await delegate(ctx, "lint", { sha: ctx.input.sha })
    if (lint.failed) return { status: "lint-failed" }

    const [tests, security] = await Promise.all([
      delegate(ctx, "test", { sha: ctx.input.sha }),
      delegate(ctx, "security", { sha: ctx.input.sha }),
    ])

    return { status: "ok", tests, security }
  },
})
```

Why: normal TypeScript control flow stays visible. Replay still works because expensive work is behind `ctx.exec()` through `delegate()`.

## 2. Worker Flow

Use a worker flow for one executable unit. Markers say how it may run.

```ts
export const lint = flow({
  name: "lint",
  parse: typed<{ sha: string }>(),
  tags: [remote(true), workerKind("code"), timeout(30_000)],
  factory: async (ctx) => runLinter(ctx.input.sha),
})
```

`remote(true)` means the extension may route it to a worker runner. Without a remote runner, the default test helper runs it locally through `next()`.

## 3. LLM Provider

Prefer AI provider as a service. The flow owns prompt shape and output parsing.

```ts
import { service, type Lite } from "@pumped-fn/lite"

interface Model {
  complete(ctx: Lite.ExecutionContext, input: { system: string; prompt: string }): Promise<string>
}

export const model = service<Model>({
  factory: () => {
    const client = new ClaudeModel()
    return {
      complete: async (_ctx, input) => client.complete(input),
    }
  },
})

export const classify = flow({
  name: "classify",
  parse: typed<{ text: string }>(),
  deps: { model },
  tags: [workerKind("llm")],
  factory: async (ctx, { model }) => {
    const raw = await model.complete(ctx, {
      system: "Return JSON only.",
      prompt: ctx.input.text,
    })
    return JSON.parse(raw) as { label: string }
  },
})
```

Test by preset, not by special agent hooks:

```ts
const scope = createScope({
  presets: [preset(model, { complete: async () => '{"label":"test"}' })],
})
```

## 4. CLI Worker Adapter

Use CLI helpers when the runtime must call real local tools like Claude or Codex.

```ts
const review = codexCliWorker({
  name: "codex-review",
  sandbox: "workspace-write",
  timeoutMs: 120_000,
})

const plan = claudeCliWorker({
  name: "claude-plan",
  timeoutMs: 120_000,
})
```

Keep CLI workers at the edge. Stable domain tests should use provider state and presets.

## 5. Durable Step

Use `durable(true)` for a step that should suspend until another process resolves it.

```ts
const approve = flow({
  name: "approve",
  parse: typed<{ title: string }>(),
  tags: [durable(true)],
  factory: () => {
    throw new Error("durable step should be resolved externally")
  },
})
```

First run writes a pending log entry and throws `SuspendSignal`. Replay returns the resolved value and continues.

## 6. Remote Runner

Remote routing belongs in `AgentRemoteRunner`, not inside workflow code.

```ts
const extension = createAgentExtension({
  log,
  remoteRunner: {
    run: async (event, next) => {
      if (canRoute(event.target)) return publishAndAwaitReply(event)
      return next()
    },
  },
})
```

The runner may short-circuit before worker dependencies resolve. If it calls `next()`, the worker runs locally.

## 7. Materials

Use materials for task state the workflow or workers must patch.

```ts
const inventory = material("inventory", {
  kind: "json",
  initialState: { items: [] as string[] },
})

await patchMaterial(ctx, inventory, [
  { op: "add", path: "/items/-", value: "typescript" },
])
```

Use derived materials for pure projections:

```ts
const count = derivedMaterial("inventory-count", inventory, (state) => state.items.length, {
  kind: "json",
})
```

## 8. Event Log Boundary

The event log key is `(taskId, runId, step)`. The step increments in standalone suspense `wrapExec`; the agent extension composes that lower layer.

```mermaid
sequenceDiagram
  participant W as Workflow
  participant E as Agent extension
  participant L as Event log

  W->>E: ctx.exec(flow)
  E->>L: lookup task/run/step
  alt completed
    L-->>E: result
    E-->>W: cached result
  else absent local
    E->>W: next()
    W-->>E: result
    E->>L: put completed
  else durable
    E->>L: put pending
    E--xW: SuspendSignal
  end
```

Because lite wraps the full executable step, cached replay and remote routing skip both dependency resolution and factory execution.

## 9. Failure Ownership

| Failure | Owner |
|---|---|
| Parse error | Flow boundary |
| Missing worker | `WorkerRegistry` / caller setup |
| CLI exit or timeout | `cliWorker()` |
| Material revision mismatch | Material writer |
| Pending durable step | Resolver / event log |
| Replay mismatch | Workflow determinism and event log |

Tests should prove the owning layer. Do not hide a missing dependency by adding a broad fake runner. Make the fake prove the exact behavior under test.

## 10. Add No Primitive Unless Forced

Before adding an agent SDK primitive, ask:

1. Can this be a marker on a `flow`?
2. Can this be a state/service dependency?
3. Can this be a `ctx.exec()` helper?
4. Can this be an extension policy?

Only add a primitive when all four answers are no and the new concept has its own lifecycle or type boundary.
