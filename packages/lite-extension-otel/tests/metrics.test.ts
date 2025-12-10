import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createOtel } from "../src";
import { createScope, flow, atom } from "@pumped-fn/lite";
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  MeterProvider,
  InMemoryMetricExporter,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

describe("OTel metrics", () => {
  let spanExporter: InMemorySpanExporter;
  let tracerProvider: BasicTracerProvider;
  let metricExporter: InMemoryMetricExporter;
  let metricReader: PeriodicExportingMetricReader;
  let meterProvider: MeterProvider;

  beforeEach(() => {
    spanExporter = new InMemorySpanExporter();
    tracerProvider = new BasicTracerProvider();
    tracerProvider.addSpanProcessor(new SimpleSpanProcessor(spanExporter));

    metricExporter = new InMemoryMetricExporter();
    metricReader = new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 100,
    });
    meterProvider = new MeterProvider();
    meterProvider.addMetricReader(metricReader);
  });

  afterEach(async () => {
    spanExporter.reset();
    await tracerProvider.shutdown();
    await meterProvider.shutdown();
  });

  it("records flow execution duration histogram", async () => {
    const testFlow = flow({
      name: "testFlow",
      factory: async () => {
        await new Promise((r) => setTimeout(r, 5));
        return 42;
      },
    });

    const scope = createScope({
      extensions: [
        createOtel({
          tracer: tracerProvider.getTracer("test"),
          meter: meterProvider.getMeter("test"),
        }),
      ],
    });

    const ctx = scope.createContext();
    await ctx.exec({ flow: testFlow });
    await ctx.close();

    await meterProvider.forceFlush();
    const metrics = metricExporter.getMetrics();
    const flowMetric = metrics
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics)
      .find((m) => m.descriptor.name === "pumped.flow.execution_ms");

    expect(flowMetric).toBeDefined();
  });

  it("records atom resolution duration histogram", async () => {
    const testAtom = atom({
      factory: async function testAtom() {
        await new Promise((r) => setTimeout(r, 5));
        return { value: 1 };
      },
    });

    const scope = createScope({
      extensions: [
        createOtel({
          tracer: tracerProvider.getTracer("test"),
          meter: meterProvider.getMeter("test"),
        }),
      ],
    });

    await scope.resolve(testAtom);

    await meterProvider.forceFlush();
    const metrics = metricExporter.getMetrics();
    const atomMetric = metrics
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics)
      .find((m) => m.descriptor.name === "pumped.atom.resolution_ms");

    expect(atomMetric).toBeDefined();
  });

  it("increments error counter on failure", async () => {
    const failingFlow = flow({
      name: "failingFlow",
      factory: () => {
        throw new Error("fail");
      },
    });

    const scope = createScope({
      extensions: [
        createOtel({
          tracer: tracerProvider.getTracer("test"),
          meter: meterProvider.getMeter("test"),
        }),
      ],
    });

    const ctx = scope.createContext();
    await expect(ctx.exec({ flow: failingFlow })).rejects.toThrow();
    await ctx.close();

    await meterProvider.forceFlush();
    const metrics = metricExporter.getMetrics();
    const errorMetric = metrics
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics)
      .find((m) => m.descriptor.name === "pumped.errors");

    expect(errorMetric).toBeDefined();
  });
});
