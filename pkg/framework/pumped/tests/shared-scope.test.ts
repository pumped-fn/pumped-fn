import { atom, flow } from "@pumped-fn/lite"
import { scheduler } from "@pumped-fn/lite-extension-scheduler"
import { hono } from "@pumped-fn/lite-hono"
import { describe, expect, it } from "vitest"
import { createAppScope } from "../src/runtime/app-scope"
import { createServer } from "../src/runtime/serve"
import { runJobs } from "../src/runtime/jobs"
import { route } from "../src/tags"
import { manifest } from "./helpers"

const counter = atom({ factory: () => ({ value: 0 }) })

const bump = flow({
  tags: [route({ method: "POST", path: "/bump" })],
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

const sweepSchedule = scheduler.schedule({
  name: "sweep",
  cadence: { cron: "*/5 * * * *" },
  flow: sweep,
  input: () => undefined,
})

describe("shared scope across server and jobs", () => {
  it("has an http handler and a job tick observe the same atom instance", async () => {
    const sharedManifest = manifest(
      undefined,
      { kind: "server", name: "bump", file: "virtual", flow: bump },
      { kind: "jobs", name: "sweep", file: "virtual", schedule: sweepSchedule },
    )

    const lite = hono.adapter()
    const scope = createAppScope(sharedManifest, [lite])
    const { app } = createServer(sharedManifest, { scope, lite })
    const jobs = runJobs(sharedManifest, undefined, scope)

    const first = await app.request("/bump", { method: "POST" })
    expect(await first.json()).toEqual({ value: 1 })

    const registration = await scope.resolve(sweepSchedule)
    await registration.trigger()

    const second = await app.request("/bump", { method: "POST" })
    expect(await second.json()).toEqual({ value: 3 })

    await jobs.stop()
    await scope.dispose()
  })
})
