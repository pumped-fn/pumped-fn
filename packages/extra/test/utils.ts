import { StandardSchemaV1 } from "@pumped-fn/core";

export function cast<V>(): StandardSchemaV1<V, V> {
  return {
    "~standard": {
      vendor: "1",
      version: 1,
      validate(value) {
        return { value: value as V };
      },
    },
  };
}
