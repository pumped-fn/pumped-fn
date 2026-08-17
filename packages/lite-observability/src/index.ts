import { tag, FlowFault, type Lite } from "@pumped-fn/lite"

export namespace Observability {
  export type Phase = "start" | "success" | "error"
  export type Kind = "atom" | "resource" | "flow" | "function" | "context"
  export type Failure = "isolate" | "throw"

  export interface ErrorInfo {
    readonly name?: string
    readonly message: string
    readonly stack?: string
    readonly fault?: unknown
  }

  export interface Event {
    readonly id: string
    readonly parentId?: string
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
  readonly sinks: readonly Observability.Sink[]
  readonly only: readonly Observability.Kind[] | undefined
  readonly input: boolean
  readonly output: boolean
  readonly failure: Observability.Failure
  readonly onError: ((error: unknown, event: Observability.Event | undefined, sink: Observability.Sink) => void) | undefined
  readonly now: () => number
  readonly id: () => string
  readonly redact: (value: unknown) => unknown
  readonly mapError: (error: unknown) => Observability.ErrorInfo
  readonly filter: ((event: Observability.Event) => boolean) | undefined
}

const emptySinks: readonly Observability.Sink[] = []
const fallback: Observability.Runtime = {}
let next = 0

const runtime = tag<Observability.Runtime>({
  label: "observability.runtime",
  default: fallback,
})

function extension(options?: Observability.Options): Lite.Extension {
  const owners = new WeakMap<Lite.ExecutionContext, Set<Observability.Runtime>>()
  const rootSpans = new WeakMap<Lite.ExecutionContext, { id: string; startedAt: number; current: ActiveRuntime }>()

  return {
    name: options?.name ?? "observability",
    initContext: (ctx) => {
      if (ctx.tags.get(runtime) !== undefined) contextRuntime(owners, ctx)
      if (ctx.parent) return
      const current = normalize(ctx.tags.seek(runtime))
      if (current.sinks.length === 0 || skipped(current, "context")) return
      const id = current.id()
      const startedAt = current.now()
      rootSpans.set(ctx, { id, startedAt, current })
      ctx.data.set(spanKey, id)
      emit(current, {
        id,
        phase: "start",
        kind: "context",
        name: ctx.name ?? "context",
        at: startedAt,
      })
    },
    disposeContext: (ctx, result) => {
      const span = rootSpans.get(ctx)
      if (!span) return
      rootSpans.delete(ctx)
      const at = span.current.now()
      const base = {
        id: span.id,
        phase: "success" as Observability.Phase,
        kind: "context" as const,
        name: ctx.name ?? "context",
        at,
        startedAt: span.startedAt,
        durationMs: at - span.startedAt,
      }
      emit(span.current, result.ok
        ? base
        : { ...base, phase: "error", error: span.current.mapError(result.error) })
    },
    wrapResolve: async (run, event) => {
      const current = event.kind === "resource"
        ? contextRuntime(owners, event.ctx)
        : normalize(runtime.find(event.scope))
      return trace(current, event.kind, getResolveName(event), undefined, run, event.kind === "resource" ? event.ctx : undefined)
    },
    wrapExec: async (run, target, ctx) => {
      return trace(
        contextRuntime(owners, ctx),
        getExecKind(target),
        getExecName(target, ctx),
        ctx.input,
        run,
        ctx
      )
    },
    async dispose(scope) {
      await close(normalize(runtime.find(scope)))
    },
  }
}

function memory(): Observability.Memory {
  const events: Observability.Event[] = []
  const listeners = new Set<(event: Observability.Event) => void>()

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
  owners: WeakMap<Lite.ExecutionContext, Set<Observability.Runtime>>,
  ctx: Lite.ExecutionContext
): ActiveRuntime {
  const value = ctx.tags.seek(runtime)
  const current = normalize(value)
  if (current.sinks.length === 0 || value === undefined || value === runtime.find(ctx.scope)) return current

  const owner = ownerContext(ctx, value)

  let values = owners.get(owner)
  if (!values) {
    values = new Set()
    owners.set(owner, values)
  }
  if (!values.has(value)) {
    values.add(value)
    owner.onClose((_result, target) => close(target), current)
  }
  return current
}

function ownerContext(ctx: Lite.ExecutionContext, value: Observability.Runtime): Lite.ExecutionContext {
  let current = ctx
  while (current.tags.get(runtime) !== value && current.parent) {
    current = current.parent
  }
  return current
}

export const observability = {
  runtime,
  extension,
  memory,
} as const

const spanKey = Symbol("observability.spanId")

async function trace<T>(
  current: ActiveRuntime,
  kind: Observability.Kind,
  name: string,
  input: unknown,
  run: () => Promise<T>,
  ctx?: Lite.ExecutionContext
): Promise<T> {
  if (current.sinks.length === 0 || skipped(current, kind)) return run()

  const id = current.id()
  const parentId = ctx?.data.seek(spanKey) as string | undefined
  ctx?.data.set(spanKey, id)
  const startedAt = current.now()
  const start = withInput(current, {
    id,
    parentId,
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
      parentId,
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
      parentId,
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
  event: Observability.Event,
  input: unknown
): Observability.Event {
  return current.input && input !== undefined
    ? { ...event, input: current.redact(input) }
    : event
}

function withOutput(
  current: ActiveRuntime,
  event: Observability.Event,
  output: unknown
): Observability.Event {
  return current.output && output !== undefined
    ? { ...event, output: current.redact(output) }
    : event
}

function emit(current: ActiveRuntime, event: Observability.Event): void {
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
  event: Observability.Event | undefined,
  sink: Observability.Sink
): void {
  current.onError?.(error, event, sink)
  if (current.failure === "throw") throw error
}

function normalize(value: Observability.Runtime | undefined): ActiveRuntime {
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

function skipped(current: ActiveRuntime, kind: Observability.Kind): boolean {
  return current.only !== undefined && !current.only.includes(kind)
}

function defaultId(): string {
  next += 1
  return `observability:${next}`
}

function identity(value: unknown): unknown {
  return value
}

function mapError(error: unknown): Observability.ErrorInfo {
  if (error instanceof FlowFault) {
    return { name: error.name, message: error.message, stack: error.stack, fault: error.fault }
  }
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

function getExecKind(target: Lite.ExecTarget): Observability.Kind {
  return typeof target === "function" ? "function" : "flow"
}

function getExecName(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): string {
  return (ctx.name ?? target.name) || "<anonymous>"
}
