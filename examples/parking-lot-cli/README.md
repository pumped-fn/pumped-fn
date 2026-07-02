# Parking Lot CLI

CLI entrypoint over the shared parking lot management flows.

## Canonical Shape

Parser setup stays thin. Each command builds a runtime object, creates a per-command Lite scope, presets the
shared store, injects actor and clock tags, executes the shared flow, and disposes the scope.

## Shape

- `src/cli.ts` wires CAC commands.
- `src/commands.ts` maps CLI command inputs to shared parking lot flows.
- `tests/commands.test.ts` drives the commands against the shared in-memory store.

## Run

```bash
pnpm test
pnpm typecheck
```
