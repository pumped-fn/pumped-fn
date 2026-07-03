import { describe, expect, it } from "vitest"
import { scheduler } from "../src"

function gate(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe("inProcess backend", () => {
  it("overlap: skip drops a tick while the previous one is in flight", async () => {
    const first = gate()
    const calls: number[] = []
    let call = 0

    const backend = scheduler.inProcess()
    const registration = backend.register(
      { name: "gated", cadence: { cron: "* * * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {
        call += 1
        calls.push(call)
        if (call === 1) await first.promise
      }
    )

    const firstTrigger = registration.trigger()
    await Promise.resolve()
    const secondTrigger = registration.trigger()

    expect(calls).toEqual([1])

    first.resolve()
    await firstTrigger
    await secondTrigger

    await registration.trigger()
    expect(calls).toEqual([1, 2])

    await registration.stop()
  })

  it("overlap: queue chains ticks instead of dropping them", async () => {
    const order: number[] = []
    const backend = scheduler.inProcess()
    const registration = backend.register(
      { name: "queued", cadence: { cron: "* * * * *" }, overlap: "queue", catchUp: "skip" },
      async () => {
        order.push(order.length + 1)
      }
    )

    await Promise.all([registration.trigger(), registration.trigger(), registration.trigger()])

    expect(order).toEqual([1, 2, 3])

    await registration.stop()
  })

  it("stop() prevents further ticks from running", async () => {
    let calls = 0
    const backend = scheduler.inProcess()
    const registration = backend.register(
      { name: "stoppable", cadence: { cron: "* * * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {
        calls += 1
      }
    )

    await registration.trigger()
    await registration.stop()

    expect(calls).toBe(1)
    expect(registration.next()).toBeUndefined()
  })

  it("rejects catchUp other than skip, pointing at durable backends", () => {
    const backend = scheduler.inProcess()
    expect(() =>
      backend.register({ name: "x", cadence: { cron: "* * * * *" }, overlap: "skip", catchUp: "last" }, async () => {})
    ).toThrow(/durable backend/)
  })

  it("supports an every-ms cadence", async () => {
    let calls = 0
    const backend = scheduler.inProcess()
    const registration = backend.register(
      { name: "interval", cadence: { every: "50" }, overlap: "skip", catchUp: "skip" },
      async () => {
        calls += 1
      }
    )

    expect(registration.next()).toBeInstanceOf(Date)
    await registration.trigger()
    expect(calls).toBe(1)

    await registration.stop()
  })

  it("fires on its own timer for an every-ms cadence, not only via trigger()", async () => {
    const seen: number[] = []
    const backend = scheduler.inProcess()
    const registration = backend.register(
      { name: "real-timer", cadence: { every: "10" }, overlap: "skip", catchUp: "skip" },
      async () => {
        seen.push(seen.length + 1)
      }
    )

    await new Promise((r) => setTimeout(r, 50))
    await registration.stop()

    expect(seen.length).toBeGreaterThan(0)
  })

  it("fires on its own timer for a cron cadence, not only via trigger()", async () => {
    const seen: number[] = []
    const backend = scheduler.inProcess()
    const registration = backend.register(
      { name: "real-cron", cadence: { cron: "* * * * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {
        seen.push(seen.length + 1)
      }
    )

    await new Promise((r) => setTimeout(r, 1100))
    await registration.stop()

    expect(seen.length).toBeGreaterThan(0)
  }, 3000)

  it("throws for a non-numeric every cadence", () => {
    const backend = scheduler.inProcess()
    expect(() =>
      backend.register({ name: "bad", cadence: { every: "5m" }, overlap: "skip", catchUp: "skip" }, async () => {})
    ).toThrow(/positive number of milliseconds/)
  })

  it("exposes the next cron run date", () => {
    const backend = scheduler.inProcess()
    const registration = backend.register(
      { name: "cron-next", cadence: { cron: "0 0 * * *" }, overlap: "skip", catchUp: "skip" },
      async () => {}
    )

    expect(registration.next()).toBeInstanceOf(Date)
    return registration.stop()
  })
})
