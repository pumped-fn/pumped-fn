# @pumped-fn/sdk

Agent and session primitives built on Lite. Lite owns graph resolution, execution, streaming, lifetimes, and the `createScope` seam. The SDK supplies stable definitions and durable data contracts.

## Migration to 3.0.0

3.0.0 removes the `Agent` facade and the material `session()` object. Every capability is now a
stable resource, flow, or tag composed through `createScope`. Migrate the removed facade imports
with this table:

| Removed in 2.x | Replacement in 3.0.0 |
|---|---|
| `agent(config)` facade | `agent.role` resource selected by `agent.config.role` |
| `agent.turn(input)` method | `ctx.exec({ flow: agent.turn, input })` |
| `session(record)` factory | `session.session` resource with `session.record` / `session.authority` tags |
| `send(message)` | `ctx.exec({ flow: session.run, input })` |
| `new Sandbox(policy)` | `sandbox.read`, `sandbox.write`, `sandbox.exec` flows with `sandbox.impl.*` bindings |

Before, the 2.x facade wired provider, tools, and session state implicitly:

```ts
const a = agent({ role, model, tools })
const before = await a.turn({ prompt: "Triage the ticket." })
```

In 3.0.0, the application declares the complete tree and then executes the entry flow:

```ts
const scope = createScope({
  tags: [
    session.authority(boundAuthority),
    session.record(loadedRecord),
    session.clock(clock),
    session.store.commit(commitSession),
    validation.engine(validationEngine),
    agent.config.role({ name: "triage", version: "1", instructions: "Triage the ticket." }),
    agent.impl.attempt(agent.fromModel),
    model(myScalarModel),
    session.execution.turn({ flow: agent.turn }),
  ],
})
const ctx = scope.createContext()
await ctx.resolve(session.session)
const after = await ctx.exec({
  flow: session.run,
  input: {
    work: { id: "t-1", branchId: "main", role: "triage", policy: "all" },
    input: { prompt: "Triage the ticket." },
  },
})
await ctx.close()
await scope.dispose()
```

No facade auto-collects tools or MCP servers, injects implicit dependencies, or passes `ctx`/`scope`
into callbacks. Tool selection stays tag-driven and fails closed when a required binding is absent.

## Package structure

| Import | Owns |
|---|---|
| `@pumped-fn/sdk` | Workflow steps, scalar models, eval helpers, and `runCli` |
| `@pumped-fn/sdk/agent` | Stable role, turn, provider, tool, skill, and subagent definitions |
| `@pumped-fn/sdk/session` | Durable records, live session runtime, work, branches, steering, storage, memory, scheduling, and observation |
| `@pumped-fn/sdk/validation` | Configurable Standard Schema validation |
| `@pumped-fn/sdk/sandbox` | Session-mediated read, write, and command port flows |

Import related tags as a namespace:

```ts
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import * as validation from "@pumped-fn/sdk/validation"
import * as sandbox from "@pumped-fn/sdk/sandbox"
```

## Execution model

```text
createScope
   |
session context -> session.run -> agent.turn
                              ├─ role + selected capability flows
                              └─ provider + backend adapters
```

`session.run`, `agent.turn`, `agent.role`, and `agent.fromModel` are module-level definitions. Composition happens through namespaced tags:

| Namespace | Meaning |
|---|---|
| `agent.config.*` | Role, tool, skill, and subagent metadata |
| `agent.impl.*` | Attempt, tool, skill, and subagent flow selection |
| `session.execution.*` | Per-execution turn selection |
| `session.current.*` | Work, attempt, branch, authority, and epoch bindings |
| `session.store.*`, `session.memory.*`, `session.scheduler.*` | Effect implementors |
| `session.observation.*` | Safe execution projection for extensions |

Executing the entry flow recursively activates its complete declared dependency tree before its factory starts. Required tags are checked at runtime during activation. Missing role config, validation, provider, session, tool backend, or store bindings fail at that boundary. Static missing-tag analysis is not part of this release.

The full-tree activation is also the test model. A test supplies tags or presets at `createScope`, executes the public entry flow, and gets the same tree with selected edges replaced. It does not mock every descendant.

## Database analysis

The tool below can inspect a schema and explain a query. It cannot apply DDL. Both physical backend flows and their readiness fact are required dependencies of the tool flows.

```ts
import { createScope, flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import { model } from "@pumped-fn/sdk"
import * as z from "zod"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import * as validation from "@pumped-fn/sdk/validation"

interface InspectInput {
  readonly schema: string
}

interface ExplainInput {
  readonly sql: string
}

const database = {
  ready: tag<{ readonly serverVersion: string }>({ label: "database.ready" }),
  inspect: tag<Lite.Flow<{ readonly tables: readonly string[] }, InspectInput>>({ label: "database.impl.inspect" }),
  explain: tag<Lite.Flow<{ readonly plan: string; readonly applied: false }, ExplainInput>>({ label: "database.impl.explain" }),
}

const inspectSchema = flow({
  name: "inspect_schema",
  tags: [agent.config.tool({
    version: "1",
    description: "Read the current database schema.",
    input: z.object({ schema: z.string() }),
  })],
  parse: typed<InspectInput>(),
  deps: {
    ready: tags.required(database.ready),
    inspect: tags.required(database.inspect),
  },
  factory: (ctx, { inspect }) => inspect.exec({ input: ctx.input }),
})

const explainQuery = flow({
  name: "explain_query",
  tags: [agent.config.tool({
    version: "1",
    description: "Explain a query without executing it.",
    input: z.object({ sql: z.string() }),
  })],
  parse: typed<ExplainInput>(),
  deps: {
    ready: tags.required(database.ready),
    explain: tags.required(database.explain),
  },
  factory: (ctx, { explain }) => explain.exec({ input: ctx.input }),
})

const scope = createScope({
  tags: [
    session.authority(boundAuthority),
    session.record(loadedRecord),
    session.clock(clock),
    session.store.commit(commitSession),
    validation.engine(zodEngine),
    agent.config.role({
      name: "database-analyst",
      version: "1",
      instructions: "Recommend query changes. Never apply schema changes.",
    }),
    agent.impl.tool(inspectSchema),
    agent.impl.tool(explainQuery),
    agent.impl.attempt(agent.fromModel),
    model(databaseModel),
    session.execution.turn({ flow: agent.turn }),
    database.ready({ serverVersion: "16" }),
    database.inspect(inspectDatabase),
    database.explain(explainDatabaseQuery),
  ],
})

const ctx = scope.createContext()
await ctx.resolve(session.session)
await ctx.exec({
  flow: session.run,
  input: {
    work: { id: "analysis-1", branchId: "main", role: "database-analyst", policy: "all" },
    input: { prompt: "Find the slow query and recommend an index." },
  },
})
await ctx.exec({ flow: session.finish })
await ctx.close()
await scope.dispose()
```

