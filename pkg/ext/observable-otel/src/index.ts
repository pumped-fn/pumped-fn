import { SpanStatusCode, context, trace, type Attributes, type Context, type Span as OtelSpan, type TimeInput } from "@opentelemetry/api"
import type { Observable } from "@pumped-fn/lite-extension-observable"

export namespace Otel {
  export interface Exception {
    readonly name?: string
    readonly message: string
    readonly stack?: string
  }

  export interface Span {
    setAttributes(attributes: Attributes): this
    setStatus(status: { readonly code: SpanStatusCode; readonly message?: string }): this
    recordException(error: Exception, time?: TimeInput): void
    end(endTime?: TimeInput): void
  }

  export interface Tracer {
    startSpan(
      name: string,
      options?: { readonly attributes?: Attributes; readonly startTime?: TimeInput },
      context?: Context
    ): Span
  }

  export interface Options {
    readonly name?: string
    readonly tracer?: Tracer
    readonly spanName?: (event: Observable.Event) => string
    readonly attributes?: (event: Observable.Event) => Attributes
  }

  export interface Sink extends Observable.Sink {
    pending(): number
  }
}

function sink(options: Otel.Options = {}): Otel.Sink {
  const spans = new Map<string, Otel.Span>()
  const tracer = options.tracer ?? trace.getTracer("pumped-fn-lite")
  const name = options.name ?? "otel"

  return {
    name,
    emit(event) {
      if (event.phase === "start") {
        start(spans, tracer, options, event)
        return
      }
      finish(spans, tracer, options, event)
    },
    close() {
      for (const span of spans.values()) span.end()
      spans.clear()
    },
    pending() {
      return spans.size
    },
  }
}

export const otel = {
  sink,
} as const

function start(
  spans: Map<string, Otel.Span>,
  tracer: Otel.Tracer,
  options: Otel.Options,
  event: Observable.Event
): void {
  const current = spans.get(event.id)
  if (current) current.end(event.at)
  const parent = event.parentId ? spans.get(event.parentId) : undefined
  const parentContext = parent
    ? trace.setSpan(context.active(), parent as unknown as OtelSpan)
    : undefined
  spans.set(event.id, tracer.startSpan(spanName(options, event), {
    attributes: spanAttributes(options, event),
    startTime: event.at,
  }, parentContext))
}

function finish(
  spans: Map<string, Otel.Span>,
  tracer: Otel.Tracer,
  options: Otel.Options,
  event: Observable.Event
): void {
  const current = spans.get(event.id)
  const attributes = spanAttributes(options, event)
  const span = current ?? tracer.startSpan(spanName(options, event), {
    attributes,
    startTime: event.startedAt ?? event.at,
  })
  if (current) span.setAttributes(attributes)
  if (event.error) {
    span.recordException(event.error, event.at)
    span.setStatus({ code: SpanStatusCode.ERROR, message: event.error.message })
  } else {
    span.setStatus({ code: SpanStatusCode.OK })
  }
  span.end(event.at)
  spans.delete(event.id)
}

function spanName(options: Otel.Options, event: Observable.Event): string {
  return options.spanName ? options.spanName(event) : event.name
}

function spanAttributes(options: Otel.Options, event: Observable.Event): Attributes {
  return { ...baseAttributes(event), ...options.attributes?.(event) }
}

function baseAttributes(event: Observable.Event): Attributes {
  const attributes: Attributes = {
    "pumped.id": event.id,
    "pumped.kind": event.kind,
    "pumped.phase": event.phase,
    "pumped.name": event.name,
    "pumped.at": event.at,
  }
  if (event.startedAt !== undefined) attributes["pumped.started_at"] = event.startedAt
  if (event.durationMs !== undefined) attributes["pumped.duration_ms"] = event.durationMs
  if ("input" in event) assignSerialized(attributes, "pumped.input", event.input)
  if ("output" in event) assignSerialized(attributes, "pumped.output", event.output)
  if (event.error) {
    attributes["pumped.error.message"] = event.error.message
    if (event.error.name) attributes["pumped.error.name"] = event.error.name
    if (event.error.stack) attributes["pumped.error.stack"] = event.error.stack
  }
  return attributes
}

function assignSerialized(attributes: Attributes, key: string, value: unknown): void {
  const serialized = serialize(value)
  if (serialized !== undefined) attributes[key] = serialized
}

function serialize(value: unknown): string | number | boolean | undefined {
  if (value === undefined) return undefined
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? value
    : JSON.stringify(value)
}
