# Examples

`examples/` holds runnable applications that show pumped-fn in real code. Start with invoice triage when you want a full app shape instead of a tiny API tour. For package and API docs, start from the [root README](../README.md).

| Directory | Package | What it shows | Run |
| --- | --- | --- | --- |
| `invoice-triage/` | `@pumped-fn/invoice-triage` | [Invoice triage](./invoice-triage/README.md) imports invoices into Postgres and triages them with a model provider across daemon, server, CLI, cron, and tests. | `docker compose -f examples/invoice-triage/compose.yaml up -d postgres`<br>`pnpm -F @pumped-fn/invoice-triage start < examples/invoice-triage/fixtures/demo.ndjson`<br>`PORT=3000 pnpm -F @pumped-fn/invoice-triage server`<br>`pnpm -F @pumped-fn/invoice-triage test` |

Adding an example? See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Next

- [Root README](../README.md)
- [Invoice triage](./invoice-triage/README.md)
