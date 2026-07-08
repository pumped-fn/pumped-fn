# Invoice Triage

Runnable `@pumped-fn/sdk` example for Postgres-backed invoice import, LLM classification, cron reports, and reminder delivery.

It proves:

- generator flows with `execStream` progress and `exec` summary consumption
- `yield*` progress composition from nested generator flows
- deps-declared scalar flow handles for model calls, durable queue writes, Postgres upserts, reports, review reads, and mail delivery
- a Postgres-backed ingest queue with Drizzle migrations from the `database` atom and PGlite preset in tests
- transport capability records consumed through `traced(queries)` so each database method is a named exec edge
- signal-driven ingest using `queueSignal`, `storedSignal`, `outstanding`, `importing`, `drained`, and `stopping`
- `scope.resolveStream(...)` fan-out feeds plus `scope.drain(..., { take })` shown in tests with a local status feed
- signal-backed ops views for review queue count from a Postgres jsonb query
- scheduler-backed cron registration with deterministic manual ticks in tests
- idempotent reminders through ledger state
- Hono server, daemon, and CLI entrypoints over the same graph
- OpenTelemetry spans for flow and traced database edges when an OTel SDK or test tracer is registered

## Architecture

```mermaid
flowchart TD
  Root["daemon/server/cli roots<br/>inline createScope<br/>root-owned execution contexts"] --> Scope["scope<br/>logging + observable + scheduler"]
  Root --> ServerBoundary["server root<br/>buildApp(execute)"]
  Scope --> OTel["otel.sink()<br/>exports spans when SDK is registered"]
  Scope --> DB["database atom<br/>pg pool + Drizzle migrations"]
  DB --> Queries["queries atom<br/>record of functions"]
  Queries --> Store["traced(queries)<br/>store.method.exec({ params, tags })"]

  Intake["intake"] --> Producer["enqueue flow<br/>parse invoice input"]
  ServerBoundary --> Producer
  ServerBoundary --> Report
  ServerBoundary --> OpsTrail
  ServerBoundary --> PendingRead
  Producer --> Store
  Store --> Pending["invoice_pending<br/>Postgres table"]
  Store --> Audit["invoice_audit<br/>Postgres table"]
  Producer --> Outstanding["outstanding atom<br/>accepted work count"]
  Producer --> QueueSignal["queueSignal atom<br/>ingest wakeup"]

  QueueSignal --> Ingest["ingest flow<br/>ctx.changes(queueSignal)"]
  Stopping["stopping atom"] --> Ingest
  Ingest --> Store
  Store --> PendingRead["store.listPending<br/>ordered read"]
  Pending --> PendingRead
  PendingRead --> Import["importBatch generator"]
  Importing["importing atom<br/>in-flight batch count"] <--> Import
  Import --> Triage["triage generator"]
  Triage --> Classify["classify.exec<br/>builds request, parses response"]
  Classify --> Complete["sdk complete port flow<br/>model tag implementation"]
  Import --> Save["saveInvoice flow"]
  Save --> Store
  Store --> Settle["store.settleImport<br/>upsert + pending delete + audit"]
  Pending --> Settle
  Store --> Stored["invoice_stored<br/>Postgres table"]
  Save --> StoredSignal["storedSignal atom<br/>ops wakeup"]
  Outstanding --> Drained["drained atom"]
  Importing --> Drained
  Drained --> Await["awaitDrained flow"]
  StoredSignal --> Ops["watchReviewQueue<br/>deduped count logs"]
  Stopping --> Ops
  Ops --> Review["reviewCount flow"]
  Review --> Store
  Stored --> Review
  Audit --> OpsTrail["listAudit flow"]
  Scheduler["scheduler.schedule atoms"] --> Report["dailyReport scalar step"]
  Scheduler --> Reminders["sendReminders scalar step"]
  Report --> Store
  Reminders --> Store
  Reminders --> SendOne["sendReminder.exec<br/>idempotent SQL claim"]
  SendOne --> Store
  SendOne --> Deliver["deliver port flow<br/>scalar SDK step kind=email"]
  Deliver --> Mailer["mailer role tag<br/>flow implementor"]
  Store -.-> OTel
  Complete -.-> OTel
  Deliver -.-> OTel
```

