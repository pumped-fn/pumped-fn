# Parking Lot App

A runnable operator application over the shared parking-lot domain (`@pumped-fn/parking-lot-shared`),
assembled by `@pumped-fn/pumped`'s convention-driven discovery. One `src/` tree produces an HTTP
server, a CLI, a cron job, and a boot-time reconciliation workflow from the same manifest and the
same shared scope.

## What it does

- **Configure lots, book spaces, check vehicles in, prepare exits, pair/refund payments, open and
  resolve disputes, read occupancy/revenue reports** — the full flow set exported by
  `@pumped-fn/parking-lot-shared`, exposed over HTTP (`src/server/*.ts`) and the CLI
  (`src/cli/*.ts`).
- **Expires stale bookings and stuck payments** — `src/jobs/expire-bookings.ts` runs
  `expireBookings` (from the shared package) on a 5-minute cron. It cancels `held` bookings whose
  lot grace window has elapsed with no check-in ("no-shows"), and force-collects payments still
  `pending`/`failed` past a session's refund window, issuing a `charge` receipt for each so the
  books close instead of leaking `awaiting_payment` sessions forever.
- **Reconciles a day's takings** — `src/workflows/day-close.ts` runs `dayClose` once at process
  boot. It sums payments paired "today" against receipts issued "today" (by the `clock` adapter
  atom) and reports any discrepancy between money collected and money receipted.
- **Serves receipts** — `GET /receipts?userId=...` (`src/server/receipts.ts`) lists a user's
  receipts; manager/operator actors may omit `userId` to see all of them.

## Canonical Shape

`src/app.ts` default-exports the scope config (`presets`, `context`). Every file under
`src/server/`, `src/cli/`, `src/jobs/`, `src/workflows/` default-exports a shared flow — either
verbatim or re-tagged with `pumped.route`/`pumped.command` metadata (jobs default-export a
`scheduler.schedule()` atom instead), never
wrapped in a facade. The `pumped` CLI discovers those files by directory, reads the tags off each
flow for method/path/name overrides, and generates the manifest that `createServer`/`runCli`/
`runJobs`/`runWorkflows` execute through one scope built from `src/app.ts`. Domain code
(`@pumped-fn/parking-lot-shared`) never imports `@pumped-fn/pumped`; only the files under `src/`
here do.

## Architecture

`src/app.ts` is the composition seam. The shared `store` atom already defaults to a SQLite-backed
implementation, so `app.ts` presets nothing for it — it only sets the `dbPath` tag when
`PARKING_DB_PATH` is provided, and derives an `actor` context tag per request (HTTP:
`x-actor-id`/`x-role` headers) or per process (CLI/
jobs/workflows: `PARKING_ACTOR_ID`/`PARKING_ROLE` env vars, defaulting to a `manager` actor). This
is the one place in the app that reads `process.env` directly — everywhere else the actor arrives as
a declared tag dependency and the clock arrives as the `clock` adapter atom, never as an ambient
global read. It also wires `@pumped-fn/lite-extension-logging` and
`@pumped-fn/lite-extension-observable` so nested rule execs (e.g. the `allow` rule inside
`bookSpace`) are attributable in traces and logs instead of surfacing as indistinguishable errors.

`pumped dev`/`pumped build` discover `src/server`, `src/cli`, `src/jobs`, `src/workflows` and wire
one shared `@pumped-fn/lite` scope (via `pumped.createAppScope`) across the HTTP server, the cron
runner, and the workflow runner, so the SQLite-backed store atom is the same instance whether it's
touched from a request, a job tick, or the boot-time day-close run. Domain logic (rules, flows, the
`tx` transactional resource, the `ParkingStore` contract and its memory/SQLite implementations)
lives entirely in `@pumped-fn/parking-lot-shared` and never imports `@pumped-fn/pumped` — every file
under `src/server`, `src/cli`, `src/jobs`, `src/workflows` is a thin default export of a shared flow,
optionally re-tagged with `pumped.route`/`pumped.command` metadata (jobs default-export a
`scheduler.schedule()` atom).

## Where data lives

Data lives in `parking-lot.sqlite` in the process's working directory by default (the shared
`store` atom's `dbPath` tag default). Set `PARKING_DB_PATH` to override the path, or to `:memory:`
for an ephemeral run. Test scopes never touch this file — every test presets the shared `store`
atom with `createMemoryStore()` directly.

## Run

```bash
pnpm test               # vitest — domain + entry + full-composition integration tests
pnpm typecheck
pnpm dev                 # pumped dev — Vite dev server with HMR over the discovered graph
pnpm build                # pumped build --target all — emits dist/server.mjs + dist/cli.mjs
PARKING_DB_PATH=./data/parking-lot.sqlite node dist/server.mjs
node dist/cli.mjs configure --json '{"name":"Downtown","capacity":10,"rateCentsPerHour":500,"graceMinutes":10,"bookingLeadMinutes":120,"currency":"USD","refundWindowMinutes":1440}'
node dist/cli.mjs book --json '{"lotId":"lot-0001","plate":"abc-123","startAt":"2026-07-01T09:00:00.000Z","endAt":"2026-07-01T12:00:00.000Z"}'
node dist/cli.mjs report --json '{}'
```

Run `pumped dev --help`/`node dist/cli.mjs --help` to see the CLI's generated command list — each
command's description states its expected `--json` shape (see "Framework feedback" below).

## Framework feedback

The CLI runner (`@pumped-fn/pumped`'s `runCli`) currently accepts input only via a single `--json`
payload flag; there is no mapping from named CLI flags (e.g. `--lot-id`, `--plate`) to flow input
fields. `src/cli/*.ts` compensates by tagging each command with a `pumped.command({ description })`
that documents the expected JSON shape inline, but a flag-to-input mapping (driven off each flow's
`parse`/`typed<T>()` shape) would make the CLI usable without hand-authored JSON blobs.

## Architecture sketch

```
HTTP request ──┐
CLI invocation ─┼─► src/app.ts (dbPath tag, clock atom, actor context tag)
Cron tick ──────┤        │
Boot workflow ──┘        ▼
                 one shared @pumped-fn/lite scope
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
 @pumped-fn/parking-lot-shared flows   tx (audit trail)   ParkingStore (SQLite)
   configureLot, bookSpace, checkIn*, prepareExit,
   pairPayment/refundPayment/recordPaymentFailure,
   openDispute/resolveDispute, listReceipts, readReport,
   expireBookings (job), dayClose (workflow)
```

Compare with `examples/parking-lot-cli` and `examples/parking-lot-hono`, which wire the same domain
by hand instead of through convention-driven discovery.
