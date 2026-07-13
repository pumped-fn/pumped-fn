# Invoice Triage

This example imports invoices into Postgres and classifies them with an LLM provider. It runs the same graph from a daemon, HTTP server, and CLI. Durable store steps, cron jobs, and tests show how the pieces recover and stay observable.

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

## Architecture

```mermaid
flowchart TD
  Root["daemon/server/cli roots<br/>inline createScope<br/>root-owned execution contexts"] --> Scope["scope<br/>logging + observable + scheduler"]
  Scope --> OTel["otel.sink()<br/>exports spans when SDK is registered"]
  Scope --> DB["database atom<br/>pg pool + Drizzle migrations"]
  DB --> StoreFlows["store flows<br/>dep database, run SQL inline<br/>db.transaction per multi-write op"]

  Server["bin/server.ts app<br/>per-request ctx inline"] --> WriteRoute["write route flows"]
  Server --> ReadRoute["read route flows"]
  Cli["bin/cli.ts"] --> ReadRoute
  Daemon["bin/daemon.ts"] --> Intake["intake"]

  Intake --> Enqueue["enqueue<br/>store flow"]
  WriteRoute --> Enqueue
  Enqueue --> DB
  Enqueue --> Pending["invoice_pending"]
  Enqueue --> Audit["invoice_audit"]
  Enqueue --> Outstanding["outstanding<br/>post-commit"]
  Enqueue --> QueueSignal["queueSignal<br/>post-commit"]

  QueueSignal --> Ingest["ingest"]
  Stopping["stopping"] --> Ingest
  Ingest --> Peek["listPending<br/>store read flow"]
  Peek --> Pending
  Ingest --> Batch["importBatch<br/>settleInvoice per invoice"]
  Importing["importing"] <--> Batch
  Batch --> Triage["triage generator"]
  Triage --> Classify["classify.exec"]
  Classify --> Complete["sdk complete port flow<br/>model tag implementor"]
  Batch --> Settle["settleInvoice<br/>store flow, one tx per invoice"]
  Settle --> Stored["invoice_stored"]
  Ingest --> StoredSignal["storedSignal<br/>post-batch"]
  SaveOwner["saveInvoice<br/>post-commit"] --> Settle
  SaveOwner --> StoredSignal

  Outstanding --> Drained["drained"]
  Importing --> Drained
  Drained --> Await["awaitDrained"]
  StoredSignal --> Ops["watchReviewQueue"]
  Ops --> Review["reviewCount<br/>store read flow"]
  Stored --> Review
  Audit --> AuditRead["listAudit<br/>store read flow"]

  Scheduler["scheduler.schedule atoms"] --> Report["dailyReport"]
  Scheduler --> Reminders["sendReminders"]
  Report --> ReadRoute
  Reminders --> ReadRoute
  Reminders --> SendOne["sendReminder"]
  SendOne --> Claim["markReminderSent<br/>store flow, one tx"]
  SendOne --> Deliver["deliver port flow<br/>scalar SDK step kind=email"]
  SendOne --> Release["inline release-on-failure<br/>db.transaction + audit"]
  Deliver --> Notifier["ctx.exec({ fn })<br/>notifier.send() edge"]
  StoreFlows -.-> OTel
  Complete -.-> OTel
  Deliver -.-> OTel
```

## What it shows

- Streaming invoice import with generator flows, `execStream` progress, nested `yield*`, and final `exec` summaries.
- Postgres-backed ingest through Drizzle migrations, store flows, and PGlite presets in tests.
- Signal-driven workers and ops views using `queueSignal`, `storedSignal`, `outstanding`, `importing`, `drained`, and `stopping`.
- Provider seams for the model tag, notifier client, clock, request id, reminder policy, and database URL.
- A Zod-validated `findInvoice` managed tool, `invoiceAssistant` current resource, and `askInvoice` turn whose validation engine and model are selected at the scope seam.
- Scheduler-backed cron registration, idempotent reminder claims, release-on-failure SQL, and deterministic manual ticks in tests.
- Hono server, daemon, CLI, and OpenTelemetry spans over the same graph.

