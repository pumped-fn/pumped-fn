import { type Extension } from "@pumped-fn/core-next"

export namespace Transport {
  export type Message = {
    timestamp: number
    duration: number
    operation: Extension.Operation
  }

  export type Handler = (msg: Message) => void

  export type Unsubscribe = () => void

  export type Transport = {
    emit: (msg: Message) => void
    subscribe: (handler: Handler) => Unsubscribe
  }
}

export namespace State {
  export type ExecutorNode = {
    id: string
    name?: string
    dependencies: string[]
    resolvedAt?: number
    value?: unknown
  }

  export type FlowExecution = {
    id: string
    name?: string
    startedAt: number
    endedAt?: number
    depth: number
    parent?: string
    children: string[]
  }

  export type JournalEntry = {
    key: string
    flowName: string
    depth: number
    isReplay: boolean
    timestamp: number
  }

  export type SubflowExecution = {
    id: string
    name: string
    parentFlowName?: string
    depth: number
    journalKey?: string
    startedAt: number
  }

  export type ParallelBatch = {
    id: string
    mode: "parallel" | "parallelSettled"
    promiseCount: number
    depth: number
    parentFlowName?: string
    startedAt: number
  }

  export type Snapshot = {
    executors: Map<string, ExecutorNode>
    flows: Map<string, FlowExecution>
    journals: Map<string, JournalEntry>
    subflows: Map<string, SubflowExecution>
    parallelBatches: Map<string, ParallelBatch>
    updates: Array<{ executorId: string; timestamp: number }>
  }

  export type SnapshotListener = (snapshot: Snapshot) => void

  export type Aggregator = {
    getSnapshot: () => Snapshot
    subscribe: (listener: SnapshotListener) => () => void
  }
}
