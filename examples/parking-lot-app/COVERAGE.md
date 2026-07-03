# Parking Lot Coverage Inventory

Scope: `examples/parking-lot-shared/src` (model, store, flows, rules, tx) +
`examples/parking-lot-app` (server/cli/jobs/workflows entries, tests) +
`pkg/ext/logging`, `pkg/ext/observable`, `pkg/framework/pumped/src/runtime`.
All line refs verified against the working tree on branch `feat/pumped-framework`.

---

## A. State machine inventory

### Booking (`BookingStatus = "held" | "checked_in" | "cancelled" | "completed"` — model.ts:23)

| From | To | Triggering flow | Guard(s) | Notes |
|---|---|---|---|---|
| (new) | held | `bookSpace` flow.booking.ts:19-41 | `allow` (roles user) flow.booking.ts:24; `assertCapacity` flow.booking.ts:26 (flow.rule.assert-capacity.ts:18-26, overlap+capacity) | plate normalized rules.ts:22-24 |
| held | cancelled | `cancelBooking` flow.booking.ts:43-61 | role check flow.booking.ts:49-51 (manager or own userId); status guard `booking.status !== "held"` flow.booking.ts:52 | no `allow` rule flow used — inline role check only, no `rule` tag attached (see unguarded note below) |
| held | cancelled | `expireBookings` flow.expire-bookings.ts:28-38 | `allow` (roles manager/operator) flow.expire-bookings.ts:25; time guard `nowMs > startAt + graceMinutes*60000` flow.expire-bookings.ts:32 (strict `>`) | job-only path, no user-facing guard reused |
| held | checked_in | `checkInBooking` flow.check-in.ts:40-64 | `allow` (roles operator) flow.check-in.ts:45; status guard `booking.status !== "held"` flow.check-in.ts:47; `assertDriveUpCapacity` flow.check-in.ts:49 (flow.rule.assert-drive-up-capacity.ts:16-18) | |
| checked_in | completed | `completeBookingForSession` (called from `prepareExit`) rules.ts:5-9, invoked flow.prepare-exit.ts:31 | none beyond `session.bookingId !== undefined` check rules.ts:6 | **unguarded**: no status precondition on booking itself before flipping to completed |

Dead/unreachable: none of the 4 booking states are unreachable, but **"checked_in" booking that never checks out is stuck** — there is no transition back from checked_in to held/cancelled if the session it created is cancelled/never exits (no compensating transition modeled).
Unguarded transitions: `checkInBooking`'s and `bookSpace`'s inline `throw new Error(...)` guards (flow.booking.ts:50,52; flow.check-in.ts:47) are **not** wrapped in a `rule`-tagged flow (unlike `allow`, `assertCapacity`, `assertDriveUpCapacity`, `amountDue`) — they are plain inline throws inside the flow factory, so they will not carry a `rule` tag/name in observability (see section C).

### Parking session (`SessionStatus = "parked" | "awaiting_payment" | "released"` — model.ts:38)

| From | To | Triggering flow | Guard(s) | Notes |
|---|---|---|---|---|
| (new) | parked | `checkInVehicle` flow.check-in.ts:18-38 | `allow` (operator) flow.check-in.ts:23; `assertDriveUpCapacity` flow.check-in.ts:25 | drive-up, no booking |
| (new) | parked | `checkInBooking` flow.check-in.ts:40-64 | same as booking transition above | booking-linked |
| parked | awaiting_payment | `prepareExit` flow.prepare-exit.ts:12-35 | `allow` (operator) flow.prepare-exit.ts:17; status guard `session.status !== "parked"` flow.prepare-exit.ts:19 | computes `amountDue` (flow.rule.amount-due.ts) |
| awaiting_payment | released | `pairPayment` flow.payment.ts:23-47 | `allow` (operator) flow.payment.ts:28; payment-status guard (indirect — session read via `payment.sessionId`) flow.payment.ts:29-32 | session itself has **no status guard** before being set to released — see unguarded note |
| awaiting_payment | released | `expireBookings` (force-collect path) flow.expire-bookings.ts:40-53 | `allow` flow.expire-bookings.ts:25; session-status check `session.status !== "awaiting_payment"` flow.expire-bookings.ts:44; deadline `nowMs <= deadline` skip (i.e. fires when `nowMs > deadline`, strict `>`) flow.expire-bookings.ts:46-47 | |

