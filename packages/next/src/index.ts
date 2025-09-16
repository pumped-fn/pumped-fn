import { meta } from "./meta";
import { custom } from "./ssch";
import type { Meta } from "./types";

export type {
  Accessor,
  AccessorSource,
  AccessorWithDefault,
  DataStore,
} from "./accessor";
export { accessor } from "./accessor";
export * from "./error-codes";
export {
  derive,
  isExecutor,
  isLazyExecutor,
  isMainExecutor,
  isPreset,
  isReactiveExecutor,
  isStaticExecutor,
  preset,
  provide,
} from "./executor";
export * from "./generator-utils";
export * from "./helpers";
export * from "./meta";
export * as multi from "./multi";
export * from "./scope";
export * from "./ssch";
export * from "./types";
export * from "./flow";

export const name: Meta.MetaFn<string> = meta(
  "pumped-fn/name",
  custom<string>()
);

export * as plugins from "./plugins";
