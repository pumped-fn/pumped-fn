import { flow } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { runJobs } from "../src/runtime/jobs"
import { jobRun, schedule } from "../src/tags"
import { entry as manifestEntry, manifest } from "./helpers"

describe("runJobs", () => {
  it("throws a startup error naming the entry when a jobs flow is missing a schedule tag", () => {
    const sweep = flow({ factory: () => undefined })
    const entry = manifestEntry("jobs", "nightly-sweep", sweep)

    expect(() => runJobs(manifest(undefined, entry))).toThrow(/nightly-sweep/)
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
    const entry = manifestEntry("jobs", "nightly-sweep", sweep)

    const runner = runJobs(manifest(undefined, entry))
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
    const entry = manifestEntry("jobs", "boom", boom)

    const errors: unknown[] = []
    const runner = runJobs(manifest(undefined, entry), { onError: (entry, error) => errors.push([entry.name, error]) })
    await runner.tick(entry)
    await runner.stop()

    expect(errors).toHaveLength(1)
    expect((errors[0] as [string, Error])[0]).toBe("boom")
    expect((errors[0] as [string, Error])[1]).toBeInstanceOf(Error)
  })

  it("tags each tick context with jobRun mirroring workflowRun", async () => {
    const seen: unknown[] = []
    const sweep = flow({
      tags: [schedule({ cron: "*/5 * * * *" })],
      factory: (ctx) => {
        seen.push(ctx.data.seekTag(jobRun))
        return { swept: true }
      },
    })
    const entry = manifestEntry("jobs", "nightly-sweep", sweep)

    const runner = runJobs(manifest(undefined, entry))
    await runner.tick(entry)
    await runner.tick(entry)
    await runner.stop()

    expect(seen).toHaveLength(2)
    expect((seen[0] as { job: string }).job).toBe("nightly-sweep")
    expect((seen[0] as { tickId: string }).tickId).toBeTruthy()
    expect((seen[0] as { tickId: string }).tickId).not.toBe((seen[1] as { tickId: string }).tickId)
  })

  it("passes the mapped fault from appConfig.mapError alongside the raw error", async () => {
    class Conflict extends Error {}
    const boom = flow({
      tags: [schedule({ cron: "*/5 * * * *" })],
      factory: () => {
        throw new Conflict("boom")
      },
    })
    const entry = manifestEntry("jobs", "boom", boom)
    const withMapError = manifest(
      { mapError: (error) => (error instanceof Conflict ? { status: 409, body: { kind: "conflict" } } : undefined) },
      entry
    )

    const seen: unknown[] = []
    const runner = runJobs(withMapError, { onError: (entry, error, mapped) => seen.push([entry.name, error, mapped]) })
    await runner.tick(entry)
    await runner.stop()

    expect(seen).toEqual([["boom", expect.any(Conflict), { status: 409, body: { kind: "conflict" } }]])
  })
})