Dead/unreachable: none structurally dead, but there is **no transition that ever returns a session to "parked" from "awaiting_payment"** (e.g. exit cancelled/re-entry) — a session that reaches `awaiting_payment` can only ever end at `released`.
Unguarded: `pairPayment` never checks `session.status` (flow.payment.ts:33-42) before writing `status: "released"` — if called twice or out of order relative to `expireBookings`'s force-collect it will silently overwrite. This is a genuine **unguarded transition**.

### Payment (`PaymentStatus = "pending" | "failed" | "paired" | "refunded" | "disputed"` — model.ts:51)

| From | To | Triggering flow | Guard(s) | Notes |
|---|---|---|---|---|
| (new) | pending | `prepareExit` flow.prepare-exit.ts:22-28 | same guards as session transition above | amount from `amountDue.exec` |
| pending/failed | paired | `pairPayment` flow.payment.ts:30-32 | `payment.status !== "pending" && payment.status !== "failed"` → throw | |
| pending/failed | paired | `expireBookings` force-collect flow.expire-bookings.ts:40-48 | filter `status === "pending" \|\| "failed"` flow.expire-bookings.ts:41; deadline check flow.expire-bookings.ts:46-47 | issues charge receipt |
| pending | failed | `recordPaymentFailure` flow.payment.ts:49-65 | `payment.status !== "pending"` → throw flow.payment.ts:56 | |
| paired/disputed | refunded | `refundPayment` flow.payment.ts:67-86 | `payment.status !== "paired" && payment.status !== "disputed"` → throw flow.payment.ts:74-76 | issues negative-amount refund receipt |
| paired | disputed | `openDispute` flow.dispute.ts:17-44 | `session.userId !== tx.actor.id` → throw flow.dispute.ts:25; `payment.status !== "paired"` → throw flow.dispute.ts:26 | |
| disputed | refunded | `resolveDispute` (decision=accepted) flow.dispute.ts:65-73 | dispute-status guard only (see below) — no payment-status re-check | |
| disputed | paired | `resolveDispute` (decision=rejected) flow.dispute.ts:60-64 | dispute-status guard only | reopens payment to "paired" without re-validating it is still "disputed" |

Dead/unreachable: `failed` payments can only reach `paired` (manual pair or force-collect) or stay `failed` forever — there is **no explicit "failed → refunded" or "failed cancelled" path**; a failed payment with no retry sits permanently.
Unguarded: `resolveDispute` never re-reads/re-checks `payment.status` (flow.dispute.ts:54, `tx.store.payment(dispute.paymentId)`) before flipping it — it trusts the dispute's own status guard (`dispute.status !== "open"`, flow.dispute.ts:53) as a proxy for payment state. If a payment were independently refunded elsewhere while a dispute is open, `resolveDispute` would silently overwrite it back to `paired` or `refunded` — **unguarded/stale-read transition**.

### Dispute (`DisputeStatus = "open" | "accepted" | "rejected"` — model.ts:78)

| From | To | Triggering flow | Guard(s) | Notes |
|---|---|---|---|---|
| (new) | open | `openDispute` flow.dispute.ts:17-44 | `allow` (user) flow.dispute.ts:22; ownership check flow.dispute.ts:25; payment-status check flow.dispute.ts:26 | |
| open | accepted | `resolveDispute` flow.dispute.ts:46-74, decision="accepted" | `allow` (manager) flow.dispute.ts:51; `dispute.status !== "open"` → throw flow.dispute.ts:53 | |
| open | rejected | `resolveDispute` flow.dispute.ts:46-74, decision="rejected" | same as above | |

Dead/unreachable: `accepted` and `rejected` are terminal — no transition ever reads/reopens them (correct per model, no gap). No dead states.

---

## B. Exhaustive edge-case matrix

Legend: HTTP status/CLI exit reflect **current observed behavior** (all domain throws are plain `Error`, uncaught by any mapping layer — see section D). CLI: `runEntry` in `pkg/framework/pumped/src/runtime/cli.ts:44-54` catches, writes `error.message` to stderr, sets `process.exitCode = 1` for every error. HTTP: `serve.ts` has no try/catch around `context.var.lite.exec` (serve.ts:59-66); the hono adapter's `middleware` (`pkg/framework/hono/src/index.ts:54-67`) does catch and call `execution.close({ok:false, error})` then **rethrows**, so Hono's own default error handler produces a bare `500` with the raw error message — no typed status.

