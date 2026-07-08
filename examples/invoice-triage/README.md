# Invoice Triage

Runnable `@pumped-fn/sdk` example for Postgres-backed invoice import, LLM classification, cron reports, reminder delivery, and request routes over the same graph.

It proves:

- generator flows with `execStream` progress and `exec` summary consumption
- `yield*` progress composition from nested generator flows
- deps-declared scalar flow handles for model calls, durable queue writes, Postgres upserts, reports, review reads, and mail delivery
- unit-of-work middleware through a `txBoundary` resource that commits or rolls back from the execution close result
- tag-supplied executable store records through `serviceValue(txStore(conn))`, projected as `store.method.exec({ params, tags })`
- a Postgres-backed ingest queue with Drizzle migrations from the `database` atom and PGlite preset in tests
- signal-driven ingest using `queueSignal`, `storedSignal`, `outstanding`, `importing`, `drained`, and `stopping`
- `scope.resolveStream(...)` fan-out feeds plus `scope.drain(..., { take })` shown in tests with a local status feed
- signal-backed ops views for review queue count from a Postgres jsonb query
- scheduler-backed cron registration with deterministic manual ticks in tests
- idempotent reminders through ledger state
- Hono server, daemon, and CLI entrypoints over the same graph
- OpenTelemetry spans for flow and store method exec edges when an OTel SDK or test tracer is registered

## Architecture

```mermaid
flowchart TD
  Root["daemon/server/cli roots<br/>inline createScope<br/>root-owned execution contexts"] --> Scope["scope<br/>logging + observable + scheduler"]
  Scope --> OTel["otel.sink()<br/>exports spans when SDK is registered"]
  Scope --> DB["database atom<br/>pg pool + Drizzle migrations"]
  DB --> Boundary["txBoundary resource<br/>held transaction"]
  Boundary --> Store["txStore(conn)<br/>serviceValue record<br/>also set on tx tag"]
  Store --> StoreExec["store.method.exec({ params, tags })<br/>ctx supplied by exec pipeline"]

  Server["bin/server.ts app<br/>per-request ctx inline"] --> WriteRoute["write route flows<br/>own txBoundary"]
  Server --> ReadRoute["read route flows<br/>own txBoundary"]
  Cli["bin/cli.ts"] --> ReadRoute
  Daemon["bin/daemon.ts"] --> Intake["intake"]

  Intake --> Enqueue["enqueue"]
  WriteRoute --> Enqueue
  Enqueue --> StoreExec
  StoreExec --> Pending["invoice_pending"]
  StoreExec --> Audit["invoice_audit"]
  Enqueue --> Outstanding["outstanding"]
  Enqueue --> QueueSignal["queueSignal"]

  QueueSignal --> Ingest["ingest<br/>no txBoundary dep"]
  Stopping["stopping"] --> Ingest
  Ingest --> Peek["listPending<br/>read unit"]
  Peek --> Pending
  Ingest --> Batch["importBatch<br/>one txBoundary per batch"]
  Importing["importing"] <--> Batch
  Batch --> Triage["triage generator"]
  Triage --> Classify["classify.exec"]
  Classify --> Complete["sdk complete port flow<br/>model tag implementor"]
  Batch --> Settle["settleInvoice<br/>store.settleImport"]
  Settle --> StoreExec
  StoreExec --> Stored["invoice_stored"]
  Ingest --> StoredSignal["storedSignal<br/>post-batch commit"]
  SaveOwner["saveInvoice<br/>post-leaf commit"] --> StoredSignal

  Outstanding --> Drained["drained"]
  Importing --> Drained
  Drained --> Await["awaitDrained"]
  StoredSignal --> Ops["watchReviewQueue<br/>no txBoundary dep"]
  Ops --> Review["reviewCount<br/>read unit"]
  Stored --> Review
  Audit --> AuditRead["listAudit<br/>read unit"]

  Scheduler["scheduler.schedule atoms"] --> Report["dailyReport"]
  Scheduler --> Reminders["sendReminders"]
  Report --> ReadRoute
  Reminders --> ReadRoute
  Reminders --> SendOne["sendReminder"]
  SendOne --> Claim["markReminderSent<br/>write unit"]
  SendOne --> Deliver["deliver port flow<br/>scalar SDK step kind=email"]
  SendOne --> Release["releaseReminder<br/>write unit"]
  Deliver --> Mailer["mailer role tag<br/>flow implementor"]
  StoreExec -.-> OTel
  Complete -.-> OTel
  Deliver -.-> OTel
```

