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
        kind: "execute",
        flow: {} as any,
        definition: { name: "testFlow" } as any,
        input: {},
        depth: 0,
        isParallel: false,
        flowName: "flow-1",
        parentFlowName: undefined
      }
    })

    const snapshot = aggregator.getSnapshot()

    expect(snapshot.flows.size).toBe(1)
    expect(snapshot.flows.get("flow-1")).toMatchObject({
      id: "flow-1",
      name: "testFlow",
      startedAt: 2000,
      depth: 0
    })

    await scope.dispose()
  })
})
