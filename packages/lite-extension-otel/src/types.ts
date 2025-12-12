import type { Tracer, Meter } from "@opentelemetry/api";
import type { Lite } from "@pumped-fn/lite";

export namespace OtelExtension {
  export interface Options {
    /** Tracer for span creation (required) */
    readonly tracer: Tracer;
    /** Meter for metrics (optional) */
    readonly meter?: Meter;
    /** Filter atoms to trace (default: all) */
    readonly atomFilter?: (atom: Lite.Atom<unknown>) => boolean;
    /** Filter flows to trace (default: all) */
    readonly flowFilter?: (flow: Lite.Flow<unknown, unknown>) => boolean;
    /** Custom span name formatter (overrides ctx.name resolution) */
    readonly spanName?: (target: Lite.Atom<unknown> | Lite.Flow<unknown, unknown> | Function) => string;
    /** Fallback name when ctx.name is undefined (default: "flow") */
    readonly defaultFlowName?: string;
  }
}
