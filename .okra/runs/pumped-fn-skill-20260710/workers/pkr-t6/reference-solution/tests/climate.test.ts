import { describe, expect, it } from "vitest"
import { createScope, flow, typed } from "@pumped-fn/lite"
import { alertChannel, atRiskOf, ingestReading, readings, sameRoomSet, watchAtRisk } from "../src/climate"

const settle = () => new Promise((resolve) => setTimeout(resolve, 25))

const recorder = () => {
  const alerts: string[] = []
  const record = flow({
    name: "climate.testAlert",
    parse: typed<{ galleryId: string }>(),
    factory: (ctx): void => {
      alerts.push(ctx.input.galleryId)
    },
  })
  return { alerts, record }
}

const harness = async () => {
  const { alerts, record } = recorder()
  const scope = createScope({ tags: [alertChannel(record)] })
  await scope.resolve(readings)
  const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
  const session = scope.createContext()
  const ingest = (galleryId: string, rh: number, note?: string) =>
    session.exec({ flow: ingestReading, input: { galleryId, tempC: 20, rh, ...(note === undefined ? {} : { note }) } })
  return { alerts, scope, view, session, ingest }
}

describe("derived at-risk view", () => {
  it("derives the at-risk gallery ids, sorted", async () => {
    const { scope, view, ingest } = await harness()
    expect(view.get()).toEqual([])
    await ingest("west", 62)
    await ingest("east", 48)
    await ingest("attic", 30)
    expect(view.get()).toEqual(["attic", "west"])
    await scope.dispose()
  })

  it("does not re-notify subscribers when new readings leave the at-risk set unchanged", async () => {
    const { scope, view, ingest } = await harness()
    await ingest("west", 62)
    let notifications = 0
    view.subscribe(() => notifications++)
    await ingest("east", 48)
    await ingest("east", 49)
    await ingest("west", 63)
    expect(notifications).toBe(0)
    await ingest("east", 20)
    expect(notifications).toBe(1)
    await scope.dispose()
  })

  it("replaces a gallery's reading wholesale", async () => {
    const { scope, session, ingest } = await harness()
    await ingest("west", 48, "calibrated")
    await ingest("west", 49)
    const state = await scope.resolve(readings)
    expect(state["west"]).toEqual({ tempC: 20, rh: 49 })
    await session.close()
    await scope.dispose()
  })
})

describe("monitor loop", () => {
  it("alerts once per newly at-risk gallery, never on unrelated churn", async () => {
    const { alerts, scope, view, session, ingest } = await harness()
    const monitor = session.exec({ flow: watchAtRisk, input: { view } })
    await ingest("west", 62)
    await settle()
    expect(alerts).toEqual(["west"])
    await ingest("west", 63)
    await ingest("east", 50)
    await settle()
    expect(alerts).toEqual(["west"])
    await ingest("attic", 20)
    await settle()
    expect(alerts).toEqual(["west", "attic"])
    await scope.dispose()
    await monitor
  })

  it("re-alerts a gallery that recovers and then re-enters the at-risk set", async () => {
    const { alerts, scope, view, session, ingest } = await harness()
    const monitor = session.exec({ flow: watchAtRisk, input: { view } })
    await ingest("west", 62)
    await settle()
    await ingest("west", 48)
    await settle()
    await ingest("west", 61)
    await settle()
    expect(alerts).toEqual(["west", "west"])
    await scope.dispose()
    await monitor
  })

  it("coalesced bursts alert exactly the newly at-risk set", async () => {
    const { alerts, scope, view, session, ingest } = await harness()
    const monitor = session.exec({ flow: watchAtRisk, input: { view } })
    await Promise.all([
      ingest("a", 62),
      ingest("b", 48),
      ingest("c", 20),
      ingest("d", 50),
      ingest("e", 70),
    ])
    await settle()
    expect([...alerts].sort()).toEqual(["a", "c", "e"])
    await scope.dispose()
    await monitor
  })
})

describe("state lifetime", () => {
  it("readings survive periods with zero observers", async () => {
    const { alerts, record } = recorder()
    const scope = createScope({ tags: [alertChannel(record)], gc: { graceMs: 10 } })
    await scope.resolve(readings)
    const view = scope.select(readings, atRiskOf, { eq: sameRoomSet })
    const session = scope.createContext()
    await session.exec({ flow: ingestReading, input: { galleryId: "west", tempC: 20, rh: 62 } })
    const unsubscribe = view.subscribe(() => {})
    unsubscribe()
    await new Promise((resolve) => setTimeout(resolve, 120))
    await scope.flush()
    const state = await scope.resolve(readings)
    expect(state["west"]).toEqual({ tempC: 20, rh: 62 })
    expect(alerts).toEqual([])
    await session.close()
    await scope.dispose()
  })
})
