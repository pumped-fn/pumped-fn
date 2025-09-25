export type { Accessor } from "./types";
export { accessor } from "./accessor";
export * as errors from "./error-codes";

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

export { resolves } from "./helpers";

export { meta, getValue, findValue, findValues } from "./meta";
export * as multi from "./multi";
export { createScope, type PodOption, type ScopeOption } from "./scope";

export * as standardSchema from "./ssch";
export { custom } from "./ssch";
export { flow, FlowExecutionContext } from "./flow";
export * from "./types";

import type { Meta } from "./types";
import { meta } from "./meta";
import { custom } from "./ssch";
export const name: Meta.MetaFn<string> = meta(
  "pumped-fn/name",
  custom<string>()
);
