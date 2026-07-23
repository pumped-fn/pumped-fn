import { flow, tag, tags, typed } from "@pumped-fn/lite"
import type { StandardSchemaV1 } from "@standard-schema/spec"
import { sha256 } from "./internal/digest.js"

type MaybePromise<T> = T | Promise<T>

export type JsonSchema = boolean | Readonly<Record<string, unknown>>

/** Adapts Standard Schema validation, JSON Schema projection, and stable schema digests. */
export interface Engine {
  readonly id: string
  validate<const Schema extends StandardSchemaV1>(
    schema: Schema,
    input: unknown,
  ): MaybePromise<StandardSchemaV1.Result<StandardSchemaV1.InferOutput<Schema>>>
  jsonSchema(schema: StandardSchemaV1): JsonSchema
  schemaDigest(schema: StandardSchemaV1): string
}

/** Configures a Standard Schema validation engine and its JSON Schema converter. */
export interface StandardOptions<Schema extends StandardSchemaV1> {
  readonly id: string
  readonly toJsonSchema: (schema: Schema) => JsonSchema
}

export const engine = tag<Engine>({ label: "sdk.validation.engine" })

/** Couples a Standard Schema contract with the unknown value to validate. */
export interface ValidateInput {
  readonly schema: StandardSchemaV1
  readonly input: unknown
}

export const validate = flow({
  name: "sdk.validation.validate",
  parse: typed<ValidateInput>(),
  deps: { engine: tags.required(engine) },
  factory: (ctx, { engine }) => engine.validate(ctx.input.schema, ctx.input.input),
})

function canonical(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(canonical)
  if (typeof value !== "object") throw new TypeError("JSON Schema must be JSON-compatible")

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => compareUtf8(left, right))
      .map(([key, entry]) => [key, canonical(entry)]),
  )
}

function compareUtf8(left: string, right: string): number {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  const length = Math.min(leftBytes.length, rightBytes.length)
  for (let index = 0; index < length; index++) {
    const difference = leftBytes[index]! - rightBytes[index]!
    if (difference !== 0) return difference
  }
  return leftBytes.length - rightBytes.length
}

function digest(value: unknown): string {
  return `sha256:${sha256(new TextEncoder().encode(JSON.stringify(canonical(value))))}`
}

export function standard<Schema extends StandardSchemaV1>(
  options: StandardOptions<Schema>,
): Engine {
  return Object.freeze({
    id: options.id,
    validate: <const InputSchema extends StandardSchemaV1>(
      schema: InputSchema,
      input: unknown,
    ): MaybePromise<StandardSchemaV1.Result<StandardSchemaV1.InferOutput<InputSchema>>> =>
      schema["~standard"].validate(input),
    jsonSchema: (schema: StandardSchemaV1) => canonical(options.toJsonSchema(schema as Schema)) as JsonSchema,
    schemaDigest: (schema: StandardSchemaV1) => digest(options.toJsonSchema(schema as Schema)),
  })
}
