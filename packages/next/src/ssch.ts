import { SchemaError, StandardSchemaV1 } from "./types";

export function validate<TSchema extends StandardSchemaV1>(
  schema: TSchema,
  data: unknown
): Awaited<StandardSchemaV1.InferOutput<TSchema>> {
  const result = schema["~standard"].validate(data);

  if ("then" in result) {
    throw new Error("validating async is not supported");
  }

  if (result.issues) {
    throw new SchemaError(result.issues);
  }
  return result.value as Awaited<StandardSchemaV1.InferOutput<TSchema>>;
}


export function custom<T>(): StandardSchemaV1<T, T> {
  return {
    "~standard": {
      vendor: "pumped-fn",
      version: 1,
      validate: (value) => {
        return { value: value as T };
      },
    },
  };
}