## Canonical Shape

`triage` and `importBatch` are streaming orchestration flows. They are not tagged with replay, suspend, or workflow policy. The SDK workflow and suspense extensions reject streaming targets through `isStreamingExec`, so durable policy belongs below them.

Business features are flows/resources; free functions are pure calculations; ctx/scope/handles never travel into helpers.

Outbound and pull capabilities such as `intakeLines` are atoms because the graph controls when it consumes them. Anything that creates execution contexts is root-owned: the server root creates request contexts inline in handlers, and importing `bin/server.ts` only exports the Hono app without starting workers or a listener.

External data is schema-validated with zod at parse and model-output boundaries; graph-internal handoffs stay typed.

Database access is confined to `src/unit.ts` and `src/tx.ts`. `database` is an atom, but only `txBoundary` depends on it. The boundary opens a transaction, builds `txStore(conn)`, sets the branded service record on the `tx` tag for deep consumers, and registers `ctx.onClose` to commit on `result.ok` or roll back on failure. Store-step leaves depend on `txBoundary` directly, receive projected `store.method.exec({ params })` handles, and preserve names such as `store.enqueuePending`, `store.listPending`, `store.settleImport`, `store.claimReminder`, and `store.releaseReminder`.

`txBoundary` must not be dep'd by long-lived loop flows such as `ingest` or `watchReviewQueue`, because that would hold one giant transaction. Owners that need store work execute child flows that own the unit. Deps resolve tags before resources, so a flow that owns `txBoundary` does not also declare `tags.required(tx)` in the same deps block.

| Owner | Boundary placement |
| --- | --- |
| `enqueueRows`, `settleInvoice`, `claimReminder`, `releaseReminderClaim` | one write unit per standalone leaf call; nested calls reuse the ancestor unit |
| `readPending`, `readStored`, `countReviews`, `readAudit` | one read unit per standalone leaf call |
| `importBatch` | one unit for the whole batch |
| `dailyReport`, `sendReminders` | no direct unit; call read/write child flows |
| `ingest`, `watchReviewQueue` | no unit; loop, wake, and exec child flows |
| HTTP write and read routes | reuse the domain flow when the route is 1:1 |

- `classify` builds the model request and validates the response; it execs the SDK `complete` port flow (a bare flow dep, projected to a handle) rather than owning the llm span itself.
- `enqueue` owns intake validation, calls `enqueueRows`, and wakes the queue only after rows are accepted and committed.
- `listPending` calls `store.listPending` for the ordered pending read.
- `saveInvoice` calls `settleInvoice` to upsert `invoice_stored`, delete that invoice from `invoice_pending`, and write the `imported` audit row before waking ops views after commit.
- `dailyReport` owns report materialization over `listStored`.
- `markReminderSent` calls `store.claimReminder` for the idempotent reminder claim.
- `releaseReminder` calls `store.releaseReminder` when delivery fails after a reminder claim.
- `deliver` owns mail delivery through the `mailer` role tag.

