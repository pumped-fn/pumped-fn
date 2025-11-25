import { derive, name, type Core } from "@pumped-fn/core-next"
import { transportExecutor } from "./transport"
import { type State, type Transport } from "./types"

export const createStateAggregator = () => {
  const snapshot: State.Snapshot = {
    executors: new Map(),
    flows: new Map(),
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
      if (msg.operation.flow && msg.operation.definition) {
        const flowId = msg.operation.key || `flow-${msg.timestamp}`
        snapshot.flows.set(flowId, {
          id: flowId,
          name: msg.operation.definition.name,
          startedAt: msg.timestamp,
          depth: 0,
          children: []
        })
        notify()
      }

      if (msg.operation.mode === "parallel" || msg.operation.mode === "parallel-settled") {
        const parallelId = `parallel-${msg.timestamp}`
        snapshot.parallelBatches.set(parallelId, {
          id: parallelId,
          mode: msg.operation.mode,
          promiseCount: msg.operation.count ?? 0,
          depth: 0,
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

export const stateAggregatorExecutor: Core.Executor<State.Aggregator> = derive([transportExecutor], ([transport]) => {
  const aggregator = createStateAggregator()
  transport.subscribe(aggregator.process)
  return aggregator
}, name("stateAggregator"))
