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

Before, the 2.x facade wired provider, tools, and session state implicitly. In 3.0.0, the application declares those definitions and bindings in `createScope`. The minimal setup below shows the required validation and session bindings.

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

The root entry groups these public helpers:

| Export | Use |
|---|---|
| `workflowExtension`, `extension` | Add workflow replay and timeout behavior, then SDK remote-step behavior |
| `step`, `workflowRun`, `workflow`, `abortSignal` | Tag steps and read the active workflow identity or cancellation signal |
| `model`, `complete` | Bind and execute a scalar model flow |
| `suite`, `runEval`, `summary` | Define, run, and serialize deterministic agent evaluations |
| `inspect`, `RunLog` | Reconstruct one stored workflow run from a queryable event log |
| `runCli`, `CliWorkerError` | Run a CLI adapter and inspect typed failure details |

Import related tags as a namespace:

```ts
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import * as validation from "@pumped-fn/sdk/validation"
import * as sandbox from "@pumped-fn/sdk/sandbox"
```

## Minimal setup

```ts
import { createScope } from "@pumped-fn/lite"
import * as z from "zod"
import * as session from "@pumped-fn/sdk/session"
import * as validation from "@pumped-fn/sdk/validation"

const validationEngine = validation.standard<z.ZodType>({
  id: "zod@4",
  toJsonSchema: (schema) => z.toJSONSchema(schema),
})

const authority = session.createAuthority({
  tenant: "acme",
  roots: ["/workspace"],
  permissions: [],
  tools: [],
  sandbox: {
    roots: ["/workspace"],
    commands: [],
    write: false,
    network: false,
  },
})

const record: session.SessionRecord = {
  id: "session-1",
  version: 0,
  schemaVersion: 1,
  status: "open",
  authorityFingerprint: authority.fingerprint,
  authorityConstraints: authority,
  currentBranchId: "main",
  branches: [{
    id: "main",
    version: 0,
    createdBy: "bootstrap",
    authorityFingerprint: authority.fingerprint,
    authority,
    evidence: [],
  }],
  work: [],
  attempts: [],
  invocations: [],
  artifacts: [],
  memory: [],
  schedules: [],
  providerContinuations: {},
  nextEventSequence: 1,
}

const scope = createScope({
  tags: [
    validation.engine(validationEngine),
    session.authority(authority),
    session.record(record),
    session.clock({ now: () => new Date().toISOString() }),
  ],
})
const ctx = scope.createContext()
await ctx.resolve(session.session)
await ctx.close()
await scope.dispose()
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

Register `workflowExtension(...)` before `extension(...)` in `createScope({ extensions })`. The SDK extension reads the workflow context set by the workflow extension, so the reverse order fails on the first execution.

A step `timeoutMs` rejects at the deadline and aborts the `abortSignal` tag. Step work must observe that signal to stop; JavaScript work that ignores it cannot be forcibly cancelled.

| Namespace | Meaning |
|---|---|
| `agent.config.*` | Role, tool, skill, and subagent metadata |
| `agent.impl.*` | Attempt, tool, skill, and subagent flow selection |
| `session.execution.*` | Per-execution turn selection |
| `session.current.*` | Work, attempt, branch, authority, and epoch bindings |
| `session.store.*`, `session.memory.*`, `session.scheduler.*` | Effect implementors |
| `session.observation.*` | Safe execution projection for extensions |

### Work admission

`session.run` requires a stable work identity, role, and failure policy. Branch has an unconditional default:

```ts
const work: session.AdmitWorkInput = {
  id: "review-42",
  role: "reviewer",
  policy: "all",
}
```

At admission, an omitted `branchId` resolves to `session.record.currentBranchId`. The resulting `WorkRecord` stores the effective branch and explicit policy. A ready work item may resume with the same omitted branch, but a later explicit branch that resolves differently fails the resume contract.

`id` stays required because it is the deduplication and resume key. `role` stays required because admission has no unconditional, recorded source from which to choose one. `policy` stays required because it controls failure handling. Defaulting it to `"all"` would be fail-open: an orchestrator carrying `work.policy` into `session.join` would leave sibling work running after a child fails.

Executing the entry flow recursively activates its complete declared dependency tree before its factory starts. Required tags are checked at runtime during activation. Missing role config, validation, provider, session, tool backend, or store bindings fail at that boundary. Static missing-tag analysis is not part of this release.

The full-tree activation is also the test model. A test supplies tags or presets at `createScope`, executes the public entry flow, and gets the same tree with selected edges replaced. It does not mock every descendant.

## Database analysis

The tool below can inspect a schema and explain a query. It cannot apply DDL. Both physical backend flows and their readiness fact are required dependencies of the tool flows.

```ts
import { flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import * as z from "zod"
import * as agent from "@pumped-fn/sdk/agent"

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
  tags: agent.config.tool({
    version: "1",
    description: "Read the current database schema.",
    input: z.object({ schema: z.string() }),
  }),
  parse: typed<InspectInput>(),
  deps: {
    ready: tags.required(database.ready),
    inspect: tags.required(database.inspect),
  },
  factory: (ctx, { inspect }) => inspect.exec({ input: ctx.input }),
})