| ID | Flow | Scenario | Expected typed error (proposed) | HTTP status (today) | CLI exit (today) | Observability trace (today) |
|---|---|---|---|---|---|---|
| BOOK-01 | bookSpace | role != user | `ForbiddenError` | 500 (raw) | 1, stderr = `role X cannot book space` | `allow` rule exec error event (kind=flow name="parking.rule.allow"), parent `flow.error` log if logging wired |
| BOOK-02 | bookSpace | capacity exhausted at exact `held+parked === capacity` (flow.rule.assert-capacity.ts:25, `>=`) | `CapacityExceededError` | 500 (raw) | 1 | `assert-capacity` rule error event |
| BOOK-03 | bookSpace | capacity `held+parked === capacity-1` (one under) — boundary, should succeed | n/a (success case) | 200 | 0 | success events only |
| BOOK-04 | bookSpace | overlap boundary: new booking `startAt === existing.endAt` (rules.ts:27, uses strict `<`) → NOT overlapping, should succeed | n/a (success) | 200 | 0 | |
| BOOK-05 | bookSpace | overlap boundary: new booking `endAt === existing.startAt` → NOT overlapping (same strict `<` both sides), should succeed | n/a (success) | 200 | 0 | |
| BOOK-06 | bookSpace | overlap by 1ms (`startAt` 1ms before existing `endAt`) → overlapping, rejected | `CapacityExceededError` | 500 | 1 | |
| BOOK-07 | bookSpace | unknown `lotId` (`store.lot` throws `unknown lot: X`, store.ts:90-92,175-178) | `NotFoundError` | 500 | 1, stderr=`unknown lot: X` | no rule tag — raw store throw, uncaught by any `rule`-tagged flow |
| BOOK-08 | bookSpace | double-submit identical input twice (no idempotency key) — creates two bookings | `DuplicateBookingError` (proposed; not currently detected) | 200/200 (both succeed) | 0/0 | **no idempotency guard exists** — flagged gap |
| BOOK-09 | cancelBooking | role neither manager nor owner (flow.booking.ts:49-51) | `ForbiddenError` | 500 | 1, stderr=`role X cannot cancel booking Y` | inline throw, **no rule tag** (unguarded per section A) |
| BOOK-10 | cancelBooking | booking.status !== "held" (flow.booking.ts:52) — e.g. already cancelled, checked_in, completed | `InvalidStateError` | 500 | 1, stderr=`booking Y is not held` | inline throw, no rule tag |
| BOOK-11 | cancelBooking | unknown bookingId | `NotFoundError` | 500 | 1 | |
| BOOK-12 | cancelBooking | double-submit cancel same booking twice concurrently through `tx` | `ConcurrentModificationError` (proposed) — today: second call hits BOOK-10 (not-held) since store is synchronous/in-memory, no real race exists in `MemoryParkingStore` (no locking, single-threaded JS) | 500 (2nd call) | 1 (2nd call) | |
| CHECKIN-01 | checkInVehicle | role != operator | `ForbiddenError` | 500 | 1 | `allow` rule error |
| CHECKIN-02 | checkInVehicle | `parkedCount(lot) === capacity` (flow.rule.assert-drive-up-capacity.ts:17, `>=`) | `CapacityExceededError` | 500 | 1 | `assert-drive-up-capacity` rule error |
| CHECKIN-03 | checkInVehicle | `parkedCount(lot) === capacity-1` (one under) → succeeds | n/a | 200 | 0 | |
| CHECKIN-04 | checkInVehicle | unknown lotId | `NotFoundError` | 500 | 1 | |
| CHECKIN-05 | checkInVehicle | empty optional `userId` (undefined) — drive-up with no user | n/a (allowed, model.ts:44 optional) | 200 | 0 | session created with `userId: undefined` |
| CHECKIN-06 | checkInBooking | role != operator | `ForbiddenError` | 500 | 1 | |
| CHECKIN-07 | checkInBooking | `booking.status !== "held"` (flow.check-in.ts:47) | `InvalidStateError` | 500 | 1, stderr=`booking X is not held` | inline throw, no rule tag |
| CHECKIN-08 | checkInBooking | capacity full at check-in time (flow.check-in.ts:49) | `CapacityExceededError` | 500 | 1 | |
| CHECKIN-09 | checkInBooking | unknown bookingId | `NotFoundError` | 500 | 1 | |
| EXIT-01 | prepareExit | role != operator | `ForbiddenError` | 500 | 1 | |
| EXIT-02 | prepareExit | `session.status !== "parked"` (flow.prepare-exit.ts:19) — e.g. already awaiting_payment/released | `InvalidStateError` | 500 | 1, stderr=`session X is not parked` | inline throw, no rule tag |
| EXIT-03 | amountDue | exact grace-minute boundary: `minutes === graceMinutes` → `billable === 0` → amount 0 (flow.rule.amount-due.ts:17-18, `Math.max(0, minutes - grace)`) | n/a (0-cost success) | 200 | 0 | `amount-due` rule success event, output=0 |
| EXIT-04 | amountDue | `minutes === graceMinutes + 1` (one unit over) → billable=1 → 1hr rounded charge (`Math.ceil(1/60)*rate`) | n/a | 200 | 0 | |
| EXIT-05 | amountDue | `minutes === graceMinutes - 1` (one unit under) → billable clamped negative→0 → 0 cost | n/a | 200 | 0 | |
| EXIT-06 | amountDue | `exitedAt < enteredAt` (clock skew / bad data) → negative minutes clamped to 0 (flow.rule.amount-due.ts:16, `Math.max(0, ...)`) | n/a today — silently 0-cost; proposed `InvalidTimeRangeError` | 200 | 0 | **swallowed**: no error raised for clearly invalid input |
| EXIT-07 | amountDue | exactly 60 minutes billable (1hr boundary) vs 61 minutes (rounds up to 2hr, `Math.ceil(61/60)=2`) | n/a | 200 | 0 | rate rounding always rounds **up** to next full hour, `>=` semantics via ceil |
| EXIT-08 | prepareExit | unknown sessionId | `NotFoundError` | 500 | 1 | |
| PAY-01 | pairPayment | role != operator | `ForbiddenError` | 500 | 1 | |
| PAY-02 | pairPayment | `payment.status` not in {pending, failed} (flow.payment.ts:30-32) — e.g. already paired/refunded/disputed | `InvalidStateError` | 500 | 1, stderr=`payment X cannot be paired from Y` | inline throw, no rule tag |
| PAY-03 | pairPayment | double-submit: pair same payment twice | 2nd hits PAY-02 | 500 (2nd) | 1 (2nd) | |
| PAY-04 | pairPayment | unknown paymentId | `NotFoundError` | 500 | 1 | |
| PAY-05 | pairPayment | session status never re-checked (see A unguarded finding) — pairing a session already `released` | today: **succeeds silently**, overwrites session back to released (no-op) with no error | 200 | 0 | **no error surfaced — design gap** |
| PAY-06 | recordPaymentFailure | role != operator | `ForbiddenError` | 500 | 1 | |
| PAY-07 | recordPaymentFailure | `payment.status !== "pending"` (flow.payment.ts:56) | `InvalidStateError` | 500 | 1 | inline throw, no rule tag |
| PAY-08 | recordPaymentFailure | unknown paymentId | `NotFoundError` | 500 | 1 | |
| PAY-09 | refundPayment | role != manager | `ForbiddenError` | 500 | 1 | |
| PAY-10 | refundPayment | `payment.status` not in {paired, disputed} (flow.payment.ts:74-76) | `InvalidStateError` | 500 | 1 | inline throw, no rule tag |
| PAY-11 | refundPayment | unknown paymentId | `NotFoundError` | 500 | 1 | |
| PAY-12 | refundPayment | refund-window boundary — **note: refundWindowMinutes is never consulted by refundPayment itself**, only by `expireBookings` force-collect (flow.expire-bookings.ts:46). A manager can refund at any time regardless of window. | n/a today; proposed `RefundWindowExpiredError` if maintainer wants the window enforced here too | 200 | 0 | **framework/design gap**: `refundWindowMinutes` boundary is not enforced on the manual refund path at all |
| DISPUTE-01 | openDispute | role != user | `ForbiddenError` | 500 | 1 | |
| DISPUTE-02 | openDispute | non-owner disputes another user's payment (flow.dispute.ts:25) | `ForbiddenError` | 500 | 1, stderr=`user X cannot dispute payment Y` | inline throw, no rule tag |
| DISPUTE-03 | openDispute | `payment.status !== "paired"` (flow.dispute.ts:26) | `InvalidStateError` | 500 | 1 | inline throw, no rule tag |
| DISPUTE-04 | openDispute | unknown paymentId | `NotFoundError` | 500 | 1 | |
| DISPUTE-05 | resolveDispute | role != manager | `ForbiddenError` | 500 | 1 | |
| DISPUTE-06 | resolveDispute | `dispute.status !== "open"` (flow.dispute.ts:53) — already accepted/rejected | `InvalidStateError` | 500 | 1 | inline throw, no rule tag |
| DISPUTE-07 | resolveDispute | unknown disputeId | `NotFoundError` | 500 | 1 | |
| DISPUTE-08 | resolveDispute | decision="rejected" reopens payment to paired without checking payment is still "disputed" (flow.dispute.ts:60-64, per A) | today: silently succeeds even if payment status drifted | 200 | 0 | **unguarded — no error surfaced** |
| CFG-01 | configureLot | role != manager | `ForbiddenError` | 500 | 1 | |
| CFG-02 | configureLot | update existing lot via provided `lotId` (flow.configure-lot.ts:25, `??`) vs create-new (lotId absent) — both same code path, no distinct guard | n/a (both succeed) | 200 | 0 | no distinction traced between create vs update |
| REPORT-01 | readReport | role != manager | `ForbiddenError` | 500 | 1 | |
| REPORT-02 | readReport | `lotId` filter for nonexistent lot → empty `lots` array, no throw (flow.read-report.ts:17) | n/a (empty success) | 200 | 0 | |
| RECEIPT-01 | listReceipts | user requests another user's receipts (flow.list-receipts.ts:15-17) | `ForbiddenError` | 500 | 1, stderr=`user X cannot read receipts for Y` | inline throw, no rule tag |
| RECEIPT-02 | listReceipts | `userId` absent, defaults to `tx.actor.id` (flow.list-receipts.ts:14) | n/a (success) | 200 | 0 | |
| JOB-01 | expireBookings | role != manager/operator | `ForbiddenError` | n/a — job runner (jobs.ts:39-45) catches, calls `onError`, no HTTP/CLI edge | n/a | `context.close({ok:false, error})` (jobs.ts:43) |
| JOB-02 | expireBookings | booking expiry boundary: `nowMs === startAt + graceMinutes*60000` exactly (flow.expire-bookings.ts:32, strict `>`) → NOT expired yet | n/a (no-op) | n/a | |
| JOB-03 | expireBookings | `nowMs === boundary + 1ms` → expired | n/a (success) | n/a | |
| JOB-04 | expireBookings | force-collect deadline exact boundary: `nowMs === exitedAt + refundWindowMinutes*60000` (flow.expire-bookings.ts:47, `nowMs <= deadline` skip) → NOT force-collected yet at exact boundary | n/a (no-op) | n/a | |
| JOB-05 | expireBookings | `nowMs === deadline + 1ms` → force-collected | n/a (success) | n/a | |
| JOB-06 | expireBookings | unknown lot referenced by a stale booking (`tx.store.lot` throws inside filter, flow.expire-bookings.ts:31) — one bad booking aborts the whole batch (no per-item isolation) | today: entire flow throws, `.filter`/`.map` chain aborts, **no partial progress, no per-booking isolation** | n/a | n/a | flow-level `flow.error` only, no per-item events |
| WF-01 | dayClose | role != manager | `ForbiddenError` | n/a — workflow runner (workflows.ts:37-42) catches, `onError`, no HTTP/CLI edge | n/a | `context.close({ok:false, error})` (workflows.ts:41), tagged with `workflowRun({taskId, runId})` (workflows.ts:31) |
| WF-02 | dayClose | `discrepancyCents !== 0` → `reconciled: false` (flow.day-close.ts:46) — **not an error**, just a flagged field | n/a (success, silent discrepancy) | n/a | success event only — **discrepancy never surfaces as an alertable error/log** |
| WF-03 | dayClose | no payments/receipts for the day → all sums 0, `reconciled: true` (empty edge case) | n/a | n/a | |

