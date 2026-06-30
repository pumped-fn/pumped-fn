import { createScope, flow, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { material, patchMaterial, workerRegistry } from "../src/index"

describe("agent-sdk public surface", () => {
  it("registers named workers and rejects unknown workers", () => {
    const run = flow({
      name: "run-worker",
      parse: typed<string>(),
      factory: (ctx) => ctx.input.toUpperCase(),
    })
    const registry = workerRegistry([run])

    expect(registry.list()).toEqual(["run-worker"])
    expect(registry.get("run-worker")).toBe(run)
    expect(() => registry.get("missing")).toThrow('Worker "missing" not registered')
  })

  it("patches material state through an execution context", async () => {
    const plan = material("plan", {
      kind: "json",
      initialState: { title: "draft", tags: ["api"] },
    })
    const applyPatch = flow({
      name: "apply-material-patch",
      deps: { plan },
      factory: (ctx, { plan: current }) =>
        patchMaterial(ctx, plan, [
          { op: "replace", path: "/title", value: "ready" },
          { op: "add", path: "/tags/-", value: "ui" },
        ], { expectedRevision: current.revision }),
    })
    const scope = createScope()
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: applyPatch })).resolves.toEqual({
      name: "plan",
      kind: "json",
      revision: 1,
      state: { title: "ready", tags: ["api", "ui"] },
    })

    await ctx.close()
    await scope.dispose()
  })
})
