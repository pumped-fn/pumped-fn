import { toJsonSchema } from "@valibot/to-json-schema"
import type { StandardSchemaV1 } from "@standard-schema/spec"
import * as v from "valibot"
import { describe, expect, it } from "vitest"
import * as z from "zod"
import { standard } from "../src/validation.js"
import { sha256 } from "../src/internal/digest.js"

describe("validation engine", () => {
  it("matches the SHA-256 known vector", () => {
    expect(sha256(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })
  it("canonicalizes insertion order with UTF-8 key ordering", () => {
    const left = schema()
    const right = schema()
    const schemas = new Map<StandardSchemaV1, Record<string, unknown>>([
      [left, { "é": { beta: true, alpha: false }, z: "last" }],
      [right, { z: "last", "é": { alpha: false, beta: true } }],
    ])
    const validation = standard<StandardSchemaV1>({
      id: "test",
      toJsonSchema: (value) => schemas.get(value)!,
    })

    expect(validation.jsonSchema(left)).toEqual(validation.jsonSchema(right))
    expect(validation.schemaDigest(left)).toBe(validation.schemaDigest(right))
    expect(Object.keys(validation.jsonSchema(left))).toEqual(["z", "é"])
  })

  it("infers and validates Zod output", async () => {
    const validation = standard<z.ZodType>({
      id: "zod@4",
      toJsonSchema: (schema) => z.toJSONSchema(schema),
    })
    const schema = z.object({ id: z.string(), count: z.coerce.number() })
    const result = await validation.validate(schema, { id: "item-1", count: "2" })

    expect("issues" in result).toBe(false)
    if ("issues" in result) throw new Error("Expected Zod validation to succeed")
    expect(result.value).toEqual({ id: "item-1", count: 2 })
    expect(validation.schemaDigest(schema)).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(validation.jsonSchema(schema)).toMatchObject({ type: "object" })
  })

  it("infers and validates Valibot output", async () => {
    const validation = standard<v.GenericSchema>({
      id: "valibot@1",
      toJsonSchema,
    })
    const schema = v.object({ id: v.string(), active: v.boolean() })
    const result = await validation.validate(schema, { id: "item-1", active: true })

    expect("issues" in result).toBe(false)
    if ("issues" in result) throw new Error("Expected Valibot validation to succeed")
    expect(result.value).toEqual({ id: "item-1", active: true })
    expect(validation.schemaDigest(schema)).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(validation.jsonSchema(schema)).toMatchObject({ type: "object" })
  })

  it("returns library-native issues", async () => {
    const validation = standard<z.ZodType>({
      id: "zod@4",
      toJsonSchema: (schema) => z.toJSONSchema(schema),
    })
    const result = await validation.validate(z.object({ id: z.string() }), { id: 1 })

    expect("issues" in result).toBe(true)
  })
})

function schema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => ({ value }),
    },
  }
}
