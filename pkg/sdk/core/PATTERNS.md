# SDK patterns

## Authoring rule

Use tags for configuration and implementors. Group related tags in a namespace.

```ts
export const database = Object.freeze({
  config: tag<DatabaseConfig>({ label: "database.config" }),
  engine: tag<DatabaseEngine>({ label: "database.engine" }),
})
```

Declare the static graph. Required tags belong in `deps`. Do not supply a built-in implementation.

```ts
export const inspectSchema = flow({
  name: "database.inspect_schema",
  parse: typed<InspectInput>(),
  deps: {
    config: tags.required(database.config),
    engine: tags.required(database.engine),
  },
  factory: (ctx, deps) => deps.engine.inspect(deps.config, ctx.input),
})
```

Test at the needed radius through `createScope({ tags, presets, extensions })`. Preset direct dependencies for a unit test. Bind only edge adapters for an outside-in test.

## Placement

| Need | Primitive |
|---|---|
| Durable semantic state | Plain record |
| Live owned coordination | Current-owned resource |
| One effect | Flow |
| Config or implementor | Namespaced tag |
| Model and dispatch loop | Turn flow |
| Tool readiness | Resource containing an inert flow |
| Physical shared adapter | Root-pre-resolved resource |

## Session lifetime

The host owns contexts. A session owns semantic state and live attempts.

```text
host context
  ├─ physical provider
  ├─ physical database
  └─ session context
       ├─ SessionRuntime
       ├─ Role
       └─ Tool readiness
```

Call `session.finish` before closing the session context. Finish fences, joins, commits, and seals. Cleanup only aborts or releases owned live resources.

After finish begins, do not publish late provider reservations, continuations, branches, controls, tools, artifacts, or memory. The runtime rejects these mutations while allowing already-active work and invocations to settle.

Resolve `session.session` in this context before calling a nested flow. Current ownership follows the context that first resolves the resource. A run that performs the first resolution owns only a temporary runtime, so its record is not a durable session checkpoint.

## Admission

Admit work before resolving the selected role, tool, provider, database, or sandbox dependency. Keep child roles and turns as inert definitions. `session.run()` owns the admission edge and invokes the supplied turn only after binding current work, attempt, branch, and epoch tags.

## Tools

A tool resource proves readiness. Its value contains schema metadata and the raw flow definition. Never store a `FlowHandle`; it belongs to the context that resolved it.

The turn performs dispatch in this order:

```text
snapshot identity -> authority and epoch -> schema validation -> ctx.exec(raw flow)
```

## Branches and parallel work

Start child runs first, then `session.join`. Join waits for execution only. Call `session.merge` with the target's expected version when durable branch state should move. Merge rejects unrelated branches and branches with active or unsettled work. Fail-fast cancellation aborts siblings and waits for their settlement.

## Steering

Fence controls with the current work attempt and snapshot epoch. Queue and input controls are delivered between model rounds. Interrupt and cancel controls abort the active attempt. Stale controls never cross a wake, retry, or resume boundary.

## Waiting and scheduling

Waiting owns no model, database, or sandbox lease. Persist the admitted work and full schedule intent in the same checkpoint. Wake by persisted intent id after a fresh load and authority rebind.

## Memory and artifacts

Publish artifact content before placing its immutable digest reference in a checkpoint. Model output may propose candidate memory. A separate host or policy flow must accept it.

## Providers

Keep scalar `Model` and `complete` for simple use. Bind `agent.attempt` when streaming, continuation, steering, or cancellation matters. Scalar and streaming wrappers must share one provider execution path.

## Anti-patterns

- A role object with `.turn()` or `.exec()` methods.
- A session retaining an execution context.
- A registry storing context-bound handles.
- A tool advertised before readiness resolves.
- A cleanup hook that commits, schedules, writes memory, or calls a model.
- A shared scope builder.
- An automatic tool collector.
