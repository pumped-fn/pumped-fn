import {
  trace,
  context,
  SpanStatusCode,
  type Tracer,
  type Span,
} from "@opentelemetry/api";
import { isFlow, type Lite } from "@pumped-fn/lite";
import type { OtelExtension } from "./types";
import { SPAN_KEY, getSpanFromContext, setSpanInContext } from "./span";

function getTargetName(
  target: Lite.Flow<unknown, unknown> | Function,
  options?: OtelExtension.Options
): string {
  if (options?.spanName) {
    return options.spanName(target as Lite.Flow<unknown, unknown>);
  }
  if (isFlow(target)) {
    return target.name ?? "flow";
  }
  if (typeof target === "function" && target.name) {
    return target.name;
  }
  return "fn";
}

export function createOtel(options: OtelExtension.Options): Lite.Extension {
  const { tracer, flowFilter } = options;

  return {
    name: "otel",

    wrapExec: async (next, target, ctx) => {
      if (flowFilter && isFlow(target) && !flowFilter(target)) {
        return next();
      }

      const parentSpan = ctx.parent?.data
        ? getSpanFromContext(ctx.parent.data)
        : undefined;

      const parentContext = parentSpan
        ? trace.setSpan(context.active(), parentSpan)
        : context.active();

      const span = tracer.startSpan(getTargetName(target, options), {}, parentContext);
      setSpanInContext(ctx.data, span);

      try {
        const result = await context.with(
          trace.setSpan(context.active(), span),
          next
        );
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        if (err instanceof Error) {
          span.recordException(err);
        }
        throw err;
      } finally {
        span.end();
      }
    },
  };
}
