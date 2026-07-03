import { flow } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { runWorkflows } from "../src/runtime/workflows"
import { workflowRun } from "../src/tags"
import type { Manifest } from "../src/runtime/manifest"

describe("runWorkflows", () => {
  it("runs each workflows entry once in its own context tagged with workflowRun", async () => {
    const seen: unknown[] = []
    const step = flow({
      factory: (ctx) => {
        seen.push(ctx.data.seekTag(workflowRun))
        return { done: true }
      },
    })
    const manifest: Manifest = {
      app: undefined,
      entries: [{ kind: "workflows", name: "onboarding", file: "virtual", flow: step }],
    }

    const runner = runWorkflows(manifest)
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
    const manifest: Manifest = {
      app: undefined,
      entries: [{ kind: "workflows", name: "boom", file: "virtual", flow: boom }],
    }

    const errors: unknown[] = []
    const runner = runWorkflows(manifest, { onError: (entry, error) => errors.push([entry.name, error]) })
    await runner.stop()

    expect(errors).toHaveLength(1)
    expect((errors[0] as [string, Error])[0]).toBe("boom")
  })
})
