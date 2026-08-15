import { createScope, flow, tags } from "@pumped-fn/lite"
import { backend, type Scheduler } from "@pumped-fn/lite-extension-scheduler"
import { describe, expect, it } from "vitest"
import { cronHost } from "../src/hosts/cron"
import { cronTick, schedule } from "../src/tags"
import { manifest, manifestEntry } from "./helpers"

interface Registered {
  spec: {
    name: string
    cadence: Scheduler.Cadence
    overlap: Scheduler.Overlap
    catchUp: Scheduler.CatchUp
    onError?: Scheduler.OnError
  }
  tick: (run: { key: string; scheduledAt: Date }) => Promise<void>
  stopped: boolean
}

function fakeBackend(): Scheduler.Backend & { registered: Registered[] } {
  const registered: Registered[] = []
  return {
    registered,
    register(spec, tick) {
      const entry: Registered = { spec, tick, stopped: false }
      registered.push(entry)
      return {
        trigger: (dedupKey?: string) => tick({ key: dedupKey ?? "manual", scheduledAt: new Date() }),
        next: () => undefined,
        stop: async () => {
          entry.stopped = true
        },
      }
    },
  }
}

describe("cronHost", () => {
  it("registers schedule-tagged entries against the app's backend tag and ticks through a tagged context", async () => {
    const seen: { name: string; key: string }[] = []
    const sweep = flow({
      deps: { tick: tags.required(cronTick) },
      factory: (_ctx, deps) => {
        seen.push({ name: deps.tick.name, key: deps.tick.key })
        return undefined
      },
    })
    const fake = fakeBackend()
    const scope = createScope({ tags: [backend(fake)] })
    const runtime = cronHost.start({
      scope,
      manifest: manifest(
        { tags: [backend(fake)] },
        manifestEntry("nightly-sweep", sweep, [schedule({ cron: "0 2 * * *", overlap: "queue" })])
      ),
    })
    await runtime.ready

    expect(fake.registered).toHaveLength(1)
    const registration = fake.registered[0] as Registered
    expect(registration.spec).toMatchObject({
      name: "nightly-sweep",
      cadence: { cron: "0 2 * * *" },
      overlap: "queue",
      catchUp: "skip",
    })

    await registration.tick({ key: "tick-1", scheduledAt: new Date() })
    expect(seen).toEqual([{ name: "nightly-sweep", key: "tick-1" }])

    await scope.dispose()
  })

  it("stops every registration when the scope disposes, with no runner call", async () => {
    const sweep = flow({ factory: () => undefined })
    const fake = fakeBackend()
    const scope = createScope({ tags: [backend(fake)] })
    const runtime = cronHost.start({
      scope,
      manifest: manifest({ tags: [backend(fake)] }, manifestEntry("sweep", sweep, [schedule({ every: "60000" })])),
    })
    await runtime.ready

    await scope.dispose()

    expect(fake.registered.map((entry) => entry.stopped)).toEqual([true])
  })

  it("reads the backend from the scope even when the manifest app lacks it", async () => {
    const sweep = flow({ factory: () => undefined })
    const fake = fakeBackend()
    const scope = createScope({ tags: [backend(fake)] })
    const runtime = cronHost.start({
      scope,
      manifest: manifest(undefined, manifestEntry("sweep", sweep, [schedule({ every: "60000" })])),
    })
    await runtime.ready

    expect(fake.registered).toHaveLength(1)

    await scope.dispose()
  })

  it("reports tick failures through io.onError", async () => {
    const failures: string[] = []
    const broken = flow({
      factory: () => {
        throw new Error("tick failed")
      },
    })
    const fake = fakeBackend()
    const scope = createScope({ tags: [backend(fake)] })
    const runtime = cronHost.start({
      scope,
      manifest: manifest(undefined, manifestEntry("broken", broken, [schedule({ every: "60000" })])),
      io: { onError: (name, error) => failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`) },
    })
    await runtime.ready

    const registration = fake.registered[0] as Registered
    registration.spec.onError?.(new Error("tick failed"), { key: "k", scheduledAt: new Date() })
    expect(failures).toEqual(["broken: tick failed"])

    await scope.dispose()
  })

  it("refuses two schedules sharing an effective name at start", async () => {
    const sweep = flow({ factory: () => undefined })
    const fake = fakeBackend()
    const scope = createScope({ tags: [backend(fake)] })

    expect(() =>
      cronHost.start({
        scope,
        manifest: manifest(
          { tags: [backend(fake)] },
          manifestEntry("first", sweep, [schedule({ cron: "* * * * *", name: "same" })]),
          manifestEntry("second", sweep, [schedule({ cron: "* * * * *", name: "same" })])
        ),
      })
    ).toThrow('duplicate schedule "same": first, second')

    await scope.dispose()
  })

  it("resolves ready without touching the scheduler when no entry carries a schedule tag", async () => {
    const scope = createScope({})
    const runtime = cronHost.start({ scope, manifest: manifest(undefined) })

    await expect(runtime.ready).resolves.toBeUndefined()

    await scope.dispose()
  })
})
