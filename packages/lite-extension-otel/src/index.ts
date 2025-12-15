import type { Lite } from "@pumped-fn/lite"
import { tag, atom, tags } from "@pumped-fn/lite"
import { trace, SpanStatusCode, type Tracer, type Context, ROOT_CONTEXT } from "@opentelemetry/api"
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions"
import { Resource } from "@opentelemetry/resources"
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { AsyncLocalStorage } from "node:async_hooks"

export const otelConfig = {
  name: tag<string>({ label: "otel.name", default: "default-app" }),
  url: tag<string>({ label: "otel.url", default: "http://localhost:4318/v1/traces" }),
  type: tag<"http" | "grpc" | "console">({ label: "otel.type", default: "console" }),
  captureResults: tag<boolean>({ label: "otel.captureResults", default: true }),
  redact: tag<boolean>({ label: "otel.redact", default: false }),
  exporter: tag<SpanExporter | undefined>({ label: "otel.exporter" }),
}

const otelConfigAtom = atom({
  deps: {
    name: tags.required(otelConfig.name),
    url: tags.required(otelConfig.url),
    type: tags.required(otelConfig.type),
    captureResults: tags.required(otelConfig.captureResults),
    exporter: tags.optional(otelConfig.exporter),
  },
  factory: (_ctx, deps) => deps,
})

const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value)
  } catch {
    return "<non-serializable>"
  }
}

function createExporter(
  type: "http" | "grpc" | "console",
  url: string,
  override?: SpanExporter
): SpanExporter {
  if (override) return override
  if (type === "console") return new ConsoleSpanExporter()
  return new OTLPTraceExporter({ url })
}

/**
 * Creates an OpenTelemetry extension for pumped-fn that instruments flow executions with distributed tracing.
 *
 * @example
 * ```typescript
 * const scope = createScope({
 *   extensions: [otel()],
 *   tags: [otelConfig.name("my-service"), otelConfig.type("http")],
 * })
 * ```
 */
export function otel(): Lite.Extension {
  const contextStorage = new AsyncLocalStorage<Context>()
  let tracer: Tracer
  let provider: BasicTracerProvider
  let captureResults = false

  return {
    name: "otel-extension",

    async init(scope) {
      const config = await scope.resolve(otelConfigAtom)
      captureResults = config.captureResults

      const exporter = createExporter(config.type, config.url, config.exporter)

      provider = new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
        resource: Resource.default().merge(new Resource({
          [ATTR_SERVICE_NAME]: config.name,
        }))
      })

      tracer = provider.getTracer(config.name)
    },

    wrapExec(
      next: () => Promise<unknown>,
      _target: Lite.Flow<unknown, unknown> | ((ctx: Lite.ExecutionContext, ...args: unknown[]) => unknown),
      ctx: Lite.ExecutionContext
    ): Promise<unknown> {
      const spanName = ctx.name ?? "unknown-flow"
      const shouldRedact = ctx.data.seekTag(otelConfig.redact) ?? false
      const parentOtelContext = contextStorage.getStore() || ROOT_CONTEXT
      const currentSpan = tracer.startSpan(spanName, undefined, parentOtelContext)

      const newOtelContext = trace.setSpan(parentOtelContext, currentSpan)

      return contextStorage.run(newOtelContext, () => next())
        .then((result) => {
          currentSpan.setStatus({ code: SpanStatusCode.OK })
          if (!shouldRedact && captureResults) {
            currentSpan.setAttribute("operation.result", safeStringify(result))
          }
          return result
        })
        .catch((err) => {
          currentSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })
          currentSpan.recordException(err instanceof Error ? err : new Error(String(err)))
          throw err
        })
        .finally(() => {
          currentSpan.end()
        })
    },

    async dispose() {
      await provider.shutdown()
    }
  }
}
