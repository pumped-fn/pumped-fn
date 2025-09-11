import { meta } from "./meta";
import { custom } from "./ssch";
import type { Meta } from "./types";

export {
  derive,
  provide,
  preset,
  isExecutor,
  isLazyExecutor,
  isMainExecutor,
  isPreset,
  isReactiveExecutor,
  isStaticExecutor,
} from "./executor";
export * as multi from "./multi";
export * as flow from "./flow";
export { FlowError } from "./flow";
export { data as dataAccessor } from "./data-accessor";
export type { DataAccessor, DataStore } from "./data-accessor";
export * from "./generator-utils";
export * from "./helpers";
export * from "./meta";
export * from "./scope";
export * from "./ssch";
export * from "./types";
export * from "./error-codes";

export const name: Meta.MetaFn<string> = meta(
  "pumped-fn/name",
  custom<string>()
);

export * as plugins from "./plugins";
