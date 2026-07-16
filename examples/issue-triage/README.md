# Issue triage

This production-shaped daemon watches labeled GitHub issues, leases each delivery in Postgres, and runs one authority-bound SDK session per attempt. The agent can call one evidence tool. That tool reads a pinned Git revision, performs a read-only PostgreSQL explain, and queries a bounded Victoria window. A deterministic verifier must accept the cited hypothesis before the daemon writes an idempotent GitHub comment.

```text
GitHub -> durable lease -> session.run -> evidence -> verifier -> comment
```

Every effect is a declared flow or resource edge. Configuration and implementations enter through ordinary typed tags. The watcher supplies `session.authority` and `session.record` only on the delivery execution that needs them; unrelated tools are never exposed.

## Run

Requirements:

- Node 22.19 or newer.
- A checked-out Git repository at `REPOSITORY_ROOT`.
- A GitHub token allowed to read issues and write comments in `GITHUB_REPOSITORY`.
- A control Postgres database for cursors, leases, session records, and publication receipts.
- A separate read-only Postgres DSN in `TARGET_DATABASE_URL`.
- A VictoriaMetrics-compatible query endpoint.
- Provider authentication for the selected pi-ai model.

```bash
cp examples/issue-triage/.env.example examples/issue-triage/.env
docker compose -f examples/issue-triage/compose.yaml up -d
set -a
source examples/issue-triage/.env
set +a
pnpm -F @pumped-fn/issue-triage start
```

The control schema is migrated when its boundary-owned pool resolves. `TARGET_DATABASE_URL` is never migrated. Target analysis starts `BEGIN READ ONLY`, installs a local statement timeout, inspects a bounded schema view, runs `EXPLAIN` with `ANALYZE FALSE`, then rolls back. Issue polling follows every GitHub pagination link and advances its cursor to the upper bound captured before the first request.

GitHub publication uses two receipts. Before the GitHub effect, one control-database transaction takes an advisory lock for the authority fingerprint and idempotency key, then locks and validates the active lease row. It holds both fences through paginated comment recovery or creation and receipt storage. `GITHUB_PUBLICATION_TIMEOUT_MS` aborts those GitHub calls before the lease expires. The comment carries the same authority-bound marker, so a retry can recover a comment even when the first HTTP response was lost.

## Verify

```bash
pnpm -F @pumped-fn/issue-triage typecheck
pnpm -F @pumped-fn/issue-triage test
pnpm -F @pumped-fn/issue-triage lint
pnpm -F @pumped-fn/issue-triage verify
```

Tests use only `createScope({ presets, tags, extensions })` and public flows. The verifier covers the 16 application contracts. Additional scope-seam tests prove per-delivery session activation, trusted plan mapping, and lost-response comment recovery. No module mock or shared scope builder is used.

Zod supplies both the application boundary schemas and the SDK Standard Schema engine. Another Standard Schema implementation can replace those two engine tags without changing the graph.

## Canonical Shape

```text
watch -> claim lease -> delivery.exec(tags) -> session.run -> evidence tool
                                                        -> verifier -> publisher
```

The watcher is a controller-composed flow. Each claimed delivery enters through one child execution with its own `session.authority` and `session.record` tags. The session resource owns turns, tools, observations, storage, retries, cancellation, and cleanup. Tools depend on the session authority they consume; the session does not depend on its tools.

Repository, PostgreSQL, Victoria, GitHub, process, clock, and timer effects are declared atoms, resources, or flows. Foreign calls use `ctx.exec({ name, deps, params, fn })` with every graph dependency and runtime value declared. Tests replace those edges through `createScope({ presets, tags, extensions })` only.