const explainQuery = flow({
  name: "explain_query",
  tags: agent.config.tool({
    version: "1",
    description: "Explain a query without executing it.",
    input: z.object({ sql: z.string() }),
  }),
  parse: typed<ExplainInput>(),
  deps: {
    ready: tags.required(database.ready),
    explain: tags.required(database.explain),
  },
  factory: (ctx, { explain }) => explain.exec({ input: ctx.input }),
})

const toolBindings = [
  agent.impl.tool(inspectSchema),
  agent.impl.tool(explainQuery),
]
```

Add `toolBindings` to the session scope from the minimal setup, along with application-owned `database.ready`, `database.inspect`, and `database.explain` bindings. Activation reaches the selected tool and its readiness and backend tags before its factory starts. Tests prove that an absent readiness binding produces no model or database calls.

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

The issue-triage example tests its intake, containment, evidence, verdict, publication, retry, and concurrency contracts as independent cases through `createScope` and public flows.

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
import { createScope, flow, typed } from "@pumped-fn/lite"
import { model, type Model, type ModelRequest } from "@pumped-fn/sdk"
import * as agent from "@pumped-fn/sdk/agent"

const scalarModel: Model = flow({
  name: "model.local",
  parse: typed<ModelRequest>(),
  factory: () => ({ content: "Done.", stop: true }),
})

const scope = createScope({
  tags: [
    model(scalarModel),
    agent.impl.attempt(agent.fromModel),
  ],
})

await scope.dispose()
```

Claude, Codex, and Pi export native attempt bindings for the same tag.

## Sandboxing

Sandbox policy and implementors are separate. This creates the policy binding:

```ts
import * as sandbox from "@pumped-fn/sdk/sandbox"

const sandboxPolicy = sandbox.policy({
  roots: ["/workspace"],
  write: false,
  network: false,
  commands: ["git"],
  timeoutMs: 30_000,
  maxOutputBytes: 1_000_000,
})
```

Add `sandboxPolicy` and application flows bound through `sandbox.impl.read`, `sandbox.impl.write`, and `sandbox.impl.run` to the session scope. The policy must fit the bound session authority. A missing implementation or wider policy fails before the effect. The SDK aborts `sandbox.exec` after `timeoutMs` and truncates its streamed and returned UTF-8 output to `maxOutputBytes`. The `sandbox.impl.run` binding must observe its execution signal to stop timed-out work and must enforce the `network` setting in its process or runtime isolation.

## Deliberate absences

The SDK has no `WorkerRegistry`, material factory, `cliWorker`, or `channel`/`schedule`/`http` handle factory. Use `controller(flow)` for queue and child-flow composition, `runCli` for a declared CLI adapter, plain records for durable state, and application-owned inbound adapters.

It also has no built-in tools, automatic tool collection, context-bound handle registry, model-authorized permission expansion, cleanup-time business effects, or shared production scope factory.

## Testing

Every test builds its own `createScope({ tags, presets, extensions })`. Preset a direct dependency for a unit test. Bind only physical edge adapters for an outside-in test. Runtime missing-tag failures are accepted in this release; code analysis can report them later.
