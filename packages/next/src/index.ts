import type { Meta } from "./types";
import { meta } from "./meta";
import { custom } from "./ssch";

export * from "./types";
export type { Accessor } from "./types";

export {
  provide,
  derive,
  preset,
  isExecutor,
  isLazyExecutor,
  isMainExecutor,
  isPreset,
  isReactiveExecutor,
  isStaticExecutor,
} from "./executor";

export { createScope, type PodOption, type ScopeOption } from "./scope";
export { meta, getValue, findValue, findValues } from "./meta";
export { accessor } from "./accessor";

export { flow, flowMeta } from "./flow";
export { Promised } from "./promises";

export { extension } from "./extension";
export { resolves } from "./helpers";

export { custom } from "./ssch";
export * as standardSchema from "./ssch";

export * as multi from "./multi";
export * as errors from "./errors";

export const name: Meta.MetaFn<string> = meta(
  "pumped-fn/name",
  custom<string>()
);
