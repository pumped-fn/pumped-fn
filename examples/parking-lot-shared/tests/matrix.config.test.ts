import { preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { configureLot, createMemoryStore, store } from "../src"
import { parking } from "./harness"

describe("configure-lot matrix", () => {
  it("CFG-01 rejects configureLot when actor role is not manager", async () => {
    const backing = createMemoryStore()
    const operator = parking("2026-07-01T08:00:00.000Z", { id: "operator-1", role: "operator" }, preset(store, backing))

    await expect(operator.ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 1,
        currency: "USD",
        graceMinutes: 0,
        name: "Config Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })).rejects.toMatchObject({ fault: { kind: "forbidden", action: "configure lot", actorId: "operator-1" } })

    const events = operator.sink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.allow")).toBe(true)
    expect(events.some((event) => event.name === "parking.configure-lot")).toBe(true)

    await operator.ctx.close({ ok: false, error: new Error("rejected") })
    await operator.scope.dispose()
  })

  it("CFG-02 updates an existing lot in place when lotId is provided, vs creating a new one when absent", async () => {
    const backing = createMemoryStore()
    const manager = parking("2026-07-01T08:00:00.000Z", { id: "manager-1", role: "manager" }, preset(store, backing))

    const created = await manager.ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 60,
        capacity: 2,
        currency: "USD",
        graceMinutes: 5,
        name: "Original Lot",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })
    expect(backing.lots()).toHaveLength(1)

    const updated = await manager.ctx.exec({
      flow: configureLot,
      input: {
        bookingLeadMinutes: 90,
        capacity: 4,
        currency: "USD",
        graceMinutes: 15,
        lotId: created.id,
        name: "Updated Lot",
        rateCentsPerHour: 800,
        refundWindowMinutes: 120,
      },
    })

    expect(updated.id).toBe(created.id)
    expect(backing.lots()).toHaveLength(1)
    expect(backing.lot(created.id)).toMatchObject({ capacity: 4, name: "Updated Lot", rateCentsPerHour: 800 })

    await manager.ctx.close({ ok: true })
    await manager.scope.dispose()
  })
})
