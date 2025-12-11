import type { Meter, Histogram, Counter } from "@opentelemetry/api";

export interface OtelMetrics {
  readonly atomResolutionHistogram: Histogram;
  readonly flowExecutionHistogram: Histogram;
  readonly errorCounter: Counter;
}

export function createMetrics(meter: Meter): OtelMetrics {
  return {
    atomResolutionHistogram: meter.createHistogram("pumped.atom.resolution_ms", {
      description: "Time to resolve atoms in milliseconds",
      unit: "ms",
    }),
    flowExecutionHistogram: meter.createHistogram("pumped.flow.execution_ms", {
      description: "Time to execute flows in milliseconds",
      unit: "ms",
    }),
    errorCounter: meter.createCounter("pumped.errors", {
      description: "Number of errors during resolution/execution",
    }),
  };
}