Activation reaches `inspectSchema` and `explainQuery`, then their readiness and backend tags, before `session.run` emits `work.started` or `agent.turn` calls the model. Tests prove that an absent readiness binding produces no model or database calls.

## GitHub issue triage

```text
GitHub issue -> session.run -> agent.turn -> repo + Postgres + Victoria
                                      |                    |
                                      +-> hypothesis -> cited verdict
```

The queue consumer is an application flow. It composes `controller(session.run)` with explicit receive, acknowledge, reject, lease, and timer port flows. Awaited controller executions provide blocking. Multiple consumer flows provide bounded concurrency. There is no worker registry or pool surface in the SDK.

The turn sees only tag-selected tools. A practical triage role can select:

- a repository search flow for code evidence;
- read-only Postgres schema, statistics, and `EXPLAIN` flows;
- VictoriaMetrics or VictoriaLogs query flows;
- a publication flow that accepts a validated verdict with citations and an idempotency key.

Backend readiness belongs in each tool's declared tree. Input and output validation belongs at the tool boundary. The model proposes a hypothesis; application flows decide whether evidence is fresh and sufficient for publication.

The runnable issue-triage verifier shipped with `@pumped-fn/sdk-test` proves all sixteen intake, containment, evidence, verdict, publication, retry, observation, and bounded-concurrency contracts with fake ports.

## Session lifecycle

The durable `SessionRecord` is data. The current-owned `SessionRuntime` coordinates attempts and registries for one activation. Resolve `session.session` in the context that owns the logical session before nested work.

Tagged and loaded records are validated recursively before activation: one root branch, authority fingerprints, branch and work lineage, current-branch references, owned artifacts, memory authorities, schedules, invocation idempotency keys, and other unique identities must agree. Memory mutation remains behind `session.memory.commit` and `session.memory.accept`; the runtime has no public raw memory writer. Commit accepts only session-sourced candidates with the requested normalized evidence. Accept requires an increasing human- or policy-sourced result for the same candidate and preserves its normalized evidence.

`session.finish` and context cleanup have different jobs:

| Path | Admission | Active attempts | Commit | Durable status |
|---|---|---|---|---|
| `session.finish` | Fenced by working or quarantined invocations | Joined | Once through `session.store.commit` | `finished` |
| `SessionRuntime.deactivate()` | Fenced | Aborted, then joined | Never | Unchanged |

The session resource registers `deactivate()` as cleanup. Cleanup does not commit, schedule, write memory, or call a model. Finish-first makes deactivation wait for the existing finish. Deactivate-first makes later finish fail without a commit.

`session.run` binds one `session.observation.current` projection for the activation. It contains `sessionId`, `activationId`, `workId`, optional `parentWorkId`, `role`, and an optional application-owned `channel` from `session.observation.channel`. A selected tool refines only its child execution with `tool`; sibling executions keep the base projection. Extensions can observe that safe projection without enumerating arbitrary execution tags or reading prompts, tool inputs, memory, credentials, or backend handles.

## Providers

`agent.impl.attempt` selects the provider attempt flow. Its neutral stream contains content deltas, reasoning deltas, and provider status. `agent.fromModel` adapts the scalar root `model` tag without inventing deltas.

```ts
const scope = createScope({
  tags: [
    model(myScalarModel),
    agent.impl.attempt(agent.fromModel),
  ],
})
```

Claude, Codex, and Pi export native attempt bindings for the same tag.

## Sandboxing

Sandbox policy and implementors are separate:

```ts
const tags = [
  sandbox.policy({
    roots: ["/workspace"],
    write: false,
    network: false,
    commands: ["git"],
    timeoutMs: 30_000,
    maxOutputBytes: 1_000_000,
  }),
  sandbox.impl.read(readFile),
  sandbox.impl.write(writeFile),
  sandbox.impl.run(runCommand),
]
```

The policy must fit the bound session authority. A missing implementation or wider policy fails before the effect.

## Deliberate absences

The SDK has no `WorkerRegistry`, material factory, `cliWorker`, or `channel`/`schedule`/`http` handle factory. Use `controller(flow)` for queue and child-flow composition, `runCli` for a declared CLI adapter, plain records for durable state, and application-owned inbound adapters.

It also has no built-in tools, automatic tool collection, context-bound handle registry, model-authorized permission expansion, cleanup-time business effects, or shared production scope factory.

## Testing

Every test builds its own `createScope({ tags, presets, extensions })`. Preset a direct dependency for a unit test. Bind only physical edge adapters for an outside-in test. Runtime missing-tag failures are accepted in this release; code analysis can report them later.
