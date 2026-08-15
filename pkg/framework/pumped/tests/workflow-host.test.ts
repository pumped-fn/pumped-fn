import { createScope, flow, tags } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { workflowHost } from "../src/hosts/workflow"
import { workflow, workflowRun } from "../src/tags"
import { manifest, manifestEntry } from "./helpers"

describe("workflowHost", () => {
  it("runs each workflow-tagged entry once at start in a run-tagged context", async () => {
    const runs: { name: string; runId: string }[] = []
    const warm = flow({
      deps: { run: tags.required(workflowRun) },
      factory: (_ctx, deps) => {
        runs.push({ name: deps.run.name, runId: deps.run.runId })
        return undefined
      },
    })
    const scope = createScope({})
    const runtime = workflowHost.start({
      scope,
      manifest: manifest(undefined, manifestEntry("warm-cache", warm, [workflow({})])),
    })
    await runtime.ready
    await runtime.stop()

    expect(runs).toHaveLength(1)
    expect(runs[0]?.name).toBe("warm-cache")
    expect(runs[0]?.runId).toMatch(/[0-9a-f-]{36}/)

    await scope.dispose()
  })

  it("reports failures through io.onError instead of rejecting", async () => {
    const failures: { name: string; message: string }[] = []
    const broken = flow({
      factory: () => {
        throw new Error("cold start failed")
      },
    })
    const scope = createScope({})
    const runtime = workflowHost.start({
      scope,
      manifest: manifest(undefined, manifestEntry("broken", broken, [workflow({})])),
      io: {
        onError: (name, error) =>
          failures.push({ name, message: error instanceof Error ? error.message : String(error) }),
      },
    })
    await runtime.ready
    await runtime.stop()

    expect(failures).toEqual([{ name: "broken", message: "cold start failed" }])

    await scope.dispose()
  })

  it("refuses two workflows sharing an effective name at start", async () => {
    const noop = flow({ factory: () => undefined })
    const scope = createScope({})

    expect(() =>
      workflowHost.start({
        scope,
        manifest: manifest(
          undefined,
          manifestEntry("first", noop, [workflow({ name: "same" })]),
          manifestEntry("second", noop, [workflow({ name: "same" })])
        ),
      })
    ).toThrow('duplicate workflow "same": first, second')

    await scope.dispose()
  })
})
