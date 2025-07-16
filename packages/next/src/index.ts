import { meta } from "./meta";
import { custom } from "./ssch";
import { Meta } from "./types";

export * from "./executor";
export * from "./meta";
export * from "./scope";
export * from "./types";
export * from "./ssch";
export * from "./helpers";
export * from "./generator-utils";
export * from "./flow";

export const name: Meta.MetaFn<string> = meta("pumped-fn/name", custom<string>());