`triage`, `importBatch`, `ingest`, `intake`, and `sendReminders` declare the child flows they compose with `controller(childFlow)` deps, then call `child.exec(...)` or `child.execStream(...)` from the injected handle. Those scalar flows use `step({ workflow: true, kind })`, so a production composition can add `workflowExtension({ log })` and replay completed scalar work without journaling streaming generators. `classify` no longer carries its own `kind: "llm"` step tag - the SDK `complete` port flow owns that span. A completed workflow run shows the model implementor's step followed by `model.complete`; `invoice.classify` itself is untracked plumbing around that call. Do not put `step({ workflow: true })`, replay, suspend, or durable tags on `triage` or `importBatch`.

The example uses `yield* stream` to pass nested triage progress through `importBatch`, then reads `stream.result` for the typed classification. The current `FlowStream` type preserves output through `.result`; the `yield*` expression itself does not recover the output type from `AsyncIterable`.

## Providers

`bin/daemon.ts`, `bin/server.ts`, and `bin/cli.ts` are the composition roots for the runnable entrypoints. Each root calls `createScope` inline with the observable, logging, and scheduler extensions; binds the in-process scheduler backend; sends logs to stdout; sends observable events to `otel.sink()`; and binds the deterministic heuristic model provider. The server, daemon, and CLI bodies all run only under the `import.meta.url === pathToFileURL(process.argv[1] ?? "").href` main check, so tests can import their modules without executing roots.

The Hono server boundary is root-owned. `bin/server.ts` defines the scope and app at module level, then each handler creates a fresh execution context with a `requestId` tag, execs the route flow, closes ok or failed inline, and maps invalid JSON or `ParseError` to HTTP 400. Protocol tests use the flow seam with PGlite; the exported app is available for integration use, but its module-level default scope targets the configured Postgres environment.

The model seam is the SDK `model` tag:

```ts
createScope({
  tags: [model(heuristic)],
})
```

Tests wire scripted fakes built with `@pumped-fn/sdk-test`'s `modelStub` through the same tag and use `@pumped-fn/sdk-test`'s `kit()` for in-memory workflow logs. A different composition root can bind another `Model` flow through the same tag without changing the business flows.

Other provider seams are tags too:

- `mailer` selects the delivery implementation. The default `logDelivery` flow writes a log record; tests bind a collecting flow.
- `clock`, `reminderWindowDays`, `reminderRecipient`, and `requestId` carry runtime policy or ambient request data.
- `databaseUrl` carries the Postgres connection string. Its default is `postgres://invoice:invoice@localhost:5432/invoice_triage`, matching `compose.yaml`.
- `database` creates the pg pool, runs Drizzle migrations, and is preset to PGlite in tests, but product flows never import or depend on it directly.

## Postgres Queue And Cron

The SDK `channel()` and `schedule()` helpers are agent-turn adapters. This example needs a lossless ingest queue and cron-capable registration, so it uses:

- `enqueue` to parse raw lines or invoice objects and insert invoice batches into `invoice_pending`.
- `ingest` to run a recovery read once, wake on `ctx.changes(queueSignal)`, read pending rows in deterministic order, and pass each batch to `importBatch`.
- `importBatch` to classify and settle the whole pending batch inside one transaction.
- `outstanding` as the invoices accepted by this process for its current ingest wakeups, `importing` as an in-flight batch count, and `drained` as a derived atom over both - `awaitDrained` resolves only when the current process has no accepted work outstanding and no batch is mid-import.
- `reviewCount` as a Postgres jsonb query over `invoice_stored.classification`.
- `storedSignal` as the conflated ops wakeup for `watchReviewQueue`.
- `@pumped-fn/lite-extension-scheduler` for cron registration.

Signals are post-commit facts. Leaf store flows own `txBoundary` when they run standalone, while nested leaf calls under `importBatch` reuse the ancestor batch unit through current resource ownership. Owners announce only after durable work resolves: `enqueue` bumps `outstanding` and `queueSignal` after `enqueueRows`, `saveInvoice` bumps `storedSignal` after `settleInvoice`, and `ingest` bumps `storedSignal` after `importBatch`.

