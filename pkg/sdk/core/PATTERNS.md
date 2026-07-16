# SDK patterns

## Declare the whole graph

Executing an entry flow recursively activates its complete declared dependency tree before the entry factory starts.

```text
session.run -> agent.turn -> agent.role -> selected capability flows
                          -> provider + validation + backend readiness
```

This is the intended composition and testing model. Tests replace edges at `createScope`; they do not mock descendants. Missing required tags are runtime activation errors in this release. Static analysis can report them later.

## Group tags by meaning

Use namespaces for configuration, implementations, and execution facts.

```ts
export const database = {
  config: {
    connection: tag<ConnectionConfig>({ label: "database.config.connection" }),
  },
  impl: {
    inspect: tag<Inspect>({ label: "database.impl.inspect" }),
  },
  execution: {
    tenant: tag<string>({ label: "database.execution.tenant" }),
  },
}
```

The SDK follows the same split with `agent.config.*`, `agent.impl.*`, `session.execution.*`, `session.current.*`, and `session.observation.*`.

## Prefer stable definitions

`session.run`, `agent.turn`, `agent.role`, and `agent.fromModel` are stable module-level definitions. Select their behavior through tags.

```ts
const tags = [
  agent.config.role({ name: "triage", version: "1" }),
  agent.impl.tool(inspectIssue),
  agent.impl.skill(incidentPolicy),
  agent.impl.subagent(reviewHypothesis),
  agent.impl.attempt(agent.fromModel),
  model(provider),
  session.execution.turn({ flow: agent.turn }),
]
```

Do not build per-use role, turn, tool, skill, subagent, or session handles. Do not store context-bound `FlowHandle` values in a registry.

## Put readiness in the tool tree

A tool is an ordinary flow carrying `agent.config.tool` metadata. Its dependencies prove the backend is ready.

```ts
const inspectIssue = flow({
  name: "inspect_issue",
  tags: [agent.config.tool({
    version: "1",
    description: "Read issue and repository evidence.",
    input: issueSchema,
  })],
  deps: {
    repository: tags.required(repository.impl.inspect),
    ready: tags.required(repository.ready),
  },
  factory: (ctx, { repository }) => repository.exec({ input: ctx.input }),
})
```

Because `agent.role` collects `agent.impl.tool` flows and activation is recursive, missing readiness fails before `session.run` emits `work.started` or the model is called.

## Use controllers for composition

Static child flows belong in `controller(flow)` dependencies.

```ts
const consumeIssue = flow({
  name: "github.issue.consume",
  deps: {
    receive: controller(receiveIssue),
    triage: controller(session.run),
    ack: controller(ackIssue),
    reject: controller(rejectIssue),
  },
  factory: async (_ctx, { receive, triage, ack, reject }) => {
    const issue = await receive.exec()
    try {
      const verdict = await triage.exec({ input: issue.work })
      await ack.exec({ input: { id: issue.id, verdict } })
    } catch (error) {
      await reject.exec({ input: { id: issue.id, error } })
      throw error
    }
  },
})
```

Awaiting the controller blocks. Starting several consumer executions provides concurrency. Joining their promises provides a join. A fixed number of consumers provides a bounded queue worker set without a public pool or worker registry.

## Keep observation narrow

`session.run` binds `session.observation.current` for the activation:

```ts
interface ObservationProjection {
  readonly sessionId: string
  readonly activationId: string
  readonly workId: string
  readonly parentWorkId?: string
  readonly role: string
  readonly channel?: string
  readonly tool?: string
}
```

Bind `session.observation.channel("github")` on an execution to add an application-owned channel label.
`session.run` carries it into the activation projection. A selected tool refines only its child execution
with the tool name. Siblings do not inherit that tool field. Extensions may read this projection. Do not
expose arbitrary tag enumeration, prompts, tool inputs, memory, credentials, or backend handles.

## Separate finish from deactivation

```text
session.finish: fence -> join -> commit once -> finished
deactivate:     fence -> abort -> join        -> no record mutation
```

The current-owned session resource calls `deactivate()` during cleanup. Cleanup never commits, schedules work, writes memory, or calls a model. Call `session.finish` explicitly when durable completion is required.

## Place state and effects deliberately

| Need | Primitive |
|---|---|
| Durable semantic state | Plain record |
| Live activation coordination | Current-owned resource |
| One effect | Flow |
| Static child execution | `controller(flow)` |
| Config or implementation choice | Namespaced tag |
| Per-execution binding | Execution tag |
| Test substitution | `createScope({ presets, tags, extensions })` |

## Deliberate absences

- No `WorkerRegistry` or automatic worker pool.
- No material factory; durable state is plain data.
- No `cliWorker`; use a declared flow around `runCli`.
- No `channel`, `schedule`, or `http` handle factory; inbound adapters are application flows.
- No built-in tools or automatic capability collection.
- No shared scope builder.
- No business effect in cleanup.
- No single model verdict as authority for publication, memory acceptance, or permission expansion.
