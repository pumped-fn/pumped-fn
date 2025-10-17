import { derive, name } from "@pumped-fn/core-next"
import { transportExecutor } from "./transport"
import { type State } from "./types"

export const stateAggregatorExecutor = derive([transportExecutor], ([transport]) => {
  const snapshot: State.Snapshot = {
    executors: new Map(),
    flows: new Map(),
    updates: []
  }

  const listeners: State.SnapshotListener[] = []

  const notify = () => {
    listeners.forEach(l => l(snapshot))
  }

  transport.subscribe((msg) => {
    if (msg.operation.kind === "resolve") {
      const executorId = msg.operation.executor.toString()
      snapshot.executors.set(executorId, {
        id: executorId,
        dependencies: [],
        resolvedAt: msg.timestamp
      })
      notify()
    }

    if (msg.operation.kind === "execute") {
      const flowId = msg.operation.flowName || `flow-${msg.timestamp}`
      snapshot.flows.set(flowId, {
        id: flowId,
        name: msg.operation.definition.name,
        startedAt: msg.timestamp,
        depth: msg.operation.depth,
        children: []
      })
      notify()
    }
  })

  return {
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
}, name("stateAggregator"))
