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
}

const otelConfigAtom = atom({
  deps: {
    name: tags.required(otelConfig.name),
    url: tags.required(otelConfig.url),
    type: tags.required(otelConfig.type),
    captureResults: tags.required(otelConfig.captureResults),
  },
  factory: (_ctx, deps) => deps,
})

const activeProviders = new Set<BasicTracerProvider>()

/**
 * Shuts down all active OpenTelemetry providers and clears the registry.
 * Call this during application shutdown to ensure all spans are flushed.
 */
export async function shutdownAllProviders(): Promise<void> {
  const shutdowns = Array.from(activeProviders).map((p) => p.shutdown())
  await Promise.all(shutdowns)
  activeProviders.clear()
}

/**
 * Safely serializes user data for span attributes.
 * JSON.stringify can throw on circular references or BigInt values from user code.
 */
const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value)
  } catch {
    return "<non-serializable>"
  }
}

/**
 * Options for the otel extension.
 */
export interface OtelOptions {
  /**
   * Custom span exporter, primarily for testing with InMemorySpanExporter.
   * For production, use otelConfig.type tag to select console/http exporter.
   */
  exporter?: SpanExporter
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
 * Creates an OpenTelemetry extension for pumped-fn that instruments function executions with distributed tracing.
 *
 * @param options - Optional configuration for custom span exporter
 * @returns A Lite.Extension that wraps executions with OpenTelemetry spans
 *
 * @example
 * ```typescript
 * const app = lite()
 *   .use(otel())
 *   .value(otelConfig.name, "my-service")
 *   .value(otelConfig.type, "http")
 * ```
 */
export function otel(options?: OtelOptions): Lite.Extension {
  const contextStorage = new AsyncLocalStorage<Context>()
  let tracer: Tracer
  let provider: BasicTracerProvider
  let captureResults = false

  return {
    name: "otel-extension",

    async init(scope) {
      const config = await scope.resolve(otelConfigAtom)
      captureResults = config.captureResults

      const exporter = createExporter(config.type, config.url, options?.exporter)

      provider = new BasicTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
        resource: Resource.default().merge(new Resource({
          [ATTR_SERVICE_NAME]: config.name,
        }))
      })
      activeProviders.add(provider)

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
      activeProviders.delete(provider)
    }
  }
}
