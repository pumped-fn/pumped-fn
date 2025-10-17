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

  export type Snapshot = {
    executors: Map<string, ExecutorNode>
    flows: Map<string, FlowExecution>
    updates: Array<{ executorId: string; timestamp: number }>
  }

  export type SnapshotListener = (snapshot: Snapshot) => void

  export type Aggregator = {
    getSnapshot: () => Snapshot
    subscribe: (listener: SnapshotListener) => () => void
  }
}
