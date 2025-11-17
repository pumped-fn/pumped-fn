import { describe, it, expect, vi } from "vitest"
import { flow } from "../../src/flow"
import { provide } from "../../src/executor"

describe("flow.execute options", () => {
  it("disposes transient scopes when requesting details", async () => {
    const cleanup = vi.fn()
    const resource = provide((ctl) => {
      ctl.cleanup(cleanup)
      return { value: 2 }
    })
    const sample = flow([resource], async ([dep], _ctx, input: number) => dep.value + input)
    const details = await flow.execute(sample, 1, { details: true })
    if (!details.success) {
      throw new Error("expected success")
    }
    expect(details.result).toBe(3)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
