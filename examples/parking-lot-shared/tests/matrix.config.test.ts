import { createScope, preset } from "@pumped-fn/lite"
import { observable } from "@pumped-fn/lite-extension-observable"
import { describe, expect, it } from "vitest"
import { actor, clock, configureLot, createMemoryStore, store } from "../src"

describe("configure-lot matrix", () => {
  it("CFG-01 rejects configureLot when actor role is not manager", async () => {
    const backing = createMemoryStore()
    const obsSink = observable.memory()
    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "operator-1", role: "operator" }), observable.runtime({ sinks: [obsSink] })],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
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

    const events = obsSink.events().filter((event) => event.phase === "error")
    expect(events.some((event) => event.name === "parking.rule.allow")).toBe(true)
    expect(events.some((event) => event.name === "parking.configure-lot")).toBe(true)

    await ctx.close({ ok: false, error: new Error("rejected") })
    await scope.dispose()
  })

  it("CFG-02 updates an existing lot in place when lotId is provided, vs creating a new one when absent", async () => {
    const backing = createMemoryStore()
    const scope = createScope({
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
      tags: [actor({ id: "manager-1", role: "manager" })],
    })
    const ctx = scope.createContext()

    const created = await ctx.exec({
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

    const updated = await ctx.exec({
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

    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
