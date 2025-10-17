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

    if (msg.operation.kind === "journal") {
      const journalId = `${msg.operation.flowName}:${msg.operation.key}`
      snapshot.journals.set(journalId, {
        key: msg.operation.key,
        flowName: msg.operation.flowName,
        depth: msg.operation.depth,
        isReplay: msg.operation.isReplay,
        timestamp: msg.timestamp
      })
      notify()
    }

    if (msg.operation.kind === "subflow") {
      const subflowId = `subflow-${msg.timestamp}`
      snapshot.subflows.set(subflowId, {
        id: subflowId,
        name: msg.operation.definition.name,
        parentFlowName: msg.operation.parentFlowName,
        depth: msg.operation.depth,
        journalKey: msg.operation.journalKey,
        startedAt: msg.timestamp
      })
      notify()
    }

    if (msg.operation.kind === "parallel") {
      const parallelId = `parallel-${msg.timestamp}`
      snapshot.parallelBatches.set(parallelId, {
        id: parallelId,
        mode: msg.operation.mode,
        promiseCount: msg.operation.promiseCount,
        depth: msg.operation.depth,
        parentFlowName: msg.operation.parentFlowName,
        startedAt: msg.timestamp
      })
      notify()
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
