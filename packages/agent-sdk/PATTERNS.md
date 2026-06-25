# Agent SDK Patterns

Use this package as a small convention layer over `@pumped-fn/lite`. If a use case can be expressed with `flow`, state/service, tags, and `ctx.exec`, do that before adding another primitive.

## 0. Standalone Suspense

Use suspense when the system needs deterministic replay or external resolution, but not agents, workers, or remote routing.

```ts
import { extension, runId, stepCounter, suspend, taskId } from "@pumped-fn/lite-extension-suspense"

const waitForCommit = flow({
  name: "wait-for-commit",
  parse: typed<{ revision: number }>(),
  tags: [suspend(true)],
  factory: () => {
    throw new Error("resolved by sync service")
  },
})

const scope = createScope({
  extensions: [extension({ log })],
})

const ctx = scope.createContext({
  tags: [
    taskId("doc-123"),
    runId("sync-42"),
    stepCounter({ next: 0 }),
  ],
})
```

Suspense has no agent knowledge. It sees tagged `ctx.exec` calls, assigns `(taskId, runId, step)`, returns completed/resolved log entries, writes pending entries for suspended steps, and throws `SuspendSignal`.

## 1. Workflow Flow

Use a workflow flow when code chooses order, branching, retries, and fan-out.

```ts
import { createScope, flow, tags, typed } from "@pumped-fn/lite"
import {
  eventLog,
  extension,
  runtime,
  step,
  workflow as workflowRuntime,
  workflowExtension,
  workflowRun,
  workerRegistry,
  workers,
  type RunLog,
} from "@pumped-fn/agent-sdk"

export const processPr = flow({
  name: "process_pr",
  parse: typed<PrEvent>(),
  tags: [
    step({ workflow: true }),
    workers(workerRegistry([lint, test, security])),
  ],
  deps: {
    workflow: tags.required(workflowRuntime),
    runtime: tags.required(runtime),
  },
  factory: async (ctx, { workflow, runtime }) => {
    const lintResult = await runtime.delegate<{ failed: boolean }>("lint", { sha: ctx.input.sha })
    if (lintResult.failed) return { taskId: workflow.taskId, status: "lint-failed" }

    const [tests, security] = await Promise.all([
      runtime.delegate("test", { sha: ctx.input.sha }),
      runtime.delegate("security", { sha: ctx.input.sha }),
    ])

    return { taskId: workflow.taskId, status: "ok", tests, security }
  },
})

export async function runProcessPr(input: PrEvent, log: RunLog) {
  const scope = createScope({
    extensions: [workflowExtension(), extension()],
    tags: [eventLog(log)],
  })
  const ctx = scope.createContext({
    tags: [workflowRun({ taskId: input.sha, runId: "run-1" })],
  })

  try {
    return await ctx.exec({ flow: processPr, input })
  } finally {
    await ctx.close()
    await scope.dispose()
  }
}
```

Why: normal TypeScript control flow stays visible. Replay still works because expensive work is behind `ctx.exec()` through `runtime.delegate()`.

`step({ workflow: true })` marks the flow as workflow policy surface. `workflowRun()` is a context tag for run metadata, passed through `createContext({ tags: [...] })`. `workflow` and `runtime` tags are required deps, so missing extensions fail before the factory runs. Event-log policy and remote routing stay normal extension composition.

## 2. Worker Flow

Use a worker flow for one executable unit. `step()` says how it may run.

```ts
export const lint = flow({
  name: "lint",
  parse: typed<{ sha: string }>(),
  tags: [step({ remote: true, kind: "code", timeoutMs: 30_000 })],
  factory: async (ctx) => runLinter(ctx.input.sha),
})
```

`remote: true` means the extension may route it to a worker runner. Without a remote runner, the default test helper runs it locally through `next()`.

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
  tags: [step({ kind: "llm" })],
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

## 4. Agent Application

Use `agent()` when the model should choose tools or delegate to another role. Keep the executable work as flows, and keep the model as a provider that can be tagged or faked.

```ts
const loadTicket = tool({
  description: "Load ticket details.",
  flow: flow({
    name: "load-ticket",
    parse: typed<{ id: string }>(),
    factory: (ctx) => ({ id: ctx.input.id, title: `ticket:${ctx.input.id}` }),
  }),
})

const provider: Model = {
  complete: (_ctx, request) => request.loadedSkills.length === 0
    ? {
        content: "need routing policy",
        skillCalls: [{ name: "routing-policy" }],
      }
    : request.round === 1
    ? {
        content: "loading",
        toolCalls: [{ name: "load-ticket", input: { id: "42" } }],
      }
    : {
        content: "ready",
        stop: true,
      },
}

const triage = agent({
  name: "triage",
  tags: [model(provider)],
  skills: [
    skill({
      name: "routing-policy",
      description: "Support routing rules.",
      content: "Route billing tickets to support.",
    }),
  ],
  tools: [loadTicket],
})

const result = await ctx.exec({
  flow: triage.turn,
  input: { prompt: "triage ticket 42" },
})
```

Why: tools and subagent turns still run through `ctx.exec()`, so the same workflow extension can replay, suspend, route, or time out the work. `events` is a boundary resource, so run inspection is testable without a global observer.

## 5. Agent Evals

Use deterministic checks for exact requirements and judges for qualitative requirements. A subjective eval with exactly one judge is rejected.

