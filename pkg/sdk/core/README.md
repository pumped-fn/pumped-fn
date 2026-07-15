# @pumped-fn/sdk

Pumped-fn SDK primitives for durable agent work. The SDK adds names and contracts. Lite still owns dependency resolution, execution, streaming, and the scope seam.

## Package structure

| Import | Owns |
|---|---|
| `@pumped-fn/sdk` | Workflow, material, CLI, eval, and scalar `Model` primitives |
| `@pumped-fn/sdk/agent` | Roles, tools, skills, subagents, turns, and provider attempts |
| `@pumped-fn/sdk/session` | Durable records, live session runtime, work, branches, steering, storage, memory, and scheduling |
| `@pumped-fn/sdk/validation` | Configurable Standard Schema validation |
| `@pumped-fn/sdk/sandbox` | Session-mediated read, write, and command port flows |

The root does not re-export the four subpaths. Import a namespace when several tags or flows share one meaning.

```ts
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import * as validation from "@pumped-fn/sdk/validation"
import * as sandbox from "@pumped-fn/sdk/sandbox"
```

## Execution model

```text
Host scope ──owns──> physical adapters
    │
    └──> Session resource ──admits──> Work attempt
              │                         │
              ├──authorizes──> Tool resource
              └──binds───────> Role resource ──runs──> Turn flow
```

The durable `SessionRecord` is data. The current-owned `SessionRuntime` coordinates live attempts. Physical model, database, sandbox, store, and scheduler adapters belong to a host context that encloses logical sessions.

A session never retains an execution context and never closes its host. `session.finish` fences admission, joins owned attempts, commits through the declared store flow, and seals the runtime. Context cleanup only releases owned resources.

Resolve `session.session` in the context that owns the logical session before any nested run. The resource uses `ownership: "current"`: if the first resolution happens inside `session.run`, that invocation owns a temporary runtime and its record changes disappear when the invocation closes.

```ts
const sessionCtx = scope.createContext({ tags: [
  session.authority(boundAuthority),
  session.record(loadedRecord),
  session.clock({ now: () => new Date().toISOString() }),
] })

await sessionCtx.resolve(session.session)
await sessionCtx.exec({ flow: analyze, input })
await sessionCtx.exec({ flow: session.finish })
await sessionCtx.close()
```

## Primitive map

| SDK primitive | Lite primitive | Reason |
|---|---|---|
| Role | current-owned `resource()` | Resolve declared tools and skills before the first model call |
| Tool | current-owned `resource()` containing an inert `flow()` | Separate readiness from invocation |
| Turn | streaming `flow()` | Own one model and dispatch loop |
| Session runtime | current-owned `resource()` | Coordinate work without storing a context-bound handle |
| Store, memory, scheduler, sandbox | namespaced tags carrying flows | Make effects explicit and replaceable |
| Provider attempt | tagged streaming `flow()` | Share one neutral stream contract across providers |
| Scalar model | root `model` tag plus `complete` flow | Preserve the small provider seam |

## Validation

The engine is configuration. Zod and Valibot stay at the application edge.

```ts
import * as z from "zod"
import * as validation from "@pumped-fn/sdk/validation"

export const validationBinding = validation.engine(validation.standard<z.ZodType>({
  id: "zod@4",
  toJsonSchema: (schema) => z.toJSONSchema(schema),
}))
```

Every advertised tool is already resolved and has one identity:

```text
name + version + schema digest + validation engine + readiness + flow name
```

The model sees only tools that are declared by the role, resolved in the current session, and permitted by the bound authority. Dispatch validates through the same engine and rechecks the same identity and epoch.

## Database-analysis example

This tool can inspect a schema. It cannot apply DDL because its authority and output contract do not allow it.

```ts
import { flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import * as z from "zod"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"

interface SchemaInput {
  readonly schema: string
}

interface SchemaResult {
  readonly tables: readonly string[]
}

interface DatabaseReadiness {
  readonly serverVersion: string
}

const database = Object.freeze({
  inspect: tag<Lite.Flow<SchemaResult, SchemaInput>>({ label: "database.inspect" }),
  ready: tag<DatabaseReadiness>({ label: "database.ready" }),
})

const inspectSchemaFlow = flow({
  name: "database.inspect_schema",
  parse: typed<SchemaInput>(),
  deps: { impl: tags.required(database.inspect) },
  factory: (ctx, { impl }) => impl.exec({ input: ctx.input }),
})

const inspectSchema = agent.tool({
  name: "inspect_schema",
  version: "1",
  description: "Read the current database schema.",
  input: z.object({ schema: z.string() }),
  flow: inspectSchemaFlow,
  deps: { ready: tags.required(database.ready) },
})

const analyst = agent.role({
  name: "database-analyst",
  version: "1",
  instructions: "Recommend query changes. Never apply schema changes.",
  tools: { inspectSchema },
})

const analyzeTurn = agent.turn({ name: "database.analyze", role: analyst })
const analyze = session.run({ name: "database.analysis", turn: analyzeTurn })
```

The application supplies the session record, authority, validation engine, provider attempt, store, and database adapters through `createScope({ tags, presets, extensions })`. Tests replace the same edges. No module mock or shared scope factory is needed.

