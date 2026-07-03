import { createScope, preset, tag, type Lite } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  actor,
  checkInVehicle,
  clock,
  configureLot,
  createMemoryStore,
  dayClose,
  listReceipts,
  pairPayment,
  prepareExit,
  readReport,
  store,
  type Actor,
  type ParkingStore,
} from "../src"

const manager: Actor = { id: "manager-1", role: "manager" }
const operator: Actor = { id: "operator-1", role: "operator" }
const rider: Actor = { id: "user-1", role: "user" }
const otherRider: Actor = { id: "user-2", role: "user" }

// `pumped.workflowRun` (pkg/framework/pumped/src/tags.ts) is what a real workflow
// runner tags every dayClose context with — it is not a dependency of this
// package, so this test defines a structurally identical tag with the same
// `tag()` primitive to prove the mechanism (a workflow-identifying tag riding
// along on the execution context) works the same way the framework's does.
const workflowRun = tag<{ taskId: string; runId: string }>({ label: "test.workflowRun" })

async function exec<T>(
  backing: ParkingStore,
  who: Actor,
  iso: string,
  fn: (ctx: Lite.ExecutionContext) => Promise<T>,
  extraTags: Lite.Tagged<any>[] = []
): Promise<T> {
  const scope = createScope({
    presets: [preset(store, backing), preset(clock, () => iso)],
    tags: [actor(who), ...extraTags],
  })
  const ctx = scope.createContext()
  try {
    return await fn(ctx)
  } finally {
    await ctx.close({ ok: true })
    await scope.dispose()
  }
}

describe("REPORT matrix", () => {
  test("REPORT-01 readReport rejects role != manager", async () => {
    const backing = createMemoryStore()

    await expect(exec(backing, operator, "2026-07-01T08:00:00.000Z", (ctx) =>
      ctx.exec({ flow: readReport, input: {} })
    )).rejects.toMatchObject({ fault: { kind: "forbidden", action: "read report", actorId: operator.id } })
  })

  test("REPORT-02 readReport returns an empty lots array for a nonexistent lotId filter, no throw", async () => {
    const backing = createMemoryStore()
    await exec(backing, manager, "2026-07-01T08:00:00.000Z", (ctx) =>
      ctx.exec({
        flow: configureLot,
        input: {
          bookingLeadMinutes: 60,
          capacity: 2,
          currency: "USD",
          graceMinutes: 15,
          name: "Report Lot",
          rateCentsPerHour: 500,
          refundWindowMinutes: 60,
        },
      }))

    const report = await exec(backing, manager, "2026-07-01T08:05:00.000Z", (ctx) =>
      ctx.exec({ flow: readReport, input: { lotId: "no-such-lot" } }))

    expect(report.lots).toEqual([])
    expect(report.totals).toMatchObject({ capacity: 0, parked: 0 })
  })
})

describe("RECEIPT matrix", () => {
  test("RECEIPT-01 listReceipts rejects a user requesting another user's receipts", async () => {
    const backing = createMemoryStore()

    await expect(exec(backing, rider, "2026-07-01T08:00:00.000Z", (ctx) =>
      ctx.exec({ flow: listReceipts, input: { userId: otherRider.id } })
    )).rejects.toMatchObject({ fault: { kind: "forbidden", action: `read receipts for ${otherRider.id}`, actorId: rider.id } })
  })

  test("RECEIPT-02 listReceipts defaults userId to the actor when absent", async () => {
    const backing = createMemoryStore()
    const lot = await exec(backing, manager, "2026-07-01T08:00:00.000Z", (ctx) =>
      ctx.exec({
        flow: configureLot,
        input: {
          bookingLeadMinutes: 60,
          capacity: 2,
          currency: "USD",
          graceMinutes: 15,
          name: "Receipt Lot",
          rateCentsPerHour: 500,
          refundWindowMinutes: 60,
        },
      }))
    const session = await exec(backing, operator, "2026-07-01T09:00:00.000Z", (ctx) =>
      ctx.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "rec-001", userId: rider.id } }))
    const prepared = await exec(backing, operator, "2026-07-01T10:00:00.000Z", (ctx) =>
      ctx.exec({ flow: prepareExit, input: { sessionId: session.id } }))
    await exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: pairPayment,
        input: { externalRef: "ext-1", method: "card", paymentId: prepared.payment.id },
      }))

    const ownReceipts = await exec(backing, rider, "2026-07-01T10:10:00.000Z", (ctx) =>
      ctx.exec({ flow: listReceipts, input: {} }))

    expect(ownReceipts).toHaveLength(1)
    expect(ownReceipts[0]).toMatchObject({ paymentId: prepared.payment.id, type: "charge" })
  })
})

