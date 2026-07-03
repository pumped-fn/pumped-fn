import { createScope, preset } from "@pumped-fn/lite"
import { observable } from "@pumped-fn/lite-extension-observable"
import { describe, expect, it } from "vitest"
import {
  actor,
  checkInVehicle,
  clock,
  configureLot,
  createMemoryStore,
  prepareExit,
  store,
} from "../src"

describe("exit matrix", () => {
  it("EXIT-01 rejects prepareExit when actor role is not operator", async () => {
    const backing = createMemoryStore()
    const managerScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const manager = managerScope.createContext()
    const lot = await manager.exec({
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

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    const session = await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    const obsSink = observable.memory()
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T09:00:00.000Z")],
      tags: [actor({ id: "user-1", role: "user" }), observable.runtime({ sinks: [obsSink] })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: prepareExit,
      input: { sessionId: session.id },
    })).rejects.toMatchObject({ fault: { kind: "forbidden", action: "prepare exit", actorId: "user-1" } })

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.allow")).toBe(true)
    expect(events.some((event) => event.name === "parking.prepare-exit")).toBe(true)

    await manager.close({ ok: true })
    await operator.close({ ok: true })
    await ctx.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await operatorScope.dispose()
    await scope.dispose()
  })

  it("EXIT-02 rejects prepareExit when the session is not parked", async () => {
    const backing = createMemoryStore()
    const managerScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const manager = managerScope.createContext()
    const lot = await manager.exec({
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

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    const session = await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })
    await operator.exec({ flow: prepareExit, input: { sessionId: session.id } })

    const obsSink = observable.memory()
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T09:10:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" }), observable.runtime({ sinks: [obsSink] })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: prepareExit,
      input: { sessionId: session.id },
    })).rejects.toMatchObject({
      fault: { kind: "conflict", entity: "session", id: session.id, from: "awaiting_payment", attempted: "awaiting_payment" },
    })

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.prepare-exit")).toBe(true)

    await manager.close({ ok: true })
    await operator.close({ ok: true })
    await ctx.close({ ok: false, error: new Error("rejected") })
    await managerScope.dispose()
    await operatorScope.dispose()
    await scope.dispose()
  })

  it("EXIT-03 charges nothing at exact grace-minute boundary (minutes === graceMinutes)", async () => {
    const backing = createMemoryStore()
    const managerScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const manager = managerScope.createContext()
    const lot = await manager.exec({
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

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    const session = await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    const exitScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:10:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const exit = exitScope.createContext()
    const result = await exit.exec({ flow: prepareExit, input: { sessionId: session.id } })

    expect(result.payment.amountCents).toBe(0)

    await manager.close({ ok: true })
    await operator.close({ ok: true })
    await exit.close({ ok: true })
    await managerScope.dispose()
    await operatorScope.dispose()
    await exitScope.dispose()
  })

  it("EXIT-04 charges one billable hour one minute past the grace boundary", async () => {
    const backing = createMemoryStore()
    const managerScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const manager = managerScope.createContext()
    const lot = await manager.exec({
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

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    const session = await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    const exitScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:11:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const exit = exitScope.createContext()
    const result = await exit.exec({ flow: prepareExit, input: { sessionId: session.id } })

    expect(result.payment.amountCents).toBe(600)

    await manager.close({ ok: true })
    await operator.close({ ok: true })
    await exit.close({ ok: true })
    await managerScope.dispose()
    await operatorScope.dispose()
    await exitScope.dispose()
  })

  it("EXIT-05 charges nothing one minute under the grace boundary", async () => {
    const backing = createMemoryStore()
    const managerScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const manager = managerScope.createContext()
    const lot = await manager.exec({
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

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    const session = await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    const exitScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:09:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const exit = exitScope.createContext()
    const result = await exit.exec({ flow: prepareExit, input: { sessionId: session.id } })

    expect(result.payment.amountCents).toBe(0)

    await manager.close({ ok: true })
    await operator.close({ ok: true })
    await exit.close({ ok: true })
    await managerScope.dispose()
    await operatorScope.dispose()
    await exitScope.dispose()
  })

  it("EXIT-06 charges nothing when exitedAt is before enteredAt (clock skew, clamped)", async () => {
    const backing = createMemoryStore()
    const managerScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const manager = managerScope.createContext()
    const lot = await manager.exec({
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

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T09:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    const session = await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-111" } })

    const exitScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const exit = exitScope.createContext()
    const result = await exit.exec({ flow: prepareExit, input: { sessionId: session.id } })

    expect(result.payment.amountCents).toBe(0)

    await manager.close({ ok: true })
    await operator.close({ ok: true })
    await exit.close({ ok: true })
    await managerScope.dispose()
    await operatorScope.dispose()
    await exitScope.dispose()
  })

  it("EXIT-07 rounds billable minutes up to the next full hour (60 vs 61 minutes)", async () => {
    const backing = createMemoryStore()
    const managerScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const manager = managerScope.createContext()
    const lot = await manager.exec({
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

    const operatorScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const operator = operatorScope.createContext()
    const sixtyMinSession = await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-060" } })
    const sixtyOneMinSession = await operator.exec({ flow: checkInVehicle, input: { lotId: lot.id, plate: "abc-061" } })

    const sixtyExitScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T09:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const sixtyExit = sixtyExitScope.createContext()
    const sixtyResult = await sixtyExit.exec({ flow: prepareExit, input: { sessionId: sixtyMinSession.id } })
    expect(sixtyResult.payment.amountCents).toBe(600)

    const sixtyOneExitScope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T09:01:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const sixtyOneExit = sixtyOneExitScope.createContext()
    const sixtyOneResult = await sixtyOneExit.exec({ flow: prepareExit, input: { sessionId: sixtyOneMinSession.id } })
    expect(sixtyOneResult.payment.amountCents).toBe(1200)

    await manager.close({ ok: true })
    await operator.close({ ok: true })
    await sixtyExit.close({ ok: true })
    await sixtyOneExit.close({ ok: true })
    await managerScope.dispose()
    await operatorScope.dispose()
    await sixtyExitScope.dispose()
    await sixtyOneExitScope.dispose()
  })

  it("EXIT-08 rejects prepareExit for an unknown sessionId", async () => {
    const backing = createMemoryStore()
    const scope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: prepareExit,
      input: { sessionId: "missing-session" },
    })).rejects.toMatchObject({ entity: "session", id: "missing-session" })

    await ctx.close({ ok: false, error: new Error("rejected") })
    await scope.dispose()
  })
})