`resolveStream` and `changes` views conflate to the latest unconsumed value. That is correct for status views and processor wakeups, but not for must-not-drop work items; invoice batches live in Postgres and the processor drains durable state on each wakeup.

`dailyReportJob` and `sendRemindersJob` are module-level `scheduler.schedule` atoms resolved at the composition root. `reminderWindowDays` and `reminderRecipient` are tags. Preset them at the composition root for each environment.

## Ops Notes

Run Postgres with `docker compose -f examples/invoice-triage/compose.yaml up -d postgres`. The default `databaseUrl` tag points at that service, and the `database` atom runs migrations when it resolves.

The daemon entrypoint runs stdin intake plus background workers:

```sh
pnpm -F @pumped-fn/invoice-triage start < examples/invoice-triage/fixtures/demo.ndjson
```

The server entrypoint runs the same workers behind Hono. `PORT` defaults to `3000`:

```sh
PORT=3000 pnpm -F @pumped-fn/invoice-triage server
```

The CLI entrypoint runs one command in a fresh scope:

```sh
pnpm -F @pumped-fn/invoice-triage cli report
pnpm -F @pumped-fn/invoice-triage cli audit
pnpm -F @pumped-fn/invoice-triage cli pending
pnpm -F @pumped-fn/invoice-triage cli remind
```

The daemon composition root execs `intake`, `ingest`, `watchReviewQueue`, and `awaitDrained` as flows. It holds the scope, but every loop lives in the graph. `intake` consumes the stdin transport atom by direct pull and sends raw lines to `enqueue`; exactly one flow owns the iterator, so it is backpressured and lossless. Malformed lines are logged and rejected, never fatal. EOF or SIGINT ends intake; the daemon waits for `drained` - accepted work settled and no batch in flight - then execs `invoice.stop`, waits for both loops to settle, closes the context, and disposes the scope. The server SIGINT/SIGTERM path execs `invoice.stop`, waits for the worker loops to settle, closes the HTTP server and execution context, and disposes the scope. Per-request contexts are created and closed by the server root handler, not by a graph node.

Each runnable root registers `observable.extension()` and `otel.sink()` by default. The sink emits real OpenTelemetry spans when the process has an OTel SDK/tracer provider registered; tests prove the names by injecting a recording tracer.

Batch settlement is atomic: pending rows remain in `invoice_pending` while `ingest` imports the batch, and `importBatch` owns one `txBoundary` for the whole batch. If a model call or process fails before the batch closes successfully, all rows from that batch remain pending, no stored rows land, and no imported audit rows commit. Recovery is the next wake or restart re-importing the whole batch. Re-importing an already-settled id is safe because `store.settleImport` claims by deleting pending rows first, upserts idempotently, and preserves `reminded_at`.

Reminder idempotency is SQL-backed: `sendReminder` claims an invoice through `markReminderSent`, which updates `reminded_at` only when it is still null, then calls `deliver`. If `deliver` rejects, `sendReminder` calls `releaseReminder`, which clears `reminded_at` and writes `reminder_failed` in a write unit, then rethrows so the invoice appears in a later `sendReminders` run. A process crash between the SQL claim and delivery completion can still leave the claim set without a sent message; that window is intentionally at-most-once. In production, bind `mailer` to a real delivery implementor, set `clock` for deterministic tests, and wire a durable workflow event log for scalar steps.

## Run

```sh
docker compose -f examples/invoice-triage/compose.yaml up -d postgres
```

```sh
pnpm -F @pumped-fn/invoice-triage start < examples/invoice-triage/fixtures/demo.ndjson
```

```sh
PORT=3000 pnpm -F @pumped-fn/invoice-triage server
```

```sh
pnpm -F @pumped-fn/invoice-triage cli report
```

```sh
pnpm -F @pumped-fn/invoice-triage test
pnpm -F @pumped-fn/invoice-triage typecheck
pnpm -F @pumped-fn/invoice-triage lint
```
