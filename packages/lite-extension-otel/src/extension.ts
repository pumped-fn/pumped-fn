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
import { createMetrics, type OtelMetrics } from "./metrics";

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

function getAtomName(
  atom: Lite.Atom<unknown>,
  options?: OtelExtension.Options
): string {
  if (options?.spanName) {
    return options.spanName(atom);
  }
  return atom.factory.name ?? "atom";
}

export function createOtel(options: OtelExtension.Options): Lite.Extension {
  const { tracer, meter, flowFilter, atomFilter } = options;

  let metrics: OtelMetrics | undefined;
  if (meter) {
    metrics = createMetrics(meter);
  }

  return {
    name: "otel",

    wrapResolve: async (next, atom, _scope) => {
      if (atomFilter && !atomFilter(atom)) {
        return next();
      }

      const span = tracer.startSpan(getAtomName(atom, options));
      const start = performance.now();

      try {
        const result = await context.with(
          trace.setSpan(context.active(), span),
          next
        );
        span.setStatus({ code: SpanStatusCode.OK });
        metrics?.atomResolutionHistogram.record(performance.now() - start, {
          "atom.name": getAtomName(atom, options),
        });
        return result;
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        if (err instanceof Error) {
          span.recordException(err);
        }
        metrics?.errorCounter.add(1, {
          "atom.name": getAtomName(atom, options),
          "error.type": err instanceof Error ? err.constructor.name : "unknown",
        });
        throw err;
      } finally {
        span.end();
      }
    },

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

      const spanName = getTargetName(target, options);
      const span = tracer.startSpan(spanName, {}, parentContext);
      setSpanInContext(ctx.data, span);
      const start = performance.now();

      try {
        const result = await context.with(
          trace.setSpan(context.active(), span),
          next
        );
        span.setStatus({ code: SpanStatusCode.OK });
        metrics?.flowExecutionHistogram.record(performance.now() - start, {
          "flow.name": spanName,
        });
        return result;
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        if (err instanceof Error) {
          span.recordException(err);
        }
        metrics?.errorCounter.add(1, {
          "flow.name": spanName,
          "error.type": err instanceof Error ? err.constructor.name : "unknown",
        });
        throw err;
      } finally {
        span.end();
      }
    },
  };
}
