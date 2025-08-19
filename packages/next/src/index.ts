import { meta } from "./meta";
import { custom } from "./ssch";
import type { Meta } from "./types";

export * from "./executor";
export * from "./flow";
export * from "./generator-utils";
export * from "./helpers";
export * from "./meta";
export * from "./scope";
export * from "./ssch";
export * from "./types";

export const name: Meta.MetaFn<string> = meta(
	"pumped-fn/name",
	custom<string>(),
);

export * as plugins from "./plugins"