## Canonical Shape

Keep durable policy below `triage` and `importBatch`. They are streaming orchestration flows, while the scalar store/model/delivery steps carry replay, suspend, or workflow policy. The SDK workflow and suspense extensions reject streaming targets through `isStreamingExec`.

Business features are flows/resources; free functions are pure calculations; ctx/scope/handles never travel into helpers.

Outbound and pull capabilities such as `intakeLines` are atoms because the graph controls when it consumes them. Anything that creates execution contexts is root-owned: the server root creates request contexts inline in handlers, and importing `bin/server.ts` only exports the Hono app without starting workers or a listener.

External data is schema-validated with Zod at parse, managed-tool input, and model-output boundaries; graph-internal handoffs stay typed. `src/assistant.ts` declares the tool schema once. The scope-injected `validation.engine` converts it to the JSON Schema shown to the model and validates each call before `invoice.findStored` executes.

Database access lives in `src/store.ts`. `database` is an atom, and each store operation is a plain flow that deps it directly and runs its Drizzle SQL inline. Multi-write operations (`enqueue`, `settleInvoice`, `markReminderSent`) wrap their writes in `db.transaction(async (tx) => …)` so the two writes are atomic per operation; reads (`listStored`, `listPending`, `reviewCount`, `listAudit`) are plain `db.select`. Each write/read flow carries `step({ workflow: true, kind: "store" })`, so its SQL await is attributed to that step's span. There is no per-flow transaction boundary and no held transaction: SQL commits inline as each operation resolves, so a flow that mutates then bumps a signal is naturally post-commit.

Long-lived loop flows such as `ingest` or `watchReviewQueue` never hold a transaction; they loop, wake on a signal, and exec the store flows they need. Because there is no batch-level unit, atomicity is per operation, not per batch: `importBatch` settles each invoice in that invoice's own transaction. A batch that fails partway leaves the already-settled invoices committed and the failing one still pending; recovery re-imports only what is still pending.

| Owner | Data access |
| --- | --- |
| `enqueue`, `settleInvoice`, `markReminderSent` | one `db.transaction` per operation for the paired writes |
| `listPending`, `listStored`, `reviewCount`, `listAudit` | one `db.select` per read |
| `importBatch` | execs `settleInvoice` per invoice; each settle is its own transaction |
| `dailyReport`, `sendReminders` | no direct SQL; call read/write store flows |
| `ingest`, `watchReviewQueue` | no SQL of their own; loop, wake, and exec store flows |
| HTTP write and read routes | reuse the domain flow when the route is 1:1 |

- `classify` builds the model request and validates the response; it execs the SDK `complete` port flow (a bare flow dep, projected to a handle) rather than owning the llm span itself.
- `enqueue` parses intake, inserts pending rows and the `enqueued` audit row in one transaction, and wakes the queue by bumping `outstanding` and `queueSignal` only after that transaction commits.
- `listPending` runs the ordered pending read.
- `settleInvoice` claims the pending row by deleting it first, upserts `invoice_stored` preserving `reminded_at`, and writes the `imported` audit row in one transaction; `saveInvoice` execs it then bumps `storedSignal` post-commit.
- `dailyReport` owns report materialization over `listStored`.
- `markReminderSent` updates `reminded_at` only when it is still null and writes the `reminded` audit row in one transaction — the idempotent reminder claim.
- `sendReminder` runs the release-on-failure SQL inline: when delivery rejects, it clears `reminded_at` and writes `reminder_failed` in one transaction, then rethrows.
- `deliver` owns mail delivery through the `notifier` client, wrapping the foreign call in `ctx.exec({ fn: () => notifier.send(message), name: "notifier.send" })` so the foreign transport becomes a named `notifier.send` edge.

