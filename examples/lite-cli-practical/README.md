# CLI practical examples

Runnable `@pumped-fn/lite` examples for command-line programs where startup cost matters.

The parser modules stay thin:

- `src/commander-cli.ts` wires Commander commands.
- `src/yargs-cli.ts` wires Yargs commands.
- `src/cac-cli.ts` wires CAC commands.

Each parser action dynamically imports the command implementation it needs. `--help`, parser setup, and
unrelated commands do not import the Lite graph. Command modules create a fresh scope and execution
context per operation, then install logging and observable extensions through normal tags.

## Run

```bash
pnpm test
pnpm typecheck
```
