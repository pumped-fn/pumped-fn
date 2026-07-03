import { flow } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { runJobs } from "../src/runtime/jobs"
import { schedule } from "../src/tags"
import type { Manifest, ManifestEntry } from "../src/runtime/manifest"

describe("runJobs", () => {
  it("throws a startup error naming the entry when a jobs flow is missing a schedule tag", () => {
    const sweep = flow({ factory: () => undefined })
    const entry: ManifestEntry = { kind: "jobs", name: "nightly-sweep", file: "virtual", flow: sweep }
    const manifest: Manifest = { app: undefined, entries: [entry] }

    expect(() => runJobs(manifest)).toThrow(/nightly-sweep/)
  })

  it("runs a tick through a fresh context and reports ok", async () => {
    const calls: number[] = []
    const sweep = flow({
      tags: [schedule({ cron: "*/5 * * * *" })],
      factory: () => {
        calls.push(1)
        return { swept: true }
      },
    })
    const entry: ManifestEntry = { kind: "jobs", name: "nightly-sweep", file: "virtual", flow: sweep }
    const manifest: Manifest = { app: undefined, entries: [entry] }

    const runner = runJobs(manifest)
    await runner.tick(entry)
    await runner.tick(entry)
    await runner.stop()

    expect(calls).toEqual([1, 1])
  })

  it("reports errors via the injectable onError callback instead of throwing", async () => {
    const boom = flow({
      tags: [schedule({ cron: "*/5 * * * *" })],
      factory: () => {
        throw new Error("boom")
      },
    })
    const entry: ManifestEntry = { kind: "jobs", name: "boom", file: "virtual", flow: boom }
    const manifest: Manifest = { app: undefined, entries: [entry] }

    const errors: unknown[] = []
    const runner = runJobs(manifest, { onError: (entry, error) => errors.push([entry.name, error]) })
    await runner.tick(entry)
    await runner.stop()

    expect(errors).toHaveLength(1)
    expect((errors[0] as [string, Error])[0]).toBe("boom")
    expect((errors[0] as [string, Error])[1]).toBeInstanceOf(Error)
  })
})
