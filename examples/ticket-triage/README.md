# Agent Practical

Runnable `@pumped-fn/sdk` example.

It proves:

- local agent turn with tools, skill loading, and subagent delegation
- workflow run inspection through `RunLog`
- Fetch `http()` adapter
- continuing `session()` material
- eval `summary()` artifact with two judges
- sandbox swap through the `sandbox` tag
- lazy Codex and Claude provider packages swapped through the `model` tag
- just-bash workspace sandbox swapped through the `sandbox` tag

## Canonical Shape

The example keeps agent runtime variation in tags and provider packages instead of branching the workflow
logic. Tests execute the public workflow surface and swap model, sandbox, and HTTP behavior through the
scope seam.

Run it:

```sh
pnpm -F @pumped-fn/ticket-triage test
pnpm -F @pumped-fn/ticket-triage typecheck
```