## Canonical Shape

`triage` and `importBatch` are streaming orchestration flows. They are not tagged with replay, suspend, or workflow policy. The SDK workflow and suspense extensions reject streaming targets through `isStreamingExec`, so durable policy belongs below them.

Business features are flows/resources; free functions are pure calculations; ctx/scope/handles never travel into helpers.

Outbound and pull capabilities such as `intakeLines` are atoms because the graph controls when it consumes them. Anything that creates execution contexts is root-owned: the server root creates request contexts, while `buildApp(execute)` is pure route wiring over an injected executor.

External data is schema-validated with zod at parse and model-output boundaries; graph-internal handoffs stay typed.

Transport capability records are traced edges; business features stay flows. Database side effects are scalar store flows backed by a `queries` atom through `traced(queries)`. The public flow names remain workflow store steps, and each database operation runs as a named traced exec edge such as `store.enqueuePending`, `store.listPending`, `store.settleImport`, `store.claimReminder`, or `store.releaseReminder`. Multi-statement aggregates that pair table writes with audit rows run in one transaction.

- `classify` builds the model request and validates the response; it execs the SDK `complete` port flow (a bare flow dep, projected to a handle) rather than owning the llm span itself.
- `enqueue` owns intake validation, calls `store.enqueuePending`, and wakes the queue when rows are accepted.
- `listPending` calls `store.listPending` for the ordered pending read.
- `saveInvoice` calls `store.settleImport` to upsert `invoice_stored`, delete that invoice from `invoice_pending`, and write the `imported` audit row in one transaction before waking ops views.
- `dailyReport` owns report materialization.
- `markReminderSent` calls `store.claimReminder` for the idempotent reminder claim.
- `releaseReminder` calls `store.releaseReminder` when delivery fails after a reminder claim.
- `deliver` owns mail delivery through the `mailer` role tag.

`triage`, `importBatch`, `ingest`, `intake`, and `sendReminders` declare the child flows they compose with `controller(childFlow)` deps, then call `child.exec(...)` or `child.execStream(...)` from the injected handle. Those scalar flows use `step({ workflow: true, kind })`, so a production composition can add `workflowExtension({ log })` and replay completed scalar work without journaling streaming generators. `classify` no longer carries its own `kind: "llm"` step tag — the SDK `complete` port flow owns that span. A completed workflow run now shows the model implementor's step followed by `model.complete` where `invoice.classify` used to appear; `invoice.classify` itself is untracked plumbing around that call. Do not put `step({ workflow: true })`, replay, suspend, or durable tags on `triage` or `importBatch`.

The example uses `yield* stream` to pass nested triage progress through `importBatch`, then reads `stream.result` for the typed classification. The current `FlowStream` type preserves output through `.result`; the `yield*` expression itself does not recover the output type from `AsyncIterable`.

## Providers

`bin/daemon.ts`, `bin/server.ts`, and `bin/cli.ts` are the composition roots for the runnable entrypoints. Each root calls `createScope` inline with the observable, logging, and scheduler extensions; binds the in-process scheduler backend; sends logs to stdout; sends observable events to `otel.sink()`; and binds the deterministic heuristic model provider.

The Hono server boundary is root-owned. `bin/server.ts` defines an inline executor that creates a fresh execution context for each request, execs the target flow, closes ok or failed, and rethrows failures. `src/server.ts` exports `buildApp(execute)`, a pure route builder with no scope, ctx, or atom; it maps invalid JSON and `ParseError` to HTTP 400.

The model seam is the SDK `model` tag:

