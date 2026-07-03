import { atom, flow } from "@pumped-fn/lite"
import { hono } from "@pumped-fn/lite-hono"
import { describe, expect, it } from "vitest"
import { createAppScope } from "../src/runtime/app-scope"
import { createServer } from "../src/runtime/serve"
import { runJobs } from "../src/runtime/jobs"
import { route } from "../src/tags"
import { schedule } from "../src/tags"
import type { Manifest } from "../src/runtime/manifest"

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
  tags: [schedule({ cron: "*/5 * * * *" })],
  deps: { counter },
  factory: (_ctx, deps) => {
    deps.counter.value += 1
    return { value: deps.counter.value }
  },
})

describe("shared scope across server and jobs", () => {
  it("has an http handler and a job tick observe the same atom instance", async () => {
    const manifest: Manifest = {
      app: undefined,
      entries: [
        { kind: "server", name: "bump", file: "virtual", flow: bump },
        { kind: "jobs", name: "sweep", file: "virtual", flow: sweep },
      ],
    }

    const lite = hono.adapter()
    const scope = createAppScope(manifest, [lite])
    const { app } = createServer(manifest, { scope, lite })
    const jobs = runJobs(manifest, undefined, scope)

    const first = await app.request("/bump", { method: "POST" })
    expect(await first.json()).toEqual({ value: 1 })

    await jobs.tick(manifest.entries[1]!)

    const second = await app.request("/bump", { method: "POST" })
    expect(await second.json()).toEqual({ value: 3 })

    await jobs.stop()
    await scope.dispose()
  })
})