---

## C. Observability contract

### Wiring order (proposed, `examples/parking-lot-app/src/app.ts`)

```ts
import { logging } from "@pumped-fn/logging"
import { observable } from "@pumped-fn/observable"

export default {
  presets: [preset(store, database)],
  context: contextTags,
  extensions: [
    logging.extension(),      // outer: wraps exec, logs flow.start/success/error
    observable.extension(),   // inner: traces resource/flow/function phases with timings
  ],
  tags: [
    logging.runtime({ sinks: [mySink], level: "info", flow: "all" }),
    observable.runtime({ sinks: [myObsSink], input: true, output: false }),
  ],
} satisfies pumped.Config
```

Order matters: extensions run outer-to-inner around `wrapExec`, so `logging` first means log lines bracket the observable trace; swap if trace correlation IDs should wrap log lines instead — no ordering guarantee is asserted by either package's source (`pkg/ext/logging/src/index.ts:104-139`, `pkg/ext/observable/src/index.ts:83-107` both just export a `Lite.Extension`).

### Runtime tag config to distinguish edges

- HTTP request: `hono.adapter().middleware({ tags: (req) => [...contextTags(req), logging.runtime({...}), observable.runtime({...})] })` (`pkg/framework/hono/src/index.ts:54-56`) — per-request context via `scope.createContext({ tags })`.
- Job tick: `jobs.ts:37`, `appScope.createContext({ tags: appConfig?.context?.() })` — currently **no job-identifying tag is attached** (unlike workflows). Proposal: add a `jobRun({ taskId: entry.name, runId })` tag analogous to `workflowRun` (workflows.ts:31) so job-tick observability events are attributable — **framework gap**, flagged below.
- Workflow run: already tagged via `workflowRun({ taskId: entry.name, runId: randomUUID() })` (workflows.ts:31-34).
- Rule evaluation: every rule flow (`allow`, `assertCapacity`, `assertDriveUpCapacity`, `amountDue`) carries `tags: [rule({ name: "..." })]` (`tags.ts:11`, e.g. `flow.rule.allow.ts:14`). The 8 inline `throw new Error(...)` guards in `cancelBooking`, `checkInBooking`, `prepareExit`, `pairPayment`, `recordPaymentFailure`, `refundPayment`, `openDispute` (ownership+status), `resolveDispute`, `listReceipts` do **not** carry a `rule` tag — they are indistinguishable from arbitrary bugs in observability today.

