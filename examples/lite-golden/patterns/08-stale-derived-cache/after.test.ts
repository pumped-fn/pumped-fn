import { createScope } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  createCartSummaryGraph,
  createDateBucketGraph,
  createRetryingSummaryGraph,
  createThreeStepGraph,
  createVersionedSummaryGraph,
} from "./after"

describe("inside-out", () => {
  test("IO1: ctrl.set(next) on source \u2192 derived factory re-ran with new value", async () => {
    const graph = createCartSummaryGraph({ itemCount: 2, subtotalCents: 500 })
    const scope = createScope()

    expect(await scope.resolve(graph.summary)).toEqual({
      itemCount: 2,
      subtotalCents: 500,
      label: "2:500",
    })

    scope.controller(graph.source).set({ itemCount: 3, subtotalCents: 900 })
    await scope.flush()

    expect(scope.controller(graph.summary).get()).toEqual({
      itemCount: 3,
      subtotalCents: 900,
      label: "3:900",
    })
    expect(graph.stats()).toEqual({ sourceRuns: 1, summaryRuns: 2 })

    await scope.dispose()
  })

  test("IO2: set with shallow-equal plain object \u2192 NO re-run (factory run-counter) [S2 default]", async () => {
    const graph = createCartSummaryGraph({ itemCount: 2, subtotalCents: 500 })
    const scope = createScope()

    await scope.resolve(graph.summary)
    scope.controller(graph.source).set({ itemCount: 2, subtotalCents: 500 })
    await scope.flush()

    expect(graph.stats()).toEqual({ sourceRuns: 1, summaryRuns: 1 })
    expect(scope.controller(graph.summary).get()).toEqual({
      itemCount: 2,
      subtotalCents: 500,
      label: "2:500",
    })

    await scope.dispose()
  })

  test("IO3: set non-plain value (e.g. Date) \u2192 Object.is path: new instance cascades, same instance doesn't [S2]", async () => {
    const firstDate = new Date("2026-01-01T00:00:00.000Z")
    const graph = createDateBucketGraph(firstDate)
    const scope = createScope()

    await scope.resolve(graph.bucket)
    scope.controller(graph.source).set(firstDate)
    await scope.flush()
    expect(graph.stats()).toEqual({ sourceRuns: 1, bucketRuns: 1 })

    scope.controller(graph.source).set(new Date("2026-01-01T00:00:00.000Z"))
    await scope.flush()
    expect(graph.stats()).toEqual({ sourceRuns: 1, bucketRuns: 2 })
    expect(scope.controller(graph.bucket).get()).toBe("2026-01-01T00:00:00.000Z")

    await scope.dispose()
  })

  test("IO4: custom eq (version-only) \u2192 only version changes cascade", async () => {
    const graph = createVersionedSummaryGraph({ version: 1, payload: "alpha" })
    const scope = createScope()

    await scope.resolve(graph.summary)
    scope.controller(graph.source).set({ version: 1, payload: "beta" })
    await scope.flush()
    expect(graph.stats()).toEqual({ sourceRuns: 1, summaryRuns: 1 })

    scope.controller(graph.source).set({ version: 2, payload: "gamma" })
    await scope.flush()
    expect(graph.stats()).toEqual({ sourceRuns: 1, summaryRuns: 2 })
    expect(scope.controller(graph.summary).get()).toEqual({
      version: 2,
      payload: "gamma",
      label: "2:gamma",
    })

    await scope.dispose()
  })

  test("IO5: 3-chain a\u2192b\u2192c: one source set \u21d2 exactly one re-run each, single flush drains", async () => {
    const graph = createThreeStepGraph(1)
    const scope = createScope()

    expect(await scope.resolve(graph.label)).toBe("double:2")
    scope.controller(graph.source).set(5)
    await scope.flush()

    expect(scope.controller(graph.label).get()).toBe("double:10")
    expect(graph.stats()).toEqual({ sourceRuns: 1, doubleRuns: 2, labelRuns: 2 })

    await scope.dispose()
  })
})

describe("effect-managed", () => {
  test("E1: release derived \u2192 set source \u2192 derived factory NOT re-run (watch listener auto-cleaned)", async () => {
    const graph = createCartSummaryGraph({ itemCount: 1, subtotalCents: 250 })
    const scope = createScope()

    await scope.resolve(graph.summary)
    await scope.release(graph.summary)
    scope.controller(graph.source).set({ itemCount: 2, subtotalCents: 450 })
    await scope.flush()

    expect(graph.stats()).toEqual({ sourceRuns: 1, summaryRuns: 1 })

    await scope.dispose()
  })

  test("E2: re-resolve after failed resolve doesn't stack duplicate watch listeners, proven with a counting custom eq because invalidation queue dedup can hide duplicated listeners", async () => {
    let shouldFail = true
    let eqCalls = 0
    const graph = createRetryingSummaryGraph(
      { itemCount: 1, subtotalCents: 250 },
      () => shouldFail,
      (prev, next) => {
        eqCalls++
        return prev.itemCount === next.itemCount && prev.subtotalCents === next.subtotalCents
      }
    )
    const scope = createScope()

    await expect(scope.resolve(graph.summary)).rejects.toThrow("summary unavailable")
    expect(graph.stats()).toEqual({ sourceRuns: 1, summaryRuns: 1 })

    shouldFail = false
    await scope.resolve(graph.summary)
    expect(eqCalls).toBe(0)
    scope.controller(graph.source).set({ itemCount: 2, subtotalCents: 450 })
    await scope.flush()

    expect(eqCalls).toBe(1)
    expect(graph.stats()).toEqual({ sourceRuns: 1, summaryRuns: 3 })
    expect(scope.controller(graph.summary).get()).toEqual({
      itemCount: 2,
      subtotalCents: 450,
      label: "2:450",
    })

    await scope.dispose()
  })
})
