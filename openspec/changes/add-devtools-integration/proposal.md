# Change: Add Devtools via Extension + Fire-and-Forget Transports

**Status: MERGED** - 2025-12-09
> Specs created at `openspec/specs/devtools/spec.md`. Implementation was already complete.

## Why

Developers need observability into pumped-fn applications - seeing atom resolution timing, flow execution, dependency graphs, and errors. This enables debugging and performance optimization without modifying application code.

## What Changes

- Create new `@pumped-fn/devtools` package
- Implement as Extension using existing `wrapResolve` and `wrapExec` hooks
- Fire-and-forget transports (never block app code)
- Built-in transports: `memory()`, `broadcastChannel()`, `consoleTransport()`
- Batched emission via queue + microtask flush

**Key constraints:**
1. Never block app code (fire-and-forget, no await)
2. Silent failure (transport errors caught, not thrown)
3. Batched emission (queue + microtask flush)

## Impact

- Affected specs: `specs/devtools` (new)
- Affected code: New `packages/devtools/` directory
- No changes to `@pumped-fn/lite` (Extension system is sufficient)
- Source ADR: `.c3/adr/adr-015-devtools-integration.md`