### Test sketch: attaching a memory sink and asserting captured events

```ts
import { createScope, preset } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/logging"
import { observable } from "@pumped-fn/observable"
import { actor, now, store, createMemoryStore, bookSpace, configureLot } from "@pumped-fn/parking-lot-shared"

test("bookSpace failure traces a rule error and closes ok:false", async () => {
  const logSink = logging.memory()
  const obsSink = observable.memory()

  const scope = createScope({
    extensions: [logging.extension(), observable.extension()],
    presets: [preset(store, createMemoryStore())],
    tags: [
      actor({ id: "user-1", role: "user" }),
      now(() => "2026-07-01T08:00:00.000Z"),
      logging.runtime({ sinks: [logSink], level: "debug", flow: "all" }),
      observable.runtime({ sinks: [obsSink], input: true }),
    ],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({
    flow: bookSpace,
    input: { lotId: "missing-lot", plate: "abc", startAt: "t0", endAt: "t1" },
  })).rejects.toThrow()

  await ctx.close({ ok: false, error: new Error("boundary") })
  await scope.dispose()

  const errorEvents = obsSink.events().filter((e) => e.phase === "error")
  expect(errorEvents.some((e) => e.name === "parking.rule.allow")).toBe(false) // allow passed
  expect(logSink.records().some((r) => r.level === "error" && r.message === "flow.error")).toBe(true)
})
```

