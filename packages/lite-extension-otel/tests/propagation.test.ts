import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createOtel, extractContext, injectContext, getCurrentSpan } from "../src";
import { createScope, flow } from "@pumped-fn/lite";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { propagation, trace, context } from "@opentelemetry/api";

describe("Context propagation", () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  });

  afterEach(() => {
    exporter.reset();
    provider.shutdown();
  });

  it("extractContext parses W3C traceparent header", () => {
    const headers = {
      traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
    };

    const ctx = extractContext(headers);
    const spanContext = trace.getSpanContext(ctx);

    expect(spanContext?.traceId).toBe("0af7651916cd43dd8448eb211c80319c");
    expect(spanContext?.spanId).toBe("b7ad6b7169203331");
  });

  it("injectContext writes W3C headers", async () => {
    const testFlow = flow({
      name: "testFlow",
      factory: (ctx) => {
        const headers: Record<string, string> = {};
        injectContext(ctx, headers);
        return headers;
      },
    });

    const scope = createScope({
      extensions: [createOtel({ tracer: provider.getTracer("test") })],
    });

    const ctx = scope.createContext();
    const headers = await ctx.exec({ flow: testFlow });
    await ctx.close();

    expect(headers.traceparent).toBeDefined();
    expect(headers.traceparent).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-0[01]$/);
  });

  it("getCurrentSpan returns span from ExecutionContext", async () => {
    let capturedSpan: unknown;

    const testFlow = flow({
      name: "testFlow",
      factory: (ctx) => {
        capturedSpan = getCurrentSpan(ctx);
        return "done";
      },
    });

    const scope = createScope({
      extensions: [createOtel({ tracer: provider.getTracer("test") })],
    });

    const ctx = scope.createContext();
    await ctx.exec({ flow: testFlow });
    await ctx.close();

    expect(capturedSpan).toBeDefined();
  });
});
