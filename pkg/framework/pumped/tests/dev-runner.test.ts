import { describe, expect, it } from "vitest"
import { createDevRunner } from "../src/runtime/dev-runner"

describe("createDevRunner", () => {
  it("caches a loaded value across get() calls until invalidated", async () => {
    let loads = 0
    const runner = createDevRunner(
      async () => {
        loads += 1
        return { id: loads }
      },
      async () => {}
    )

    const first = await runner.get()
    const second = await runner.get()

    expect(first).toBe(second)
    expect(loads).toBe(1)
  })

  it("rebuilds on invalidate() and disposes the previous value", async () => {
    let loads = 0
    const disposed: number[] = []
    const runner = createDevRunner(
      async () => {
        loads += 1
        return { id: loads }
      },
      async (value) => {
        disposed.push(value.id)
      }
    )

    const first = await runner.get()
    runner.invalidate()
    const second = await runner.get()

    expect(first).not.toBe(second)
    expect(loads).toBe(2)
    expect(disposed).toEqual([1])
  })

  it("does not keep a rejected load cached forever, and retries on the next get()", async () => {
    let attempt = 0
    const runner = createDevRunner(
      async () => {
        attempt += 1
        if (attempt === 1) throw new Error("boom")
        return { id: attempt }
      },
      async () => {}
    )

    await expect(runner.get()).rejects.toThrow("boom")
    const value = await runner.get()

    expect(value).toEqual({ id: 2 })
    expect(attempt).toBe(2)
  })

  it("a change-triggered invalidate after a rejected load still recovers on the next request", async () => {
    let attempt = 0
    const runner = createDevRunner(
      async () => {
        attempt += 1
        if (attempt === 1) throw new Error("boom")
        return { id: attempt }
      },
      async () => {}
    )

    await runner.get().catch(() => {})
    runner.invalidate()
    const value = await runner.get()

    expect(value).toEqual({ id: 2 })
  })

  it("disposeCurrent() disposes the last resolved value and clears it", async () => {
    const disposed: number[] = []
    const runner = createDevRunner(
      async () => ({ id: 1 }),
      async (value) => {
        disposed.push(value.id)
      }
    )

    await runner.get()
    await runner.disposeCurrent()

    expect(disposed).toEqual([1])
  })
})