```ts
createScope({
  tags: [model(heuristic)],
})
```

Tests wire scripted fakes built with `@pumped-fn/sdk-test`'s `modelStub` through the same tag and use `@pumped-fn/sdk-test`'s `kit()` for in-memory workflow logs. A different composition root can bind another `Model` flow through the same tag without changing the business flows.

Other provider seams are tags too:

- `mailer` selects the delivery implementation. The default `logDelivery` flow writes a log record; tests bind a collecting flow.
- `clock`, `reminderWindowDays`, and `reminderRecipient` carry runtime policy.
- `databaseUrl` carries the Postgres connection string. Its default is `postgres://invoice:invoice@localhost:5432/invoice_triage`, matching `compose.yaml`.
- `database` is an atom, not a tag: it creates the pg pool, runs Drizzle migrations, and is preset to PGlite in tests.

## Postgres Queue And Cron

The SDK `channel()` and `schedule()` helpers are agent-turn adapters. This example needs a lossless ingest queue and cron-capable registration, so it uses:

- `enqueue` to parse raw lines or invoice objects and insert invoice batches into `invoice_pending`.
- `ingest` to run a recovery read once, wake on `ctx.changes(queueSignal)`, read pending rows in deterministic order, and pass each batch to `importBatch`.
- `saveInvoice` to settle each completed classification into `invoice_stored` and remove only that invoice from `invoice_pending`.
- `outstanding` as the invoices accepted by this process for its current ingest wakeups, `importing` as an in-flight batch count, and `drained` as a derived atom over both — `awaitDrained` resolves only when the current process has no accepted work outstanding and no batch is mid-import.
- `reviewCount` as a Postgres jsonb query over `invoice_stored.classification`.
- `storedSignal` as the conflated ops wakeup for `watchReviewQueue`.
- `@pumped-fn/lite-extension-scheduler` for cron registration.

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

The daemon composition root execs `intake`, `ingest`, `watchReviewQueue`, and `awaitDrained` as flows. It holds the scope, but every loop lives in the graph. `intake` consumes the stdin transport atom by direct pull and sends raw lines to `enqueue`; exactly one flow owns the iterator, so it is backpressured and lossless. Malformed lines are logged and rejected, never fatal. EOF or SIGINT ends intake; the daemon waits for `drained` - accepted work settled and no batch in flight - then execs `invoice.stop`, waits for both loops to settle, closes the context, and disposes the scope. The server SIGINT/SIGTERM path execs `invoice.stop`, waits for the worker loops to settle, closes the HTTP server and execution context, and disposes the scope. Per-request contexts are also created and closed by the server root executor, not by a graph node.

Each runnable root registers `observable.extension()` and `otel.sink()` by default. The sink emits real OpenTelemetry spans when the process has an OTel SDK/tracer provider registered; tests prove the names by injecting a recording tracer.

Import settlement is per invoice: pending rows remain in `invoice_pending` while `ingest` imports the batch, and `saveInvoice` removes each row only inside the same `store.settleImport` transaction that upserts the stored invoice and writes the `imported` audit event. If a model call or process fails after one invoice settles, the next invoice remains pending for the next scope. Re-importing an already-settled id is safe because `store.settleImport` upserts idempotently while preserving `reminded_at`, and deleting a missing pending row is a no-op.

Reminder idempotency is SQL-backed: `sendReminder` claims an invoice through `markReminderSent`, which updates `reminded_at` only when it is still null, then calls `deliver`. If `deliver` rejects, `sendReminder` calls `releaseReminder`, which clears `reminded_at` in the same transaction that writes `reminder_failed`, then rethrows so the invoice appears in a later `sendReminders` run. A process crash between the SQL claim and delivery completion can still leave the claim set without a sent message; that window is intentionally at-most-once. In production, bind `mailer` to a real delivery implementor, set `clock` for deterministic tests, and wire a durable workflow event log for scalar steps.

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