(`logging.memory()` / `observable.memory()` and their `.records()`/`.events()` accessors are real exports — `pkg/ext/logging/src/index.ts:141-170,204-209`, `pkg/ext/observable/src/index.ts:109-138,174-178`.)

### Invariants (proposed, to be enforced by tests against the sketch above)

- Every `flow.exec` produces a `wrapExec`-traced `observable` event pair (start+success, or start+error) — enforced by `observable.extension().wrapExec` (`pkg/ext/observable/src/index.ts:94-102`), already unconditional as long as a runtime with sinks is tagged.
- Every context closed with `{ ok: false, error }` at the CLI/jobs/workflows edges (cli.ts:49, jobs.ts:43, workflows.ts:41) must correspond to at least one `phase: "error"` observable event and one `level: "error"` log record with `message: "flow.error"` — not currently asserted anywhere in the test suite.
- Every rule-tagged flow (`allow`, `assertCapacity`, `assertDriveUpCapacity`, `amountDue`) evaluation must appear as an `observable` event `name` matching its flow `name` (e.g. `"parking.rule.allow"`) — currently true structurally but untested.
- Jobs and workflow runs must be identifiable via tags in emitted events/logs: workflows already carry `workflowRun` tag; **jobs do not** (gap — see below) so job-tick log/trace records cannot currently be correlated to a specific scheduled entry beyond the log `source` defaulting to the flow name.
- Inline `throw new Error(...)` guards (the 8 listed above) must be converted to `rule`-tagged sub-flows or typed errors carrying enough structured `fields`/`data` for the sink to distinguish "expected domain rejection" from "unexpected bug" — currently indistinguishable (both are bare `Error`).

---

## D. Error taxonomy proposal

Discriminated union, no classes/inheritance ceremony, one shape per flow-level rejection:

