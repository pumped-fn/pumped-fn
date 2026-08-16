import { atom, createScope, flow } from "@pumped-fn/lite"
import { backend, type Scheduler } from "@pumped-fn/lite-extension-scheduler"
import { describe, expect, it } from "vitest"
import { cronHost } from "../src/hosts/cron"
import { httpHost } from "../src/hosts/http"
import { route, schedule } from "../src/tags"
import { manifest, manifestEntry } from "./helpers"

const counter = atom({ factory: () => ({ value: 0 }) })

const bump = flow({
  deps: { counter },
  factory: (_ctx, deps) => {
    deps.counter.value += 1
    return { value: deps.counter.value }
  },
})

const sweep = flow({
  deps: { counter },
  factory: (_ctx, deps) => {
    deps.counter.value += 1
    return { value: deps.counter.value }
  },
})

function fakeBackend(): Scheduler.Backend & { registrations: Scheduler.Registration[] } {
  const registrations: Scheduler.Registration[] = []
  return {
    registrations,
    register(_spec, tick) {
      const registration: Scheduler.Registration = {
        trigger: (dedupKey?: string) => tick({ key: dedupKey ?? "manual", scheduledAt: new Date() }),
        next: () => undefined,
        stop: async () => {},
      }
      registrations.push(registration)
      return registration
    },
  }
}

describe("shared scope across hosts", () => {
  it("has an http handler and a cron tick observe the same atom instance", async () => {
    const fake = fakeBackend()
    const app = { tags: [backend(fake)] }
    const sharedManifest = manifest(
      app,
      manifestEntry("bump", bump, [route({ method: "POST", path: "/bump" })]),
      manifestEntry("sweep", sweep, [schedule({ cron: "*/5 * * * *" })])
    )

    const scope = createScope(app)
    const http = httpHost.start({ scope, manifest: sharedManifest })
    const cron = cronHost.start({ scope, manifest: sharedManifest })
    await Promise.all([http.ready, cron.ready])

    const first = await http.fetch(new Request("http://test/bump", { method: "POST" }))
    expect(await first.json()).toEqual({ value: 1 })

    await fake.registrations[0]?.trigger()

    const second = await http.fetch(new Request("http://test/bump", { method: "POST" }))
    expect(await second.json()).toEqual({ value: 3 })

    await scope.dispose()
  })
})
