import { propagation, context, trace, type Context, type Span } from "@opentelemetry/api";
import type { Lite } from "@pumped-fn/lite";
import { SPAN_KEY } from "./span";

/**
 * Extract trace context from incoming headers.
 * Use with incoming HTTP requests to continue distributed traces.
 *
 * @example
 * ```typescript
 * const incomingCtx = extractContext(request.headers)
 * // Use with trace.setSpan() to parent new spans
 * ```
 */
export function extractContext(headers: Record<string, string>): Context {
  return propagation.extract(context.active(), headers);
}

/**
 * Inject trace context into outgoing headers.
 * Use with outgoing HTTP requests to propagate traces.
 *
 * @example
 * ```typescript
 * const headers: Record<string, string> = {}
 * injectContext(ctx, headers)
 * await fetch(url, { headers })
 * ```
 */
export function injectContext(
  ctx: Lite.ExecutionContext,
  headers: Record<string, string>
): void {
  const span = ctx.data.get(SPAN_KEY) as Span | undefined;
  if (span) {
    propagation.inject(trace.setSpan(context.active(), span), headers);
  }
}

/**
 * Get the current span from an ExecutionContext.
 * Useful for adding attributes or events to the active span.
 *
 * @example
 * ```typescript
 * const span = getCurrentSpan(ctx)
 * span?.setAttribute('user.id', userId)
 * ```
 */
export function getCurrentSpan(ctx: Lite.ExecutionContext): Span | undefined {
  return ctx.data.get(SPAN_KEY) as Span | undefined;
}
