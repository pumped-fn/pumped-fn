import { createScope, flow, preset, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { scheduler, type Scheduler } from "../src"

function fakeBackend(): Scheduler.Backend & { calls: unknown[] } {
  const calls: unknown[] = []
  return {
    calls,
    register(spec, tick) {
      calls.push(spec)
      return {
        async trigger() {
          await tick({ key: `${spec.name}:fake`, scheduledAt: new Date(0) })
        },
        next: () => undefined,
        async stop() {},
      }
    },
  }
}

describe("schedule()", () => {
  it("passes cadence/overlap/catchUp/name through to backend.register", async () => {
    const backend = fakeBackend()
    const sweep = flow({ factory: () => undefined })
    const entry = scheduler.schedule({
      name: "nightly-sweep",
      cadence: { cron: "0 2 * * *" },
      overlap: "queue",
      catchUp: "skip",
      flow: sweep,
      input: () => undefined,
    })

    const scope = createScope({ tags: [scheduler.backend(backend)] })
    await scope.resolve(entry)

    expect(backend.calls).toEqual([
      { name: "nightly-sweep", cadence: { cron: "0 2 * * *" }, overlap: "queue", catchUp: "skip" },
    ])

    await scope.dispose()
  })

  it("defaults overlap to skip, catchUp to skip, and name from the flow", async () => {
    const backend = fakeBackend()
    const sweep = flow({ name: "named-sweep", factory: () => undefined })
    const entry = scheduler.schedule({ cadence: { every: "1000" }, flow: sweep, input: () => undefined })

    const scope = createScope({ tags: [scheduler.backend(backend)] })
    await scope.resolve(entry)

    expect(backend.calls).toEqual([
      { name: "named-sweep", cadence: { every: "1000" }, overlap: "skip", catchUp: "skip" },
    ])

    await scope.dispose()
  })

  it("throws when neither an explicit name nor the flow's own name is available", () => {
    const anonymous = flow({ factory: () => undefined })
    expect(() =>
      scheduler.schedule({ cadence: { cron: "* * * * *" }, flow: anonymous, input: () => undefined })
    ).toThrow(/requires a name/)
  })

  it("execs the flow through the real scope on trigger(), observing preset deps", async () => {
    const counter = { value: 0 }
    const bump = flow({
      parse: typed<number>(),
      factory: (ctx) => {
        counter.value += ctx.input
        return counter.value
      },
    })

    const entry = scheduler.schedule({
      name: "bump",
      cadence: { cron: "* * * * *" },
      flow: bump,
      input: () => 2,
    })

    const scope = createScope({ tags: [scheduler.backend(scheduler.inProcess())] })
    const registration = await scope.resolve(entry)

    await registration.trigger()
    await registration.trigger()

    expect(counter.value).toBe(4)

    await scope.dispose()
  })

  it("resolves via createScope's presets for the flow's own deps", async () => {
    const { atom } = await import("@pumped-fn/lite")
    const seen: number[] = []
    const port = atom({ factory: () => 0 })
    const record = flow({
      deps: { port },
      factory: (_ctx, deps) => {
        seen.push(deps.port)
      },
    })

    const entry = scheduler.schedule({ name: "record", cadence: { cron: "* * * * *" }, flow: record, input: () => undefined })

    const scope = createScope({
      tags: [scheduler.backend(scheduler.inProcess())],
      presets: [preset(port, 42)],
    })
    const registration = await scope.resolve(entry)
    await registration.trigger()

    expect(seen).toEqual([42])

    await scope.dispose()
  })

  it("closes the context with ok:false and rethrows when the flow fails", async () => {
    const boom = flow({
      name: "boom",
      factory: () => {
        throw new Error("boom")
      },
    })
    const entry = scheduler.schedule({ cadence: { cron: "* * * * *" }, flow: boom, input: () => undefined })

    const scope = createScope({ tags: [scheduler.backend(scheduler.inProcess())] })
    const registration = await scope.resolve(entry)

    await expect(registration.trigger()).rejects.toThrow("boom")

    await scope.dispose()
  })

  it("stops the registration when the scope is disposed", async () => {
    const backend = fakeBackend()
    let stopped = false
    backend.register = ((original) => (spec: any, tick: any) => {
      const reg = original(spec, tick)
      return { ...reg, stop: async () => { stopped = true } }
    })(backend.register)

    const sweep = flow({ name: "sweep", factory: () => undefined })
    const entry = scheduler.schedule({ cadence: { cron: "* * * * *" }, flow: sweep, input: () => undefined })

    const scope = createScope({ tags: [scheduler.backend(backend)] })
    await scope.resolve(entry)
    await scope.dispose()

    expect(stopped).toBe(true)
  })
})
