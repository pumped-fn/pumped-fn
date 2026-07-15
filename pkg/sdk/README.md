# SDK Lane

## Purpose

`pkg/sdk/` holds agent runtime packages built on Lite: durable workflow steps, session records and runtimes, roles, turns, provider attempts, sandbox ports, validation, and an eval harness. The application composes these definitions through `createScope`; the SDK does not discover or assemble tools automatically.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `core/` | `@pumped-fn/sdk` | Workflow, model, eval, and `runCli` helpers plus canonical `agent`, `session`, `validation`, and `sandbox` subpaths. |
| `codex/` | `@pumped-fn/sdk-codex` | Module-level Codex CLI and ACP model providers. |
| `claude/` | `@pumped-fn/sdk-claude` | Module-level Claude CLI model provider. |
| `pi/` | `@pumped-fn/sdk-pi` | In-process pi-ai model provider with native tool calls. |
| `mcp/` | `@pumped-fn/sdk-mcp` | Explicit MCP server adapter for selected flows. |
| `bash/` | `@pumped-fn/sdk-just-bash` | just-bash sandbox port-flow implementors. |
| `test/` | `@pumped-fn/sdk-test` | In-memory logs, provider attempts, session stores, and scope-seam harnesses. |

## Naming

Use `core` for the main SDK package and short provider handles for integrations. Directory names
should name the integration surface, while package names carry the `sdk` prefix.

## Content Rules

SDK packages compose through Lite scopes, namespaced tags, flows, resources, and extensions. `session.run`, `agent.turn`, `agent.role`, and `agent.fromModel` are stable definitions. `agent.config.*` describes a role or capability, `agent.impl.*` selects tool, skill, subagent, and attempt flows, and `session.execution.*` selects the turn. A session and role are resources. Turns and effects are flows.

Executing an entry flow recursively activates its complete declared dependency tree. Required tags are runtime activation requirements. This is deliberate: a tool backend or provider that is not ready fails before the entry factory can emit `work.started` or call a model. Tests substitute edges through `createScope({ presets, tags, extensions })` instead of mocking the tree.

Queue consumers use ordinary controller composition:

```text
receive flow -> controller(session.run) -> ack flow
                         |
                  agent.turn graph
```

Awaited executions provide blocking and joining. Multiple consumer flows provide concurrency. There is no SDK worker registry or pool abstraction.

## Testing

Provider packages carry `*.integration.test.ts` suites that invoke the machine's authenticated
CLIs and provider APIs. They skip unless `PUMPED_INTEGRATION=1` is set (pi additionally requires
`ANTHROPIC_API_KEY`), so default `pnpm test` runs stay hermetic.

## Boundaries

Do not place generic Lite runtime primitives, React UI bindings, or one-off examples in this lane. The SDK has no `WorkerRegistry`, material factory, `cliWorker`, or `channel`/`schedule`/`http` handle factory. Use flows, controllers, tags, session records, `runCli`, and application-owned adapters. If code is only a demonstration, it belongs in `examples/`.
