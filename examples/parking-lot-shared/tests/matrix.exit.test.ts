import { preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { checkInVehicle, configureLot, createMemoryStore, prepareExit, store } from "../src"
import { parking } from "./harness"

describe("exit matrix", () => {
  it("EXIT-01 rejects prepareExit when actor role is not operator", async () => {
    const backing = createMemoryStore()
    const manager = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "manager-1", role: "manager" }, presets: [preset(store, backing)] })
    const lot = await manager.exec.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 10,
        name: "Exit Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const operator = parking({ at: "2026-07-01T08:05:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const session = await operator.exec.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    const user = parking({
      at: "2026-07-01T09:00:00.000Z",
      as: { id: "user-1", role: "user" },
      observe: true,
      presets: [preset(store, backing)],
    })

    await expect(user.exec.exec({
      flow: prepareExit,
      input: { sessionId: session.id },
    })).rejects.toMatchObject({ fault: { kind: "forbidden", action: "prepare exit", actorId: "user-1" } })

    const events = user.sink!.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.allow")).toBe(true)
    expect(events.some((event) => event.name === "parking.prepare-exit")).toBe(true)

    await manager.exec.close({ ok: true })
    await operator.exec.close({ ok: true })
    await user.exec.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await operator.scope.dispose()
    await user.scope.dispose()
  })

  it("EXIT-02 rejects prepareExit when the session is not parked", async () => {
    const backing = createMemoryStore()
    const manager = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "manager-1", role: "manager" }, presets: [preset(store, backing)] })
    const lot = await manager.exec.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 10,
        name: "Not Parked Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })

    const operator = parking({ at: "2026-07-01T08:05:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const session = await operator.exec.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })
    await operator.exec.exec({ flow: prepareExit, input: { sessionId: session.id } })

    const operator2 = parking({
      at: "2026-07-01T09:10:00.000Z",
      as: { id: "operator-1", role: "operator" },
      observe: true,
      presets: [preset(store, backing)],
    })

    await expect(operator2.exec.exec({
      flow: prepareExit,
      input: { sessionId: session.id },
    })).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "session", id: session.id, from: "awaiting_payment", attempted: "awaiting_payment" },
    })

    const events = operator2.sink!.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.prepare-exit")).toBe(true)

    await manager.exec.close({ ok: true })
    await operator.exec.close({ ok: true })
    await operator2.exec.close({ ok: false, error: new Error("rejected") })
    await manager.scope.dispose()
    await operator.scope.dispose()
    await operator2.scope.dispose()
  })

  it("EXIT-03 charges nothing at exact grace-minute boundary (minutes === graceMinutes)", async () => {
    const backing = createMemoryStore()
    const manager = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "manager-1", role: "manager" }, presets: [preset(store, backing)] })
    const lot = await manager.exec.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 10,
        name: "Grace Boundary Lot",
        rateCentsPerHour: 600,
        refundWindowMinutes: 60,
      },
    })

    const operator = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const session = await operator.exec.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    const exit = parking({ at: "2026-07-01T08:10:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const result = await exit.exec.exec({ flow: prepareExit, input: { sessionId: session.id } })

    expect(result.payment.amountCents).toBe(0)

    await manager.exec.close({ ok: true })
    await operator.exec.close({ ok: true })
    await exit.exec.close({ ok: true })
    await manager.scope.dispose()
    await operator.scope.dispose()
    await exit.scope.dispose()
  })

  it("EXIT-04 charges one billable hour one minute past the grace boundary", async () => {
    const backing = createMemoryStore()
    const manager = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "manager-1", role: "manager" }, presets: [preset(store, backing)] })
    const lot = await manager.exec.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 10,
        name: "Past Grace Lot",
        rateCentsPerHour: 600,
        refundWindowMinutes: 60,
      },
    })

    const operator = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const session = await operator.exec.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    const exit = parking({ at: "2026-07-01T08:11:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const result = await exit.exec.exec({ flow: prepareExit, input: { sessionId: session.id } })

    expect(result.payment.amountCents).toBe(600)

    await manager.exec.close({ ok: true })
    await operator.exec.close({ ok: true })
    await exit.exec.close({ ok: true })
    await manager.scope.dispose()
    await operator.scope.dispose()
    await exit.scope.dispose()
  })

  it("EXIT-05 charges nothing one minute under the grace boundary", async () => {
    const backing = createMemoryStore()
    const manager = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "manager-1", role: "manager" }, presets: [preset(store, backing)] })
    const lot = await manager.exec.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 10,
        name: "Under Grace Lot",
        rateCentsPerHour: 600,
        refundWindowMinutes: 60,
      },
    })

    const operator = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const session = await operator.exec.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    const exit = parking({ at: "2026-07-01T08:09:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const result = await exit.exec.exec({ flow: prepareExit, input: { sessionId: session.id } })

    expect(result.payment.amountCents).toBe(0)

    await manager.exec.close({ ok: true })
    await operator.exec.close({ ok: true })
    await exit.exec.close({ ok: true })
    await manager.scope.dispose()
    await operator.scope.dispose()
    await exit.scope.dispose()
  })

  it("EXIT-06 charges nothing when exitedAt is before enteredAt (clock skew, clamped)", async () => {
    const backing = createMemoryStore()
    const manager = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "manager-1", role: "manager" }, presets: [preset(store, backing)] })
    const lot = await manager.exec.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 0,
        name: "Clock Skew Lot",
        rateCentsPerHour: 600,
        refundWindowMinutes: 60,
      },
    })

    const operator = parking({ at: "2026-07-01T09:00:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const session = await operator.exec.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    const exit = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const result = await exit.exec.exec({ flow: prepareExit, input: { sessionId: session.id } })

    expect(result.payment.amountCents).toBe(0)

    await manager.exec.close({ ok: true })
    await operator.exec.close({ ok: true })
    await exit.exec.close({ ok: true })
    await manager.scope.dispose()
    await operator.scope.dispose()
    await exit.scope.dispose()
  })

  it("EXIT-07 rounds billable minutes up to the next full hour (60 vs 61 minutes)", async () => {
    const backing = createMemoryStore()
    const manager = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "manager-1", role: "manager" }, presets: [preset(store, backing)] })
    const lot = await manager.exec.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 0,
        name: "Hour Rounding Lot",
        rateCentsPerHour: 600,
        refundWindowMinutes: 60,
      },
    })

    const operator = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const sixtyMinSession = await operator.exec.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-060" } })
    const sixtyOneMinSession = await operator.exec.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-061" } })

    const sixtyExit = parking({ at: "2026-07-01T09:00:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const sixtyResult = await sixtyExit.exec.exec({ flow: prepareExit, input: { sessionId: sixtyMinSession.id } })
    expect(sixtyResult.payment.amountCents).toBe(600)

    const sixtyOneExit = parking({ at: "2026-07-01T09:01:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })
    const sixtyOneResult = await sixtyOneExit.exec.exec({ flow: prepareExit, input: { sessionId: sixtyOneMinSession.id } })
    expect(sixtyOneResult.payment.amountCents).toBe(1200)

    await manager.exec.close({ ok: true })
    await operator.exec.close({ ok: true })
    await sixtyExit.exec.close({ ok: true })
    await sixtyOneExit.exec.close({ ok: true })
    await manager.scope.dispose()
    await operator.scope.dispose()
    await sixtyExit.scope.dispose()
    await sixtyOneExit.scope.dispose()
  })

  it("EXIT-08 rejects prepareExit for an unknown sessionId", async () => {
    const backing = createMemoryStore()
    const operator = parking({ at: "2026-07-01T08:00:00.000Z", as: { id: "operator-1", role: "operator" }, presets: [preset(store, backing)] })

    await expect(operator.exec.exec({
      flow: prepareExit,
      input: { sessionId: "missing-session" },
    })).rejects.toMatchObject({ entity: "session", id: "missing-session" })

    await operator.exec.close({ ok: false, error: new Error("rejected") })
    await operator.scope.dispose()
  })
})
