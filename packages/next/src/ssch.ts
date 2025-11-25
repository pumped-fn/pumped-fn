import { StandardSchemaV1 } from "./types";
import { SchemaError } from "./errors";

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


type ValidationError = { success: false; issues: StandardSchemaV1.Issue[] };

export function custom<T>(
  validator?: (value: unknown) => T | ValidationError
): StandardSchemaV1<T, T> {
  return {
    "~standard": {
      vendor: "pumped-fn",
      version: 1,
      validate: (value): StandardSchemaV1.Result<T> => {
        if (!validator) {
          return { value: value as T };
        }

        const result = validator(value);

        if (typeof result === "object" && result !== null && "success" in result && result.success === false) {
          return { issues: result.issues };
        }

        return { value: result as T };
      },
    },
  };
}
