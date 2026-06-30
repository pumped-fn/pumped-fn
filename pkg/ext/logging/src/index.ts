import { resource, tag, tags, type Lite } from "@pumped-fn/lite"

export namespace Logging {
  export type Level = "debug" | "info" | "warn" | "error"
  export type Flow = "none" | "errors" | "all"
  export type Failure = "isolate" | "throw"
  export type Fields = { readonly [key: string]: unknown }

  export interface Record {
    readonly id: string
    readonly at: number
    readonly level: Level
    readonly message: string
    readonly source?: string
    readonly fields?: Fields
  }

  export interface Sink {
    readonly name?: string
    write(record: Record): void
    flush?(): void | Promise<void>
    close?(): void | Promise<void>
  }

  export interface Runtime {
    readonly sinks?: readonly Sink[]
    readonly level?: Level
    readonly flow?: Flow
    readonly fields?: Fields
    readonly source?: string
    readonly failure?: Failure
    readonly onError?: (error: unknown, record: Record | undefined, sink: Sink) => void
    readonly now?: () => number
    readonly id?: () => string
    readonly redact?: (fields: Fields | undefined) => Fields | undefined
  }

  export interface Logger {
    write(level: Level, message: string, fields?: Fields): void
    debug(message: string, fields?: Fields): void
    info(message: string, fields?: Fields): void
    warn(message: string, fields?: Fields): void
    error(message: string, fields?: Fields): void
    child(fields: Fields): Logger
  }

  export interface Memory extends Sink {
    records(): readonly Record[]
    subscribe(listener: (record: Record) => void): () => void
    clear(): void
    size(): number
  }

  export interface Options {
    readonly name?: string
  }
}

interface ActiveRuntime {
  readonly sinks: readonly Logging.Sink[]
  readonly level: Logging.Level
  readonly flow: Logging.Flow
  readonly fields: Logging.Fields | undefined
  readonly source: string | undefined
  readonly failure: Logging.Failure
  readonly onError: ((error: unknown, record: Logging.Record | undefined, sink: Logging.Sink) => void) | undefined
  readonly now: () => number
  readonly id: () => string
  readonly redact: (fields: Logging.Fields | undefined) => Logging.Fields | undefined
}

const order: Record<Logging.Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}
const emptySinks: readonly Logging.Sink[] = []
const fallback: Logging.Runtime = {}
let next = 0

const runtime = tag<Logging.Runtime>({
  label: "logging.runtime",
  default: fallback,
})

const owners = new WeakMap<Lite.ExecutionContext, Set<Logging.Runtime>>()

const logger = resource({
  name: "logger",
  ownership: "current",
  deps: { value: tags.required(runtime) },
  factory: (ctx, { value }) => {
    const current = normalize(value)
    if (value === rootRuntime(ctx.scope)) {
      ctx.cleanup(() => flush(current))
    } else {
      registerContextClose(ctx, value, current)
    }
    return createLogger(current, current.source ?? ctx.name, undefined)
  },
})

function extension(options?: Logging.Options): Lite.Extension {
  let root = normalize(undefined)

  return {
    name: options?.name ?? "logging",
    init(scope) {
      root = normalize(rootRuntime(scope))
    },
    wrapExec: async (run, target, ctx) => {
      const value = ctx.data.seekTag(runtime)
      const current = normalize(value)
      if (current.sinks.length === 0 || current.flow === "none") return run()

      registerContextClose(ctx, value, current)

      const source = current.source ?? getExecName(target, ctx)
      if (current.flow === "all") {
        write(current, "debug", "flow.start", undefined, source)
      }

      try {
        const output = await run()
        if (current.flow === "all") {
          write(current, "debug", "flow.success", undefined, source)
        }
        return output
      } catch (error) {
        write(current, "error", "flow.error", { error: mapError(error) }, source)
        throw error
      }
    },
    async dispose() {
      await close(root)
    },
  }
}

