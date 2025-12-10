import type { Lite } from "@pumped-fn/lite";
import type { OtelExtension } from "./types";

export type { OtelExtension } from "./types";

export function createOtel(_options: OtelExtension.Options): Lite.Extension {
  return {
    name: "otel",
  };
}
