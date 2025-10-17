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

  it("should track journal operations", async () => {
    const scope = createScope()
    const transport = await scope.resolve(transportExecutor)
    const aggregator = await scope.resolve(stateAggregatorExecutor)

    transport.emit({
      timestamp: 3000,
      duration: 10,
      operation: {
        kind: "journal",
        key: "step-1",
        flowName: "main-flow",
        depth: 1,
        isReplay: false,
        context: {} as any,
        params: []
      }
    })

    const snapshot = aggregator.getSnapshot()

    expect(snapshot.journals.size).toBe(1)
    expect(snapshot.journals.get("main-flow:step-1")).toMatchObject({
      key: "step-1",
      flowName: "main-flow",
      depth: 1,
      isReplay: false,
      timestamp: 3000
    })

    await scope.dispose()
  })

  it("should track subflow executions", async () => {
    const scope = createScope()
    const transport = await scope.resolve(transportExecutor)
    const aggregator = await scope.resolve(stateAggregatorExecutor)

    transport.emit({
      timestamp: 4000,
      duration: 50,
      operation: {
        kind: "subflow",
        flow: {} as any,
        definition: { name: "childFlow" } as any,
        input: {},
        journalKey: "journal-1",
        parentFlowName: "parent-flow",
        depth: 2,
        context: {} as any
      }
    })

    const snapshot = aggregator.getSnapshot()

    expect(snapshot.subflows.size).toBe(1)
    const subflow = Array.from(snapshot.subflows.values())[0]
    expect(subflow).toMatchObject({
      name: "childFlow",
      parentFlowName: "parent-flow",
      depth: 2,
      journalKey: "journal-1",
      startedAt: 4000
    })

    await scope.dispose()
  })

  it("should track parallel batch operations", async () => {
    const scope = createScope()
    const transport = await scope.resolve(transportExecutor)
    const aggregator = await scope.resolve(stateAggregatorExecutor)

    transport.emit({
      timestamp: 5000,
      duration: 200,
      operation: {
        kind: "parallel",
        mode: "parallel",
        promiseCount: 5,
        depth: 1,
        parentFlowName: "parent-flow",
        context: {} as any
      }
    })

    const snapshot = aggregator.getSnapshot()

    expect(snapshot.parallelBatches.size).toBe(1)
    const batch = Array.from(snapshot.parallelBatches.values())[0]
    expect(batch).toMatchObject({
      mode: "parallel",
      promiseCount: 5,
      depth: 1,
      parentFlowName: "parent-flow",
      startedAt: 5000
    })

    await scope.dispose()
  })
})
