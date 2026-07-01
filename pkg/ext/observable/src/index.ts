import { tag, type Lite } from "@pumped-fn/lite"

export namespace Observable {
  export type Phase = "start" | "success" | "error"
  export type Kind = "atom" | "resource" | "flow" | "function"
  export type Failure = "isolate" | "throw"

  export interface ErrorInfo {
    readonly name?: string
    readonly message: string
    readonly stack?: string
  }

  export interface Event {
    readonly id: string
    readonly phase: Phase
    readonly kind: Kind
    readonly name: string
    readonly at: number
    readonly startedAt?: number
    readonly durationMs?: number
    readonly input?: unknown
    readonly output?: unknown
    readonly error?: ErrorInfo
  }

  export interface Sink {
    readonly name?: string
    emit(event: Event): void
    flush?(): void | Promise<void>
    close?(): void | Promise<void>
  }

  export interface Runtime {
    readonly sinks?: readonly Sink[]
    readonly only?: readonly Kind[]
    readonly input?: boolean
    readonly output?: boolean
    readonly failure?: Failure
    readonly onError?: (error: unknown, event: Event | undefined, sink: Sink) => void
    readonly now?: () => number
    readonly id?: () => string
    readonly redact?: (value: unknown) => unknown
    readonly mapError?: (error: unknown) => ErrorInfo
    readonly filter?: (event: Event) => boolean
  }

  export interface Memory extends Sink {
    events(): readonly Event[]
    subscribe(listener: (event: Event) => void): () => void
    clear(): void
    size(): number
  }

  export interface Options {
    readonly name?: string
  }
}

interface ActiveRuntime {
  readonly sinks: readonly Observable.Sink[]
  readonly only: readonly Observable.Kind[] | undefined
  readonly input: boolean
  readonly output: boolean
  readonly failure: Observable.Failure
  readonly onError: ((error: unknown, event: Observable.Event | undefined, sink: Observable.Sink) => void) | undefined
  readonly now: () => number
  readonly id: () => string
  readonly redact: (value: unknown) => unknown
  readonly mapError: (error: unknown) => Observable.ErrorInfo
  readonly filter: ((event: Observable.Event) => boolean) | undefined
}

const emptySinks: readonly Observable.Sink[] = []
const fallback: Observable.Runtime = {}
let next = 0

const runtime = tag<Observable.Runtime>({
  label: "observable.runtime",
  default: fallback,
})

function extension(options?: Observable.Options): Lite.Extension {
  const owners = new WeakMap<Lite.ExecutionContext, Set<Observable.Runtime>>()

  return {
    name: options?.name ?? "observable",
    wrapResolve: async (run, event) => {
      const current = event.kind === "resource"
        ? contextRuntime(owners, event.ctx)
        : normalize(rootRuntime(event.scope))
      return trace(current, event.kind, getResolveName(event), undefined, run)
    },
    wrapExec: async (run, target, ctx) => {
      return trace(
        contextRuntime(owners, ctx),
        getExecKind(target),
        getExecName(target, ctx),
        ctx.input,
        run
      )
    },
    async dispose(scope) {
      await close(normalize(rootRuntime(scope)))
    },
  }
}