function memory(): Logging.Memory {
  const records: Logging.Record[] = []
  const listeners = new Set<(record: Logging.Record) => void>()

  return {
    name: "memory",
    write(record) {
      records.push(record)
      for (const listener of listeners) listener(record)
    },
    records() {
      return records.slice()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    clear() {
      records.length = 0
    },
    size() {
      return records.length
    },
    close() {
      listeners.clear()
    },
  }
}

function registerContextClose(
  ctx: Lite.ExecutionContext,
  value: Logging.Runtime | undefined,
  current: ActiveRuntime
): void {
  if (current.sinks.length === 0 || value === undefined || value === rootRuntime(ctx.scope)) return

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
}

function ownerContext(ctx: Lite.ExecutionContext, value: Logging.Runtime): Lite.ExecutionContext {
  let current = ctx
  while (current.data.getTag(runtime) !== value && current.parent) {
    current = current.parent
  }
  return current
}

function rootRuntime(scope: Lite.Scope): Logging.Runtime | undefined {
  return runtime.find(scope as unknown as Lite.TagSource)
}

export const logging = {
  runtime,
  logger,
  extension,
  memory,
} as const

function createLogger(
  current: ActiveRuntime,
  source: string | undefined,
  localFields: Logging.Fields | undefined
): Logging.Logger {
  return {
    write(level, message, fields) {
      write(current, level, message, merge(localFields, fields), source)
    },
    debug(message, fields) {
      write(current, "debug", message, merge(localFields, fields), source)
    },
    info(message, fields) {
      write(current, "info", message, merge(localFields, fields), source)
    },
    warn(message, fields) {
      write(current, "warn", message, merge(localFields, fields), source)
    },
    error(message, fields) {
      write(current, "error", message, merge(localFields, fields), source)
    },
    child(fields) {
      return createLogger(current, source, merge(localFields, fields))
    },
  }
}

function write(
  current: ActiveRuntime,
  level: Logging.Level,
  message: string,
  fields: Logging.Fields | undefined,
  source: string | undefined
): void {
  if (order[level] < order[current.level]) return

  const record = withFields(current, {
    id: current.id(),
    at: current.now(),
    level,
    message,
    source,
  }, merge(current.fields, fields))

  for (const sink of current.sinks) {
    try {
      sink.write(record)
    } catch (error) {
      handleSinkError(current, error, record, sink)
    }
  }
}

function withFields(
  current: ActiveRuntime,
  record: Logging.Record,
  fields: Logging.Fields | undefined
): Logging.Record {
  const redacted = current.redact(fields)
  return redacted ? { ...record, fields: redacted } : record
}

function merge(
  base: Logging.Fields | undefined,
  fields: Logging.Fields | undefined
): Logging.Fields | undefined {
  if (!base) return fields
  if (!fields) return base
  return { ...base, ...fields }
}

async function flush(current: ActiveRuntime): Promise<void> {
  for (const sink of current.sinks) {
    if (sink.flush) {
      try {
        await sink.flush()
      } catch (error) {
        handleSinkError(current, error, undefined, sink)
      }
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
  record: Logging.Record | undefined,
  sink: Logging.Sink
): void {
  current.onError?.(error, record, sink)
  if (current.failure === "throw") throw error
}

function normalize(value: Logging.Runtime | undefined): ActiveRuntime {
  return {
    sinks: value?.sinks ?? emptySinks,
    level: value?.level ?? "info",
    flow: value?.flow ?? "none",
    fields: value?.fields,
    source: value?.source,
    failure: value?.failure ?? "isolate",
    onError: value?.onError,
    now: value?.now ?? Date.now,
    id: value?.id ?? defaultId,
    redact: value?.redact ?? identity,
  }
}

function defaultId(): string {
  next += 1
  return `log:${next}`
}

function identity(fields: Logging.Fields | undefined): Logging.Fields | undefined {
  return fields
}

function mapError(error: unknown): Logging.Fields {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { message: String(error) }
}

function getExecName(target: Lite.ExecTarget, ctx: Lite.ExecutionContext): string {
  return (ctx.name ?? target.name) || "<anonymous>"
}