```ts
export type ParkingError =
  | { kind: "forbidden"; actorRole: Role; action: string }
  | { kind: "not-found"; entity: "lot" | "booking" | "session" | "payment" | "dispute" | "receipt" | "audit"; id: string }
  | { kind: "capacity-exceeded"; lotId: string }
  | { kind: "invalid-state"; entity: string; id: string; from: string; expected: readonly string[] }
  | { kind: "ownership-violation"; actorId: string; targetUserId: string }
```

| Current throw (file:line) | Message | Proposed variant | HTTP status | CLI exit + stderr shape |
|---|---|---|---|---|
| flow.rule.allow.ts:16 | `role ${role} cannot ${action}` | `{kind:"forbidden", actorRole, action}` | 403 | 1, `forbidden: role X cannot Y` |
| flow.rule.assert-capacity.ts:25 | `lot ${id} has no reservable capacity` | `{kind:"capacity-exceeded", lotId}` | 409 | 1, `capacity-exceeded: lot X` |
| flow.rule.assert-drive-up-capacity.ts:17 | `lot ${id} is full` | `{kind:"capacity-exceeded", lotId}` | 409 | 1, `capacity-exceeded: lot X` |
| store.ts:177 (`must`) — surfaces as `unknown lot/booking/session/payment/receipt/dispute/audit: X` | — | `{kind:"not-found", entity, id}` | 404 | 1, `not-found: <entity> X` |
| flow.booking.ts:50 | `role ${role} cannot cancel booking ${id}` | `{kind:"forbidden", actorRole, action:"cancel booking"}` | 403 | 1 |
| flow.booking.ts:52 | `booking ${id} is not held` | `{kind:"invalid-state", entity:"booking", id, from, expected:["held"]}` | 409 | 1 |
| flow.check-in.ts:47 | `booking ${id} is not held` | `{kind:"invalid-state", entity:"booking", ...}` | 409 | 1 |
| flow.prepare-exit.ts:19 | `session ${id} is not parked` | `{kind:"invalid-state", entity:"session", expected:["parked"]}` | 409 | 1 |
| flow.payment.ts:31 | `payment ${id} cannot be paired from ${status}` | `{kind:"invalid-state", entity:"payment", expected:["pending","failed"]}` | 409 | 1 |
| flow.payment.ts:56 | `payment ${id} is not pending` | `{kind:"invalid-state", entity:"payment", expected:["pending"]}` | 409 | 1 |
| flow.payment.ts:75 | `payment ${id} cannot be refunded from ${status}` | `{kind:"invalid-state", entity:"payment", expected:["paired","disputed"]}` | 409 | 1 |
| flow.dispute.ts:25 | `user ${id} cannot dispute payment ${id}` | `{kind:"ownership-violation", actorId, targetUserId}` | 403 | 1 |
| flow.dispute.ts:26 | `payment ${id} cannot be disputed from ${status}` | `{kind:"invalid-state", entity:"payment", expected:["paired"]}` | 409 | 1 |
| flow.dispute.ts:53 | `dispute ${id} is not open` | `{kind:"invalid-state", entity:"dispute", expected:["open"]}` | 409 | 1 |
| flow.list-receipts.ts:16 | `user ${id} cannot read receipts for ${id}` | `{kind:"ownership-violation", ...}` | 403 | 1 |
| jobs.ts:18 (`resolveSchedule`) | `jobs entry "${name}" is missing a required schedule tag` | config-time error, not a domain error — leave as thrown `Error` (startup-fail-fast) | n/a (process fails to start) | n/a |

**Framework gaps (do not design around these silently):**

1. `pkg/framework/pumped/src/runtime/serve.ts:59-66` has **no error-mapping hook** — `context.json(await context.var.lite.exec(...))` is unwrapped; a thrown error propagates to Hono's default handler as a bare 500 with no way for `app.ts` to register a `ParkingError → HTTP status` mapping. Implementing the D taxonomy's HTTP-status column requires either (a) a new `onError`/`mapError` option on `createServer`, or (b) wrapping every server route handler manually — neither exists today.
2. `pkg/framework/pumped/src/runtime/jobs.ts` never attaches a job-identifying tag (contrast `workflows.ts:31`, which tags every run with `workflowRun({taskId, runId})`) — there is no equivalent `jobRun` tag, so job-tick observability/log events cannot be correlated to a specific job entry or invocation without a new tag being added to the framework.
3. `pkg/framework/pumped/src/runtime/cli.ts:44-54` and `jobs.ts:36-46` and `workflows.ts:30-44` each hand-roll the same `try { exec } catch { close(ok:false) }` pattern with no shared helper — any typed-error → exit-code mapping added for CLI must be duplicated for jobs/workflows onError callbacks by hand; there is no single seam to install the section D mapping table once.

