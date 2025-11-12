import { describe, it, expect } from "vitest"
import { createScope } from "@pumped-fn/core-next"
import { stateAggregatorExecutor } from "../src/aggregator"
import { transportExecutor } from "../src/transport"

describe("State Aggregator", () => {
  it("should build executor map from resolve events", async () => {
    const scope = createScope()
    const transport = await scope.resolve(transportExecutor)
    const aggregator = await scope.resolve(stateAggregatorExecutor)

    transport.emit({
      timestamp: 1000,
      duration: 50,
      operation: {
        kind: "resolve",
        executor: { toString: () => "test-executor" } as any,
        scope: {} as any,
        operation: "resolve"
      }
    })

    const snapshot = aggregator.getSnapshot()

    expect(snapshot.executors.size).toBe(1)
    expect(snapshot.executors.get("test-executor")).toMatchObject({
      id: "test-executor",
      resolvedAt: 1000
    })

    await scope.dispose()
  })

  it("should track flow executions", async () => {
    const scope = createScope()
    const transport = await scope.resolve(transportExecutor)
    const aggregator = await scope.resolve(stateAggregatorExecutor)

    transport.emit({
      timestamp: 2000,
      duration: 100,
      operation: {
        kind: "execution",
        target: {
          type: "flow",
          definition: { name: "testFlow" } as any
        }
      }
    })

    const snapshot = aggregator.getSnapshot()

    expect(snapshot.flows.size).toBe(1)
    const flowId = Array.from(snapshot.flows.keys())[0]
    expect(snapshot.flows.get(flowId)).toMatchObject({
      name: "testFlow",
      startedAt: 2000,
      depth: 0
    })

    await scope.dispose()
  })

  // NOTE: Journal operation kind removed in new Extension API
  // it("should track journal operations", async () => {
  //   ...
  // })

  // NOTE: Subflow operation kind removed in new Extension API
  // it("should track subflow executions", async () => {
  //   ...
  // })

  it("should track parallel batch operations", async () => {
    const scope = createScope()
    const transport = await scope.resolve(transportExecutor)
    const aggregator = await scope.resolve(stateAggregatorExecutor)

    transport.emit({
      timestamp: 5000,
      duration: 200,
      operation: {
        kind: "execution",
        target: {
          type: "parallel",
          mode: "parallel",
          count: 5
        }
      }
    })

    const snapshot = aggregator.getSnapshot()

    expect(snapshot.parallelBatches.size).toBe(1)
    const batch = Array.from(snapshot.parallelBatches.values())[0]
    expect(batch).toMatchObject({
      mode: "parallel",
      promiseCount: 5,
      depth: 0,
      startedAt: 5000
    })

    await scope.dispose()
  })
})
