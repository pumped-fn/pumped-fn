# SDK Lane

## Purpose

`pkg/sdk/` holds runtime-primitive packages built on Lite: durable workflow steps, sessions,
materials, event buffers, guards, sandboxes, CLI workers, and an eval harness. Agents and models
are one family of primitives in this lane, not the whole of it. `@pumped-fn/sdk` is the
counterpart to `@pumped-fn/pumped`: the SDK provides the primitives, `pumped` discovers, assembles,
and runs them.

## Structure

| Directory | Package | Role |
| --- | --- | --- |
| `core/` | `@pumped-fn/sdk` | Durable workflows, sessions, materials, events, guards, sandboxes, CLI workers, eval harness, and the agent/tool/skill primitive family. |
| `codex/` | `@pumped-fn/sdk-codex` | Module-level Codex CLI and ACP model providers. |
| `claude/` | `@pumped-fn/sdk-claude` | Module-level Claude CLI model provider. |
| `pi/` | `@pumped-fn/sdk-pi` | In-process pi-ai model provider with native tool calls. |
| `mcp/` | `@pumped-fn/sdk-mcp` | Expose flows as an MCP server; each flow carries its schema as a tag. |
| `bash/` | `@pumped-fn/sdk-just-bash` | just-bash sandbox provider tag. |
| `test/` | `@pumped-fn/sdk-test` | In-memory logs, fake routing, and test helpers. |

## Naming

Use `core` for the main SDK package and short provider handles for integrations. Directory names
should name the integration surface, while package names carry the `sdk` prefix.

## Content Rules

SDK packages should compose through Lite scopes, tags, flows, resources, and extensions. Provider
packages expose module-level handles plus config tags and keep provider-specific setup out of the core package.

## Testing

Provider packages carry `*.integration.test.ts` suites that invoke the machine's authenticated
CLIs and provider APIs. They skip unless `PUMPED_INTEGRATION=1` is set (pi additionally requires
`ANTHROPIC_API_KEY`), so default `pnpm test` runs stay hermetic.

## Boundaries

Do not place generic Lite runtime primitives, React UI bindings, or one-off examples in this lane.
If code is only a demonstration, it belongs in `examples/`.
