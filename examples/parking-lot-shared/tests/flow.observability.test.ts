import { createScope, preset } from "@pumped-fn/lite"
import { observable } from "@pumped-fn/lite-extension-observable"
import { describe, expect, test } from "vitest"
import { actor, bookSpace, clock, configureLot, createMemoryStore, store } from "../src"

describe("nested rule exec observability", () => {
  test("attributes a rejected allow rule and its parent flow in the trace", async () => {
    const backing = createMemoryStore()
    const obsSink = observable.memory()

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
        name: "Observable Garage",
        rateCentsPerHour: 500,
        refundWindowMinutes: 60,
      },
    })
    await manager.close({ ok: true })
    await managerScope.dispose()

    const scope = createScope({
      extensions: [observable.extension()],
      presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:05:00.000Z")],
      tags: [
        actor({ id: "operator-1", role: "operator" }),
        observable.runtime({ sinks: [obsSink], input: true }),
      ],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({
      flow: bookSpace,
      input: {
        endAt: "2026-07-02T10:00:00.000Z",
        lotId: lot.id,
        plate: "abc-111",
        startAt: "2026-07-02T08:00:00.000Z",
      },
    })).rejects.toThrow("role operator cannot book space")

    await ctx.close({ ok: false, error: new Error("rejected by allow rule") })
    await scope.dispose()

    const events = obsSink.events()
    const allowError = events.find((event) => event.phase === "error" && event.name === "parking.rule.allow")
    const bookSpaceError = events.find((event) => event.phase === "error" && event.name === "parking.book-space")

    expect(allowError).toBeDefined()
    expect(allowError?.error?.message).toBe("role operator cannot book space")
    expect(bookSpaceError).toBeDefined()
    expect(bookSpaceError?.error?.message).toBe("role operator cannot book space")
  })
})
