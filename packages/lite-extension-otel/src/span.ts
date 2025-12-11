import type { Span } from "@opentelemetry/api";
import type { Lite } from "@pumped-fn/lite";

export const SPAN_KEY = Symbol("otel.span");

export function getSpanFromContext(data: Lite.ContextData): Span | undefined {
  return data.get(SPAN_KEY) as Span | undefined;
}

export function setSpanInContext(data: Lite.ContextData, span: Span): void {
  data.set(SPAN_KEY, span);
}
