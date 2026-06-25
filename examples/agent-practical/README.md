# Agent Practical

Runnable `@pumped-fn/agent-sdk` example.

It proves:

- local agent turn with tools, skill loading, and subagent delegation
- workflow run inspection through `RunLog`
- Fetch `http()` adapter
- continuing `session()` material
- eval `summary()` artifact with two judges
- sandbox swap through the `sandbox` tag
- lazy Codex and Claude provider packages swapped through the `model` tag
- just-bash workspace sandbox swapped through the `sandbox` tag

Run it:

```sh
pnpm -F @pumped-fn/agent-practical test
pnpm -F @pumped-fn/agent-practical typecheck
```
