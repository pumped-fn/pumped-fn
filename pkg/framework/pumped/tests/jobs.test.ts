import { createScope, flow } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { describe, expect, it } from "vitest"
import { runJobs } from "../src/runtime/jobs"
import type { Manifest, ManifestEntry } from "../src/runtime/manifest"

describe("runJobs", () => {
  it("throws a startup error naming the entry when a jobs entry isn't a schedule() atom", () => {
    const sweep = flow({ factory: () => undefined })
    const entry: ManifestEntry = { kind: "jobs", name: "nightly-sweep", file: "virtual", flow: sweep }
    const manifest: Manifest = { app: undefined, entries: [entry] }

    expect(() => runJobs(manifest)).toThrow(/nightly-sweep/)
  })

  it("actually ticks through the resolved registration's trigger()", async () => {
    const calls: number[] = []
    const sweep = flow({
      factory: () => {
        calls.push(1)
        return { swept: true }
      },
    })
    const scheduleAtom = scheduler.schedule({
      name: "nightly-sweep",
      cadence: { cron: "*/5 * * * *" },
      flow: sweep,
      input: () => undefined,
    })
    const entry: ManifestEntry = { kind: "jobs", name: "nightly-sweep", file: "virtual", schedule: scheduleAtom }
    const manifest: Manifest = { app: undefined, entries: [entry] }

    const scope = createScope({ tags: [scheduler.backend(scheduler.inProcess())] })
    const runner = runJobs(manifest, undefined, scope)
    const registration = await scope.resolve(scheduleAtom)
    await registration.trigger()
    await registration.trigger()
    await runner.stop()
    await scope.dispose()

    expect(calls).toEqual([1, 1])
  })

  it("notifies io.onDefaultBackend when no scheduler.backend tag is set on the scope", async () => {
    const manifest: Manifest = { app: undefined, entries: [] }
    let notified = false

    const runner = runJobs(manifest, { onDefaultBackend: () => (notified = true) })
    await runner.stop()

    expect(notified).toBe(true)
  })

  it("does not notify io.onDefaultBackend when the app config sets its own scheduler.backend tag", async () => {
    const manifest: Manifest = {
      app: { tags: [scheduler.backend(scheduler.inProcess())] },
      entries: [],
    }
    let notified = false

    const runner = runJobs(manifest, { onDefaultBackend: () => (notified = true) })
    await runner.stop()

    expect(notified).toBe(false)
  })

  it("stops all registrations and disposes an owned scope", async () => {
    let stopped = false
    const sweep = flow({ factory: () => undefined })
    const scheduleAtom = scheduler.schedule({
      name: "sweep",
      cadence: { cron: "*/5 * * * *" },
      flow: sweep,
      input: () => undefined,
    })
    const entry: ManifestEntry = { kind: "jobs", name: "sweep", file: "virtual", schedule: scheduleAtom }
    const manifest: Manifest = {
      app: {
        tags: [
          scheduler.backend({
            register(_spec, _tick) {
              return {
                async trigger() {},
                next: () => undefined,
                async stop() {
                  stopped = true
                },
              }
            },
          }),
        ],
      },
      entries: [entry],
    }

    const runner = runJobs(manifest)
    await runner.stop()

    expect(stopped).toBe(true)
  })
})