---

## E. Gap summary

Total matrix rows (section B): **48** (BOOK 12, CHECKIN 9, EXIT 8, PAY 12, DISPUTE 8, CFG 2, REPORT 2, RECEIPT 2, JOB 6, WF 3 — note some rows are boundary-pairs counted individually; exact count by ID prefix: BOOK-01..12=12, CHECKIN-01..09=9, EXIT-01..08=8, PAY-01..12=12, DISPUTE-01..08=8, CFG-01..02=2, REPORT-01..02=2, RECEIPT-01..02=2, JOB-01..06=6, WF-01..03=3; sum=64. Recount: 12+9+8+12+8+2+2+2+6+3 = 64).

Currently covered by existing tests (`examples/parking-lot-shared/tests/*.test.ts`, `examples/parking-lot-app/tests/*.test.ts`):

- BOOK-01 (role-boundary, workflows.test.ts:184-205 — "enforces role boundaries") — covered for `configureLot` (CFG-01), not directly for `bookSpace`'s `allow`, but same rule flow is exercised generically.
- CFG-01 — covered (workflows.test.ts:190-201).
- JOB-02/JOB-03 boundary — covered (flow.expire-bookings.test.ts:16-63, "cancels no-show held bookings past the grace window", uses `graceMinutes: 15` and a clock 20 min later — tests the "past" side only, not the exact-boundary or one-unit-under side).
- JOB-04/JOB-05 boundary — covered (flow.expire-bookings.test.ts:65-124, "force-collects payments... past the refund window" — again only the "past" side, no exact-boundary test).
- Happy-path booking→check-in→exit→pair→refund→dispute→resolve chain — covered broadly across workflows.test.ts:31-182 and integration.test.ts, server-entry.test.ts, cli-entry.test.ts, booking.test.ts (exercises success paths for BOOK, CHECKIN, EXIT, PAY-happy, DISPUTE-happy, REPORT, RECEIPT-happy, CFG-happy — no ID above maps 1:1 since these are success rows not enumerated as failure IDs, but they exercise the transitions in section A).

Explicitly covered failure-path row IDs: **BOOK-01 (partial, via CFG-01 pattern), CFG-01, JOB-02/03 (partial — only one side), JOB-04/05 (partial — only one side)** — i.e. **2 fully covered, 2 partially covered (one-sided boundary only)**.

Coverage percentage: **~3–6% of the 64-row matrix** (2 full + 2 half ≈ 3/64 ≈ 4.7%).

Uncovered row IDs (59.3 rows-equivalent), by category:
- Forbidden/role errors: BOOK-01(bookSpace-direct), CHECKIN-01, EXIT-01, PAY-01, PAY-06, PAY-09, DISPUTE-01, DISPUTE-05, REPORT-01 — 9 uncovered.
- Ownership violations: BOOK-09, DISPUTE-02, RECEIPT-01 — 3 uncovered.
- Invalid-state conflicts: BOOK-10, BOOK-12, CHECKIN-07, EXIT-02, PAY-02, PAY-03, PAY-07, PAY-10, DISPUTE-03, DISPUTE-06, DISPUTE-08 — 11 uncovered.
- Capacity boundaries (both edges): BOOK-02, BOOK-03, CHECKIN-02, CHECKIN-03, BOOK-04, BOOK-05, BOOK-06 — 7 uncovered.
- Amount-due boundaries: EXIT-03, EXIT-04, EXIT-05, EXIT-06, EXIT-07 — 5 uncovered.
- Not-found errors: BOOK-07, BOOK-11, CHECKIN-04, CHECKIN-09, EXIT-08, PAY-04, PAY-08, PAY-11, DISPUTE-04, DISPUTE-07 — 10 uncovered.
- Idempotency/double-submit/concurrency: BOOK-08, PAY-05 — 2 uncovered.
- Empty/optional-field: CHECKIN-05, REPORT-02, RECEIPT-02, CFG-02 — 4 uncovered.
- Job/workflow edges: JOB-01, JOB-06, WF-01, WF-02, WF-03 — 5 uncovered (JOB-02/03/04/05 partially covered as noted).
- Refund-window enforcement gap: PAY-12 — 1 uncovered (currently no enforcement exists to test).

Total distinct uncovered IDs: **57** of 64 (89%).