function memory(): Observable.Memory {
  const events: Observable.Event[] = []
  const listeners = new Set<(event: Observable.Event) => void>()

  return {
    name: "memory",
    emit(event) {
      events.push(event)
      for (const listener of listeners) listener(event)
    },
    events() {
      return events.slice()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    clear() {
      events.length = 0
    },
    size() {
      return events.length
    },
    close() {
      listeners.clear()
    },
  }
}

function contextRuntime(
  owners: WeakMap<Lite.ExecutionContext, Set<Observable.Runtime>>,
  ctx: Lite.ExecutionContext
): ActiveRuntime {
  const value = ctx.data.seekTag(runtime)
  const current = normalize(value)
  if (current.sinks.length === 0 || value === undefined || value === rootRuntime(ctx.scope)) return current

  const owner = ownerContext(ctx, value)

  let values = owners.get(owner)
  if (!values) {
    values = new Set()
    owners.set(owner, values)
  }
  if (!values.has(value)) {
    values.add(value)
    owner.onClose(() => close(current))
  }
  return current
}

function ownerContext(ctx: Lite.ExecutionContext, value: Observable.Runtime): Lite.ExecutionContext {
  let current = ctx
  while (current.data.getTag(runtime) !== value && current.parent) {
    current = current.parent
  }
  return current
}

function rootRuntime(scope: Lite.Scope): Observable.Runtime | undefined {
  return runtime.find(scope as unknown as Lite.TagSource)
}

export const observable = {
  runtime,
  extension,
  memory,
} as const

async function trace<T>(
  current: ActiveRuntime,
  kind: Observable.Kind,
  name: string,
  input: unknown,
  run: () => Promise<T>
): Promise<T> {
  if (current.sinks.length === 0 || skipped(current, kind)) return run()

  const id = current.id()
  const startedAt = current.now()
  const start = withInput(current, {
    id,
    phase: "start",
    kind,
    name,
    at: startedAt,
  }, input)

  emit(current, start)

  try {
    const output = await run()
    const at = current.now()
    const success = withOutput(current, {
      id,
      phase: "success",
      kind,
      name,
      at,
      startedAt,
      durationMs: at - startedAt,
    }, output)
    emit(current, success)
    return output
  } catch (error) {
    const at = current.now()
    emit(current, {
      id,
      phase: "error",
      kind,
      name,
      at,
      startedAt,
      durationMs: at - startedAt,
      error: current.mapError(error),
    })
    throw error
  }
}

function withInput(
  current: ActiveRuntime,
  event: Observable.Event,
  input: unknown
): Observable.Event {
  return current.input && input !== undefined
    ? { ...event, input: current.redact(input) }
    : event
}

function withOutput(
  current: ActiveRuntime,
  event: Observable.Event,
  output: unknown
): Observable.Event {
  return current.output && output !== undefined
    ? { ...event, output: current.redact(output) }
    : event
}

function emit(current: ActiveRuntime, event: Observable.Event): void {
  if (current.filter && !current.filter(event)) return
  for (const sink of current.sinks) {
    try {
      sink.emit(event)
    } catch (error) {
      handleSinkError(current, error, event, sink)
    }
  }
}

async function close(current: ActiveRuntime): Promise<void> {
  for (const sink of current.sinks) {
    if (sink.flush) {
      try {
        await sink.flush()
      } catch (error) {
        handleSinkError(current, error, undefined, sink)
      }
    }
    if (sink.close) {
      try {
        await sink.close()
      } catch (error) {
        handleSinkError(current, error, undefined, sink)
      }
    }
  }
}

function handleSinkError(
  current: ActiveRuntime,
  error: unknown,
  event: Observable.Event | undefined,
  sink: Observable.Sink
): void {
  current.onError?.(error, event, sink)
  if (current.failure === "throw") throw error
}

function normalize(value: Observable.Runtime | undefined): ActiveRuntime {
  return {
    sinks: value?.sinks ?? emptySinks,
    only: value?.only,
    input: value?.input ?? false,
    output: value?.output ?? false,
    failure: value?.failure ?? "isolate",
    onError: value?.onError,
    now: value?.now ?? Date.now,
    id: value?.id ?? defaultId,
    redact: value?.redact ?? identity,
    mapError: value?.mapError ?? mapError,
    filter: value?.filter,
  }
}

function skipped(current: ActiveRuntime, kind: Observable.Kind): boolean {
  return current.only !== undefined && !current.only.includes(kind)
}

function defaultId(): string {
  next += 1
  return `observable:${next}`
}

function identity(value: unknown): unknown {
  return value
}

function mapError(error: unknown): Observable.ErrorInfo {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { message: String(error) }
}

function getResolveName(event: Lite.ResolveEvent): string {
  if (event.kind === "resource") return event.target.name ?? "<anonymous>"
  const name = event.target.factory.name
  return name && name !== "factory" ? name : "<anonymous>"
}

function getExecKind(target: Lite.ExecTarget): Observable.Kind {
  return typeof target === "function" ? "function" : "flow"
}

function getExecName(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): string {
  return (ctx.name ?? target.name) || "<anonymous>"
}
