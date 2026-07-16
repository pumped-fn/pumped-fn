import {
  extension as agentExtension,
  workflowExtension,
  type ExtensionOptions,
  type Model,
  type ModelRequest,
  type ModelResponse,
  type RemoteRunner,
  type RunLog,
  type RunQuery,
  type WorkflowEventLog,
  type WorkflowExtensionOptions,
} from "@pumped-fn/sdk"
import * as agent from "@pumped-fn/sdk/agent"
import * as session from "@pumped-fn/sdk/session"
import {
  extension as suspenseExtension,
  formatSuspenseStepKey,
  type SuspenseEventLog,
  type SuspenseExtensionOptions,
  type SuspenseStepEntry,
  type SuspenseStepKey,
} from "@pumped-fn/lite-extension-suspense"
import { flow, tag, tags, typed, type Lite } from "@pumped-fn/lite"

type MaybePromise<T> = T | Promise<T>

export const config = {
  model: tag<(request: ModelRequest) => MaybePromise<ModelResponse>>({ label: "sdk.test.config.model" }),
  attempt: tag<AttemptStubResult | ((request: ModelRequest) => MaybePromise<AttemptStubResult>)>({
    label: "sdk.test.config.attempt",
  }),
  sessionStore: tag<Map<session.SessionId, session.SessionRecord>>({ label: "sdk.test.config.session-store" }),
}

export const modelStub: Model = flow({
  name: "model.stub",
  parse: typed<ModelRequest>(),
  deps: { respond: tags.required(config.model) },
  factory: (ctx, { respond }) => respond(ctx.input),
})

/** Supplies streamed model events and the final response returned by an attempt stub. */
export interface AttemptStubResult {
  readonly events: readonly agent.ModelEvent[]
  readonly result: ModelResponse
}

class SessionStoreStubError extends Error {
  readonly kind = "session-store-stub"

  constructor(
    readonly op: "load" | "commit",
    readonly entity: session.SessionId,
    message: string,
  ) {
    super(message)
    this.name = "SessionStoreStubError"
  }
}

export const attemptStub: agent.Attempt = flow({
  name: "attempt.stub",
  parse: typed<ModelRequest>(),
  deps: { respond: tags.required(config.attempt) },
  factory: async function* (ctx, { respond }): AsyncGenerator<agent.ModelEvent, ModelResponse, unknown> {
    const response = typeof respond === "function" ? await respond(ctx.input) : respond
    for (const event of response.events) yield event
    return response.result
  },
})

export function attemptStubConfig(
  respond: AttemptStubResult | ((request: ModelRequest) => MaybePromise<AttemptStubResult>),
): [Lite.Tagged<typeof respond>, Lite.Tagged<agent.Attempt>] {
  return [config.attempt(respond), agent.impl.attempt(attemptStub)]
}

export const sessionStoreLoad: session.Load = flow({
  name: "session.store.stub.load",
  parse: typed<{ id: session.SessionId }>(),
  deps: { values: tags.required(config.sessionStore) },
  factory: (ctx, { values }) => {
    const found = values.get(ctx.input.id)
    if (!found) {
      throw new SessionStoreStubError("load", ctx.input.id, `Session ${JSON.stringify(ctx.input.id)} not found`)
    }
    return found
  },
})

export const sessionStoreCommit: session.Commit = flow({
  name: "session.store.stub.commit",
  parse: typed<{ record: session.SessionRecord; expectedVersion: number }>(),
  deps: { values: tags.required(config.sessionStore) },
  factory: (ctx, { values }) => {
    const current = values.get(ctx.input.record.id)
    if (current?.version !== ctx.input.expectedVersion) {
      throw new SessionStoreStubError(
        "commit",
        ctx.input.record.id,
        `Session ${JSON.stringify(ctx.input.record.id)} version conflict`,
      )
    }
    const stored = Object.freeze({ ...ctx.input.record, version: ctx.input.expectedVersion + 1 })
    values.set(stored.id, stored)
    return { version: stored.version }
  },
})

export function sessionStoreStub(records: readonly session.SessionRecord[] = []) {
  const values = new Map(records.map((record) => [record.id, record]))
  return {
    records: values as ReadonlyMap<session.SessionId, session.SessionRecord>,
    config: config.sessionStore(values),
    load: sessionStoreLoad,
    commit: sessionStoreCommit,
    binding: {
      load: session.store.load(sessionStoreLoad),
      commit: session.store.commit(sessionStoreCommit),
    },
  }
}

export class MemorySuspenseLog implements SuspenseEventLog {
  private readonly store = new Map<string, SuspenseStepEntry>()

  async get(key: SuspenseStepKey): Promise<SuspenseStepEntry | undefined> {
    return this.store.get(formatSuspenseStepKey(key))
  }

  async putPending(entry: Extract<SuspenseStepEntry, { status: "pending" }>): Promise<void> {
    this.store.set(formatSuspenseStepKey(entry.key), entry)
  }

  async putCompleted(entry: Extract<SuspenseStepEntry, { status: "completed" }>): Promise<void> {
    this.store.set(formatSuspenseStepKey(entry.key), entry)
  }

  async resolve(key: SuspenseStepKey, value: unknown): Promise<void> {
    const current = this.store.get(formatSuspenseStepKey(key))
    if (!current || current.status !== "pending") throw new Error(`Pending step "${formatSuspenseStepKey(key)}" not found`)
    this.store.set(formatSuspenseStepKey(key), {
      status: "resolved",
      key,
      targetName: current.targetName,
      value,
    })
  }

  entries(query: Partial<RunQuery> = {}): SuspenseStepEntry[] {
    return [...this.store.values()].filter((entry) =>
      (query.taskId === undefined || entry.key.taskId === query.taskId) &&
      (query.runId === undefined || entry.key.runId === query.runId)
    )
  }
}

export class MemoryWorkflowLog extends MemorySuspenseLog implements WorkflowEventLog, RunLog {}

export const localRemoteRunner = {
  run: (_event, next) => next(),
} satisfies RemoteRunner

export function suspense(
  options: Omit<SuspenseExtensionOptions, "log"> & { log?: SuspenseEventLog } = {}
): { extension: Lite.Extension; log: SuspenseEventLog } {
  const log = options.log ?? new MemorySuspenseLog()
  return {
    log,
    extension: suspenseExtension({
      ...options,
      log,
    }),
  }
}

export function kit(
  options: ExtensionOptions & Omit<WorkflowExtensionOptions, "log"> & { log?: RunLog } = {}
): { extensions: Lite.Extension[]; log: RunLog } {
  const log = options.log ?? new MemoryWorkflowLog()
  return {
    log,
    extensions: [
      workflowExtension({
        log,
        defaultTaskId: options.defaultTaskId,
        defaultRunId: options.defaultRunId,
      }),
      agentExtension({
        remoteRunner: options.remoteRunner ?? localRemoteRunner,
      }),
    ],
  }
}