```ts
const accepts = judge({
  name: "accepts",
  evaluate: () => ({ name: "accepts", passed: true }),
})

const grounded = judge({
  name: "grounded",
  evaluate: () => ({ name: "grounded", passed: true }),
})

const evaluation = suite({
  name: "triage-quality",
  agent: triage,
  cases: [
    {
      name: "uses the loader",
      input: { prompt: "triage ticket 42" },
      checks: [used("load-ticket"), includes("ready")],
    },
  ],
  judges: [accepts, grounded],
})

const report = await runEval(ctx, evaluation)
const artifact = summary(report)
```

## 6. Run Inspection And HTTP

Use `inspect()` against a `RunLog` to read workflow steps by `(taskId, runId)`.

```ts
const run = await inspect(log, { taskId: "triage-42", runId: "run-1" })
```

Use `http()` to adapt a Fetch request to an agent turn without adding a server framework dependency.

```ts
const handle = http({ agent: triage })
const response = await ctx.exec({
  flow: handle,
  input: new Request("https://agent.local/run", {
    method: "POST",
    body: JSON.stringify({ prompt: "triage ticket 42" }),
  }),
})
```

## 7. Channels and Schedules

Use channel and schedule flows at the boundary. They should translate external shape into `TurnInput`, then let the agent turn own model/tool/subagent execution.

```ts
const slack = channel({
  name: "slack-message",
  parse: typed<{ text: string }>(),
  agent: triage,
  input: (ctx) => ({ prompt: ctx.input.text }),
})

const daily = schedule({
  name: "daily-digest",
  agent: triage,
  input: () => ({ prompt: "daily digest" }),
})
```

Why: Slack, HTTP, cron, queues, and CLIs stay adapters. The agent runtime still sees a flow input and a scoped execution context.

## 8. Sessions

Use `session()` for continuing message history. It is a material, so it uses the same patch and revision behavior as other task state.

```ts
const thread = session("support-session")

await send(ctx, thread, triage, { prompt: "triage ticket 42" })
await send(ctx, thread, triage, { prompt: "summarize the route" })
```

## 9. Sandbox Capability

Use `sandbox` as an injected capability, not as a global file or process API.

```ts
const readWorkspace = tool({
  description: "Read a file from the workspace.",
  flow: flow({
    name: "read-workspace",
    parse: typed<{ path: string }>(),
    deps: { sandbox: tags.required(sandbox) },
    factory: (ctx, deps) => deps.sandbox.readFile(ctx.input.path),
  }),
})

const scope = createScope({
  tags: [
    sandbox({
      readFile: (path) => `file:${path}`,
      writeFile: () => undefined,
      exec: (command, args = []) => ({
        stdout: [command, ...args].join(" "),
        stderr: "",
        exitCode: 0,
      }),
    }),
  ],
})
```

## 10. CLI Worker Adapter

Use CLI helpers when the runtime must call real local tools like Claude or Codex. Use harnesses when those tools should act as the agent model provider.

```ts
const review = codexCliWorker({
  name: "codex-review",
  sandbox: "workspace-write",
  isolate: { network: true },
  timeoutMs: 120_000,
})

const plan = claudeCliWorker({
  name: "claude-plan",
  isolate: { network: true },
  timeoutMs: 120_000,
})

const shared = guard("review-guard")

const reviewer = agent({
  name: "reviewer",
  tags: [model(codexHarness({ sandbox: "read-only", guard: shared }))],
})

const planner = agent({
  name: "planner",
  tags: [model(claudeHarness({ guard: shared }))],
})
```

`codexHarness()` runs `codex exec --ephemeral --ignore-user-config`. `claudeHarness()` runs `claude -p --no-session-persistence` and rejects `--bare`. Harness prompts request JSON with `content`, optional `guard`, and optional skill/tool/subagent calls. `guard` is the anti-goal; the first value collected from a run is kept in material state and injected into later prompts.

Harnesses default to bwrap isolation with network enabled. The default sandbox mounts only the workspace, temporary home, minimal runtime/cert/DNS paths, and explicit credential directories such as `codexHome`. Keep CLI workers at the edge. Stable domain tests should use provider state and presets.

## 11. Durable Step

Use `step({ durable: true })` for a step that should suspend until another process resolves it.

```ts
const approve = flow({
  name: "approve",
  parse: typed<{ title: string }>(),
  tags: [step({ durable: true })],
  factory: () => {
    throw new Error("durable step should be resolved externally")
  },
})
```

First run writes a pending log entry and throws `SuspendSignal`. Replay returns the resolved value and continues.

## 12. Remote Runner

Remote routing belongs in `RemoteRunner`, not inside workflow code.

```ts
const scope = createScope({
  extensions: [
    workflowExtension({ log }),
    extension({
      remoteRunner: {
        run: async (event, next) => {
          if (canRoute(event.target)) return publishAndAwaitReply(event)
          return next()
        },
      },
    }),
  ],
})
```

The runner may short-circuit before worker dependencies resolve. If it calls `next()`, the worker runs locally.

## 13. Materials

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

## 14. Event Log Boundary

The event log key is `(taskId, runId, step)`. The step increments in standalone suspense `wrapExec`; `workflowExtension()` composes that lower layer.

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

1. Can this be a tag on a `flow`?
2. Can this be a state/service dependency?
3. Can this be a `ctx.exec()` helper?
4. Can this be an extension policy?

Only add a primitive when all four answers are no and the new concept has its own lifecycle or type boundary.
