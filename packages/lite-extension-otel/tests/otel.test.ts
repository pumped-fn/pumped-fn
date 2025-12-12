import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { otel, otelConfig, shutdownAllProviders } from "../src"
import { createScope, flow } from "@pumped-fn/lite"
import { InMemorySpanExporter, SimpleSpanProcessor, BasicTracerProvider } from "@opentelemetry/sdk-trace-base"
import { SpanStatusCode, trace, context } from "@opentelemetry/api"

describe("otel extension (simplified)", () => {
  let exporter: InMemorySpanExporter

  beforeEach(() => {
    exporter = new InMemorySpanExporter()
  })

  afterEach(async () => {
    await shutdownAllProviders()
    exporter.reset()
  })

  describe("initialization", () => {
    it("initializes provider from tag configuration", async () => {
      const scope = createScope({
        extensions: [otel({ exporter })],
        tags: [
          otelConfig.name("test-app"),
          otelConfig.type("console"),
        ],
      })

      await scope.ready

      expect(scope).toBeDefined()
    })
  })

  describe("tracing", () => {
    it("creates span for flow execution with correct name", async () => {
      const testFlow = flow({
        name: "myFlow",
        factory: () => 42,
      })

      const scope = createScope({
        extensions: [otel({ exporter })],
        tags: [otelConfig.type("console")],
      })
      await scope.ready

      const ctx = scope.createContext()
      await ctx.exec({ flow: testFlow })
      await ctx.close()
      await scope.flush()
      await scope.flush()

      const spans = exporter.getFinishedSpans()
      expect(spans.length).toBe(1)
      expect(spans[0]?.name).toBe("myFlow")

      await scope.dispose()
    })

    it("creates parent-child span hierarchy via AsyncLocalStorage", async () => {
      const childFlow = flow({
        name: "childFlow",
        factory: () => "child",
      })

      const parentFlow = flow({
        name: "parentFlow",
        factory: async (ctx) => {
          const result = await ctx.exec({ flow: childFlow })
          return `parent-${result}`
        },
      })

      const scope = createScope({
        extensions: [otel({ exporter })],
        tags: [otelConfig.type("console")],
      })
      await scope.ready

      const ctx = scope.createContext()
      const result = await ctx.exec({ flow: parentFlow })
      await ctx.close()
      await scope.flush()
      await scope.flush()

      expect(result).toBe("parent-child")

      const spans = exporter.getFinishedSpans()
      expect(spans.length).toBe(2)

      await scope.dispose()

      const childSpan = spans.find((s) => s.name === "childFlow")
      const parentSpan = spans.find((s) => s.name === "parentFlow")

      expect(childSpan).toBeDefined()
      expect(parentSpan).toBeDefined()
      expect(childSpan?.parentSpanId).toBe(parentSpan?.spanContext().spanId)
    })

    it("records exception on span when flow fails", async () => {
      const failingFlow = flow({
        name: "failingFlow",
        factory: () => {
          throw new Error("test error")
        },
      })

      const scope = createScope({
        extensions: [otel({ exporter })],
        tags: [otelConfig.type("console")],
      })
      await scope.ready

      const ctx = scope.createContext()
      try {
        await ctx.exec({ flow: failingFlow })
      } catch (err) {
        expect(err).toBeInstanceOf(Error)
        expect((err as Error).message).toBe("test error")
      }
      await ctx.close()
      await scope.flush()

      const spans = exporter.getFinishedSpans()
      expect(spans.length).toBe(1)
      expect(spans[0]?.status.code).toBe(SpanStatusCode.ERROR)
      expect(spans[0]?.events.some((e) => e.name === "exception")).toBe(true)

      await scope.dispose()
    })

    it("uses exec name override for span naming", async () => {
      const testFlow = flow({
        name: "flowName",
        factory: () => 42,
      })

      const scope = createScope({
        extensions: [otel({ exporter })],
        tags: [otelConfig.type("console")],
      })
      await scope.ready

      const ctx = scope.createContext()
      await ctx.exec({ flow: testFlow, name: "customName" })
      await ctx.close()
      await scope.flush()
      await scope.flush()

      const spans = exporter.getFinishedSpans()
      expect(spans.length).toBe(1)
      expect(spans[0]?.name).toBe("customName")

      await scope.dispose()
    })

    it("falls back to unknown-flow when no name", async () => {
      const testFlow = flow({
        factory: () => 42,
      })

      const scope = createScope({
        extensions: [otel({ exporter })],
        tags: [otelConfig.type("console")],
      })
      await scope.ready

      const ctx = scope.createContext()
      await ctx.exec({ flow: testFlow })
      await ctx.close()
      await scope.flush()
      await scope.flush()

      const spans = exporter.getFinishedSpans()
      expect(spans.length).toBe(1)
      expect(spans[0]?.name).toBe("unknown-flow")

      await scope.dispose()
    })
  })

  describe("result capture", () => {
    it("captures result when captureResults is true", async () => {
      const testFlow = flow({
        name: "resultFlow",
        factory: () => ({ data: "test" }),
      })

      const scope = createScope({
        extensions: [otel({ exporter })],
        tags: [
          otelConfig.type("console"),
          otelConfig.captureResults(true),
        ],
      })
      await scope.ready

      const ctx = scope.createContext()
      await ctx.exec({ flow: testFlow })
      await ctx.close()
      await scope.flush()
      await scope.flush()

      const spans = exporter.getFinishedSpans()
      expect(spans.length).toBe(1)
      const resultAttr = spans[0]?.attributes["operation.result"]
      expect(resultAttr).toBe('{"data":"test"}')

      await scope.dispose()
    })

    it("respects redaction tag per execution", async () => {
      const sensitiveFlow = flow({
        name: "sensitiveFlow",
        factory: () => ({ password: "secret" }),
      })

      const scope = createScope({
        extensions: [otel({ exporter })],
        tags: [
          otelConfig.type("console"),
          otelConfig.captureResults(true),
        ],
      })
      await scope.ready

      const ctx = scope.createContext()
      ctx.data.setTag(otelConfig.redact, true)
      await ctx.exec({ flow: sensitiveFlow })
      await ctx.close()
      await scope.flush()
      await scope.flush()

      const spans = exporter.getFinishedSpans()
      expect(spans.length).toBe(1)
      expect(spans[0]?.attributes["operation.result"]).toBeUndefined()

      await scope.dispose()
    })
  })

  describe("lifecycle", () => {
    it("shuts down provider on dispose", async () => {
      const scope = createScope({
        extensions: [otel({ exporter })],
        tags: [otelConfig.type("console")],
      })
      await scope.ready

      await scope.dispose()
    })
  })
})
