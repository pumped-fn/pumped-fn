import type { Meta } from "./types";
import { tag } from "./tag";
import { custom } from "./ssch";

export * from "./types";

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

export { createScope, type ScopeOption } from "./scope";

export { tag } from "./tag";
export type { Tag } from "./tag-types";

export { flow, flowMeta } from "./flow";
export { Promised } from "./promises";

export { extension } from "./extension";
export { resolves } from "./helpers";

export { custom } from "./ssch";
export * as standardSchema from "./ssch";

export * as multi from "./multi";
export * as errors from "./errors";

export const name: Meta.MetaFn<string> = tag(custom<string>(), {
  label: "pumped-fn/name",
}) as Meta.MetaFn<string>;