describe("WF matrix", () => {
  test("WF-01 dayClose rejects role != manager inside a workflowRun-tagged context", async () => {
    const backing = createMemoryStore()

    await expect(exec(
      backing,
      operator,
      "2026-07-01T23:00:00.000Z",
      (ctx) => {
        expect(ctx.data.getTag(workflowRun)).toMatchObject({ taskId: "day-close" })
        return ctx.exec({ flow: dayClose, input: {} })
      },
      [workflowRun({ taskId: "day-close", runId: "run-wf-01" })]
    )).rejects.toMatchObject({ fault: { kind: "forbidden", action: "close day", actorId: operator.id } })
  })

  test("WF-02 dayClose flags a nonzero discrepancy as reconciled:false and records it in the audit trail", async () => {
    const backing = createMemoryStore()
    const lot = await exec(backing, manager, "2026-07-01T08:00:00.000Z", (ctx) =>
      ctx.exec({
        flow: configureLot,
        input: {
          bookingLeadMinutes: 60,
          capacity: 2,
          currency: "USD",
          graceMinutes: 15,
          name: "Discrepancy Lot",
          rateCentsPerHour: 500,
          refundWindowMinutes: 60,
        },
      }))
    const session = await exec(backing, operator, "2026-07-01T09:00:00.000Z", (ctx) =>
      ctx.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "wf-001" } }))
    const prepared = await exec(backing, operator, "2026-07-01T10:00:00.000Z", (ctx) =>
      ctx.exec({ flow: prepareExit, input: { sessionId: session.id } }))
    const pairedResult = await exec(backing, operator, "2026-07-01T10:05:00.000Z", (ctx) =>
      ctx.exec({
        flow: pairPayment,
        input: { externalRef: "ext-1", method: "card", paymentId: prepared.payment.id },
      }))

    // simulate a downstream correction to the paired amount (e.g. a manual
    // amendment) that the charge receipt issued at pairing time never reflects
    // — this is the only way to get paymentsCollectedCents != receiptsChargeCents
    // through the public flows plus a direct store fixup.
    backing.savePayment({ ...pairedResult.payment, amountCents: pairedResult.payment.amountCents + 500 })

    const summary = await exec(
      backing,
      manager,
      "2026-07-01T23:00:00.000Z",
      (ctx) => ctx.exec({ flow: dayClose, input: {} }),
      [workflowRun({ taskId: "day-close", runId: "run-wf-02" })]
    )

    expect(summary.reconciled).toBe(false)
    expect(summary.discrepancyCents).toBe(500)

    const audit = backing.audits().find((record) => record.type === "day.closed")
    expect(audit).toBeDefined()
    expect(audit?.data["discrepancyCents"]).toBe(500)
  })

  test("WF-03 dayClose reconciles to true with all-zero sums when there is no activity for the day", async () => {
    const backing = createMemoryStore()

    const summary = await exec(
      backing,
      manager,
      "2026-07-01T23:00:00.000Z",
      (ctx) => ctx.exec({ flow: dayClose, input: {} }),
      [workflowRun({ taskId: "day-close", runId: "run-wf-03" })]
    )

    expect(summary).toMatchObject({
      discrepancyCents: 0,
      netReceiptsCents: 0,
      paymentsCollectedCents: 0,
      receiptsChargeCents: 0,
      receiptsRefundCents: 0,
      reconciled: true,
    })
  })
})
