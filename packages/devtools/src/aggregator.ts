import { derive, name } from "@pumped-fn/core-next"
import { transportExecutor } from "./transport"
import { type State, type Transport } from "./types"

export const createStateAggregator = () => {
  const snapshot: State.Snapshot = {
    executors: new Map(),
    flows: new Map(),
    journals: new Map(),
    subflows: new Map(),
    parallelBatches: new Map(),
    updates: []
  }

  const listeners: State.SnapshotListener[] = []

  const notify = () => {
    listeners.forEach(l => l(snapshot))
  }

  const process = (msg: Transport.Message) => {
    if (msg.operation.kind === "resolve") {
      const executorId = msg.operation.executor.toString()
      snapshot.executors.set(executorId, {
        id: executorId,
        dependencies: [],
        resolvedAt: msg.timestamp
      })
      notify()
    }

    if (msg.operation.kind === "execution") {
      const target = msg.operation.target

      if (target.type === "flow") {
        const flowId = `flow-${msg.timestamp}`
        snapshot.flows.set(flowId, {
          id: flowId,
          name: target.definition.name,
          startedAt: msg.timestamp,
          depth: 0,
          children: []
        })
        notify()
      }

      if (target.type === "parallel") {
        const parallelId = `parallel-${msg.timestamp}`
        snapshot.parallelBatches.set(parallelId, {
          id: parallelId,
          mode: target.mode,
          promiseCount: target.count,
          depth: 0,
          parentFlowName: undefined,
          startedAt: msg.timestamp
        })
        notify()
      }
    }
  }

  return {
    process,
    getSnapshot: () => snapshot,
    subscribe: (listener: State.SnapshotListener) => {
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index > -1) {
          listeners.splice(index, 1)
        }
      }
    }
  }
}

export const stateAggregatorExecutor = derive([transportExecutor], ([transport]) => {
  const aggregator = createStateAggregator()
  transport.subscribe(aggregator.process)
  return aggregator
}, name("stateAggregator"))
