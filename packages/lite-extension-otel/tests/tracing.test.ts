import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createOtel } from "../src";
import { createScope, flow, atom } from "@pumped-fn/lite";
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

  afterEach(async () => {
    exporter.reset();
    await provider.shutdown();
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

  it("creates parent-child span hierarchy for nested flows", async () => {
    const childFlow = flow({
      name: "childFlow",
      factory: () => "child",
    });

    const parentFlow = flow({
      name: "parentFlow",
      factory: async (ctx) => {
        const result = await ctx.exec({ flow: childFlow });
        return `parent-${result}`;
      },
    });

    const scope = createScope({
      extensions: [createOtel({ tracer: provider.getTracer("test") })],
    });

    const ctx = scope.createContext();
    const result = await ctx.exec({ flow: parentFlow });
    await ctx.close();

    expect(result).toBe("parent-child");

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(2);

    const childSpan = spans.find((s) => s.name === "childFlow");
    const parentSpan = spans.find((s) => s.name === "parentFlow");

    expect(childSpan).toBeDefined();
    expect(parentSpan).toBeDefined();
    expect(childSpan?.parentSpanId).toBe(parentSpan?.spanContext().spanId);
  });

  it("concurrent siblings have isolated spans", async () => {
    const slowFlow = flow({
      name: "slowFlow",
      factory: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return "slow";
      },
    });

    const fastFlow = flow({
      name: "fastFlow",
      factory: () => "fast",
    });

    const scope = createScope({
      extensions: [createOtel({ tracer: provider.getTracer("test") })],
    });

    const ctx = scope.createContext();
    const [slow, fast] = await Promise.all([
      ctx.exec({ flow: slowFlow }),
      ctx.exec({ flow: fastFlow }),
    ]);
    await ctx.close();

    expect(slow).toBe("slow");
    expect(fast).toBe("fast");

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(2);

    const slowSpan = spans.find((s) => s.name === "slowFlow");
    const fastSpan = spans.find((s) => s.name === "fastFlow");

    // Both have no parent (root context has no span)
    expect(slowSpan?.parentSpanId).toBeUndefined();
    expect(fastSpan?.parentSpanId).toBeUndefined();
  });

  it("creates span for atom resolution", async () => {
    const testAtom = atom({
      factory: async function configAtom() {
        return { key: "value" };
      },
    });

    const scope = createScope({
      extensions: [createOtel({ tracer: provider.getTracer("test") })],
    });

    await scope.resolve(testAtom);

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(1);
    expect(spans[0]?.name).toBe("configAtom");
  });

  it("atomFilter skips filtered atoms", async () => {
    const tracedAtom = atom({
      factory: async function tracedAtom() {
        return "traced";
      },
    });

    const skippedAtom = atom({
      factory: async function skippedAtom() {
        return "skipped";
      },
    });

    const scope = createScope({
      extensions: [
        createOtel({
          tracer: provider.getTracer("test"),
          atomFilter: (atom) => !atom.factory.name.startsWith("skippedAtom"),
        }),
      ],
    });

    await scope.resolve(tracedAtom);
    await scope.resolve(skippedAtom);

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(1);
    expect(spans[0]?.name).toContain("tracedAtom");
  });

  it("flowFilter skips filtered flows", async () => {
    const tracedFlow = flow({
      name: "tracedFlow",
      factory: () => "traced",
    });

    const skippedFlow = flow({
      name: "skippedFlow",
      factory: () => "skipped",
    });

    const scope = createScope({
      extensions: [
        createOtel({
          tracer: provider.getTracer("test"),
          flowFilter: (flow) => flow.name !== "skippedFlow",
        }),
      ],
    });

    const ctx = scope.createContext();
    await ctx.exec({ flow: tracedFlow });
    await ctx.exec({ flow: skippedFlow });
    await ctx.close();

    const spans = exporter.getFinishedSpans();
    expect(spans.length).toBe(1);
    expect(spans[0]?.name).toBe("tracedFlow");
  });
});
