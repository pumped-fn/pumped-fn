import { flow } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { runWorkflows } from "../src/runtime/workflows"
import { workflowRun } from "../src/tags"
import { entry, manifest } from "./helpers"

describe("runWorkflows", () => {
  it("runs each workflows entry once in its own context tagged with workflowRun", async () => {
    const seen: unknown[] = []
    const step = flow({
      factory: (ctx) => {
        seen.push(ctx.data.seekTag(workflowRun))
        return { done: true }
      },
    })

    const runner = runWorkflows(manifest(undefined, entry("workflows", "onboarding", step)))
    await runner.stop()

    expect(seen).toHaveLength(1)
    expect((seen[0] as { taskId: string }).taskId).toBe("onboarding")
    expect((seen[0] as { runId: string }).runId).toBeTruthy()
  })

  it("reports errors via the injectable onError callback", async () => {
    const boom = flow({
      factory: () => {
        throw new Error("boom")
      },
    })

    const errors: unknown[] = []
    const runner = runWorkflows(manifest(undefined, entry("workflows", "boom", boom)), {
      onError: (entry, error) => errors.push([entry.name, error]),
    })
    await runner.stop()

    expect(errors).toHaveLength(1)
    expect((errors[0] as [string, Error])[0]).toBe("boom")
  })

  it("passes the mapped fault from appConfig.mapError alongside the raw error", async () => {
    class Conflict extends Error {}
    const boom = flow({
      factory: () => {
        throw new Conflict("boom")
      },
    })
    const withMapError = manifest(
      { mapError: (error) => (error instanceof Conflict ? { status: 409, body: { kind: "conflict" } } : undefined) },
      entry("workflows", "boom", boom)
    )

    const seen: unknown[] = []
    const runner = runWorkflows(withMapError, { onError: (entry, error, mapped) => seen.push([entry.name, error, mapped]) })
    await runner.stop()

    expect(seen).toEqual([["boom", expect.any(Conflict), { status: 409, body: { kind: "conflict" } }]])
  })
})