Parallel analysis uses child `WorkRecord`s. `session.join` waits for attempts; it does not merge branch state. `session.merge` requires the expected target version and accepts only related branches whose work has settled.

Waiting work persists both an admitted work record and a schedule intent before the owner closes. A later host loads and rebinds authority, then calls `session.wake` with the persisted intent id.

Work and branch records store their full narrowed authority, not only its fingerprint. The same authority and attempt epoch are bound before role, tool, provider, database, or sandbox resolution. Tool permits are isolated by identity, narrowed authority, and epoch. Artifact and memory adapter results must match their bound branch before entering the record.

Artifacts, memory decisions, invocation status, and provider continuation ids mutate the live `SessionRecord`; the owner chooses when to checkpoint it. Once finish begins, new semantic mutations are rejected. Only already-active attempt and invocation settlement may complete.

Steering is attempt-and-epoch fenced. Stale events are ignored, queue/input events become messages at the next model-round boundary, and interrupt/cancel events abort the active attempt. `session.events` replays the runtime's monotonic, clock-stamped event stream.

## Provider attempts

`agent.attempt` is the rich provider port. Its neutral events are content deltas, reasoning deltas, and provider status. `agent.fromModel()` adapts an existing scalar model without inventing deltas.

```ts
import { createScope } from "@pumped-fn/lite"
import { model } from "@pumped-fn/sdk"
import * as agent from "@pumped-fn/sdk/agent"

const scope = createScope({
  tags: [
    model(myScalarModel),
    agent.attempt(agent.fromModel(myScalarModel)),
  ],
})
```

Claude, Codex, and Pi packages provide native attempt bindings. Their scalar exports drain the same provider execution path.

## Sandboxing

Sandbox policy and implementors are separate namespaces.

```ts
import * as sandbox from "@pumped-fn/sdk/sandbox"

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

The policy must be a subset of session authority. A missing implementor or wider policy fails before the effect. Validation hashing and POSIX sandbox containment use runtime-neutral implementations; the core subpaths do not require Node built-ins.

## Workflow and eval adapters

Stable workflow primitives remain at the root: `step`, `workflowRun`, `workflowExtension`, materials, CLI workers, `inspect`, and scalar `Model`.

Inbound adapters now receive a flow directly:

```ts
const inbound = channel({
  name: "database-analysis-channel",
  parse: typed<{ prompt: string }>(),
  turn: analyze,
  input: (ctx) => ({
    work: {
      id: "analysis-1",
      branchId: "main",
      role: "database-analyst",
      policy: "all",
    },
    input: { prompt: ctx.input.prompt },
  }),
})
```

`schedule`, `http`, and `suite` use the same pattern. They do not own an agent runtime.

## SDK 2 to SDK 3

| SDK 2 | SDK 3 |
|---|---|
| root `agent()` and `Agent` | `agent.role()` plus `agent.turn()` |
| `AgentOptions` | `agent.RoleOptions` plus `agent.TurnOptions` |
| `agent.turn` property | exported turn flow |
| root `tool()` | `agent.tool()` resource |
| root `Tool` and `ToolOptions` | `agent.ResolvedTool`, `agent.ToolSnapshot`, and `agent.ToolOptions` |
| root `skill()` | `agent.skill()` resource |
| root `Skill` and `SkillOptions` | `agent.ResolvedSkill` and `agent.SkillOptions` |
| root `sub()` | `agent.subagent()` and child work |
| root `Sub`, `SubOptions`, and `SubResult` | `agent.SubagentDefinition`, `agent.SubagentOptions`, and `agent.SubagentResult` |
| `TurnResult.agentName` | `agent.TurnResult.role` |
| `ToolResult.id` and `SkillResult.id` | `callId` |
| root `session()` material | `session.SessionRecord` plus `session.session` resource |
| `SessionState` and `SessionOptions` | `session.SessionRecord`, `session.Authority`, and session configuration tags |
| `send()` | `session.run()` plus explicit `session.finish` |
| root `Event`, `EventType`, `EventBuffer`, and `events` | `session.SessionEvent` and `session.events` |
| root `sandbox` method bag | `sandbox.read`, `sandbox.write`, `sandbox.exec`, and `sandbox.impl` tags |
| root `Sandbox` and `SandboxExecResult` | `sandbox.Policy`, `sandbox.Read`, `sandbox.Write`, `sandbox.Run`, and `sandbox.ExecResult` |
| `channel({ agent })`, `schedule({ agent })`, `http({ agent })` | the same adapters with `{ turn }` |
| `suite({ agent })` | `suite({ turn })` |

SDK 3 has no legacy execution loop. Existing scalar `Model`, `model`, and `complete` remain available.

## Anti-goals

- No built-in tools or automatic tool discovery.
- No context-bound flow handle stored in a session or tool registry.
- No model-authorized memory acceptance, permission expansion, or database apply.
- No business effect in cleanup hooks.
- No shared production scope factory.
- No MCP or native-Claude tool surface in this migration.
- No single model verdict as release evidence.

## Testing

The scope is the seam. Build each test with only public definitions and `createScope({ tags, presets, extensions })`. Resolve physical resources in a host context when two sessions must share them. Close logical sessions before the host, then dispose the scope.
