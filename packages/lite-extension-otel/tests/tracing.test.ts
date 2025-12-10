import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createOtel } from "../src";
import { createScope, flow } from "@pumped-fn/lite";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

describe("OTel tracing", () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider();
    provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
    provider.register();
  });

  afterEach(() => {
    exporter.reset();
    provider.shutdown();
  });

  it("creates span for flow execution", async () => {
    const testFlow = flow({
      name: "testFlow",
      factory: () => 42,
    });

    const scope = createScope({
      extensions: [createOtel({ tracer: provider.getTracer("test") })],
    });

    const ctx = scope.createContext();
    await ctx.exec({ flow: testFlow });
    await ctx.close();

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(1);
    expect(spans[0]?.name).toBe("testFlow");
  });
});