`triage`, `importBatch`, `ingest`, `intake`, and `sendReminders` declare the child flows they compose with `controller(childFlow)` deps, then call `child.exec(...)` or `child.execStream(...)` from the injected handle. Those scalar flows use `step({ workflow: true, kind })`, so a production composition can add `workflowExtension({ log })` and replay completed scalar work without journaling streaming generators. `classify` no longer carries its own `kind: "llm"` step tag - the SDK `complete` port flow owns that span. A completed workflow run shows the model implementor's step followed by `model.complete`; `invoice.classify` itself is untracked plumbing around that call. When you build similar flows, put `step({ workflow: true })`, replay, suspend, and durable tags on the scalar child steps, not on streaming orchestration flows like `triage` or `importBatch`.

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

- `notifier` supplies the foreign delivery client. Roots bind `consoleNotifier()`; tests bind a plain-object client whose `send` routes through `this.record`. Wrapping the call as `ctx.exec({ fn: () => notifier.send(message) })` preserves the receiver through ordinary method-call syntax, so class-instance SDKs work without a plain-object facade.
- `clock`, `reminderWindowDays`, `reminderRecipient`, and `requestId` carry runtime policy or ambient request data.
- `databaseUrl` carries the Postgres connection string. Its default is `postgres://invoice:invoice@localhost:5432/invoice_triage`, matching `compose.yaml`.
- `database` creates the pg pool, runs Drizzle migrations, and is preset to PGlite in tests. The store flows in `src/store.ts` dep it directly and run their SQL against it; product flows reach data only through those store flows.

## Postgres Queue And Cron

The SDK `channel()` and `schedule()` helpers are agent-turn adapters. This example needs a lossless ingest queue and cron-capable registration, so it uses:

- `enqueue` to parse raw lines or invoice objects and insert invoice batches into `invoice_pending`.
- `ingest` to run a recovery read once, wake on `ctx.changes(queueSignal)`, read pending rows in deterministic order, and pass each batch to `importBatch`.
- `importBatch` to classify and settle each pending invoice, one `settleInvoice` transaction per invoice.
- `outstanding` as the invoices accepted by this process for its current ingest wakeups, `importing` as an in-flight batch count, and `drained` as a derived atom over both - `awaitDrained` resolves only when the current process has no accepted work outstanding and no batch is mid-import.
- `reviewCount` as a Postgres jsonb query over `invoice_stored.classification`.
- `storedSignal` as the conflated ops wakeup for `watchReviewQueue`.
- `@pumped-fn/lite-extension-scheduler` for cron registration.

Signals are post-commit facts. Each store flow commits its SQL inline, so signal bumps sit after the write resolves and are naturally post-commit. Owners announce only after durable work resolves: `enqueue` bumps `outstanding` and `queueSignal` after its transaction commits, `saveInvoice` bumps `storedSignal` after `settleInvoice`, and `ingest` bumps `storedSignal` after `importBatch`.

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

Settlement is atomic per invoice: `settleInvoice` claims, upserts, and audits inside one transaction. `importBatch` settles each invoice in its own transaction, so atomicity is per invoice, not per batch. If a model call or process fails partway through a batch, the already-settled invoices stay committed and the failing invoice's pending row remains in `invoice_pending`; recovery on the next wake or restart re-imports only what is still pending. Re-importing an already-settled id is safe because `settleInvoice` claims by deleting pending rows first, upserts idempotently, and preserves `reminded_at`.

Reminder idempotency is SQL-backed: `sendReminder` claims an invoice through `markReminderSent`, which updates `reminded_at` only when it is still null, then calls `deliver`. If `deliver` rejects, `sendReminder` runs the release SQL inline — clearing `reminded_at` and writing `reminder_failed` in one transaction — then rethrows so the invoice appears in a later `sendReminders` run. A process crash between the SQL claim and delivery completion can still leave the claim set without a sent message; that window is intentionally at-most-once. In production, bind `notifier` to a real transport client (SES/SendGrid/Twilio wrapped as a plain-object record), set `clock` for deterministic tests, and wire a durable workflow event log for scalar steps.

## Source

- [flows.ts](./src/flows.ts)
- [store.ts](./src/store.ts)
- [database.ts](./src/database.ts)
- [server.ts](./bin/server.ts)
- [invoice-triage.test.ts](./tests/invoice-triage.test.ts)

## Next

- [Examples index](../README.md)
- [Lite patterns](../../pkg/core/lite/PATTERNS.md)
