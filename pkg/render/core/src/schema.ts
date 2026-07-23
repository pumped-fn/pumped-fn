const valueKinds = ["string", "number", "boolean", "nullableString", "array", "object"] as const

/** The closed vocabulary of value kinds a leaf, array, or object schema node classifies to. */
type ValueKind = (typeof valueKinds)[number]

/** Maps a concrete TypeScript value type to its {@link ValueKind}. */
type KindFor<T> =
  [T] extends [readonly unknown[]] ? "array" :
    [null] extends [T] ? "nullableString" :
      [T] extends [string] ? "string" :
        [T] extends [number] ? "number" :
          [T] extends [boolean] ? "boolean" :
            never

/** Per-field {@link KindFor} of an object shape. */
type FieldsKindOf<T> = {
  [K in keyof T]: KindFor<T[K]>
}

type KindOfSchema<S extends BaseSchema> =
  S extends LeafSchema<infer T> ? KindFor<T> :
    S extends { node: "array" } ? "array" :
      S extends { node: "object" } ? "object" :
        never

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T
type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never

/** Defines the node discriminator and carried value type shared by every schema node. */
interface BaseSchema {
  readonly node: "leaf" | "array" | "object"
  readonly _type: (value: never) => unknown
}
/** Describes a scalar schema node and its runtime value kind. */
interface LeafSchema<T> extends BaseSchema {
  readonly node: "leaf"
  readonly kind: ValueKind
  readonly _type: (value: T) => T
}
/** Describes an array schema whose values follow one item schema. */
interface ArraySchema<I extends BaseSchema> extends BaseSchema {
  readonly node: "array"
  readonly item: I
  readonly _type: (value: Infer<I>[]) => Infer<I>[]
}
/** Describes an object schema whose fields each carry a schema node. */
interface ObjectSchema<F extends Record<string, BaseSchema>> extends BaseSchema {
  readonly node: "object"
  readonly fields: F
  readonly _type: (value: { [K in keyof F]: Infer<F[K]> }) => { [K in keyof F]: Infer<F[K]> }
}

/** Extracts the TypeScript value type a schema node declares. */
type Infer<S extends BaseSchema> = S extends { readonly _type: (value: infer T) => unknown } ? T : never

const leaf = <T>(kind: KindFor<T>): LeafSchema<T> => ({ node: "leaf", kind, _type: (value) => value })

/** The single schema vocabulary. Each call declares a field once and produces the type, the path set, and the runtime tokens. */
const k = {
  string: leaf<string>("string"),
  number: leaf<number>("number"),
  boolean: leaf<boolean>("boolean"),
  nullableString: leaf<string | null>("nullableString"),
  array: <I extends BaseSchema>(item: I): ArraySchema<I> => ({ node: "array", item, _type: (value) => value }),
  object: <const F extends Record<string, BaseSchema>>(
    fields: F & { readonly [K in keyof F]: K extends `${string}/${string}` ? never : unknown }
  ): ObjectSchema<F> => ({ node: "object", fields, _type: (value) => value }),
}

const nonDisplayableKinds = ["array", "object"] as const satisfies readonly ValueKind[]
/** Kinds that can be interpolated into a text template. Single source: {@link nonDisplayableKinds}. */
type DisplayKind = Exclude<ValueKind, (typeof nonDisplayableKinds)[number]>
const nonDisplayableKindSet: ReadonlySet<ValueKind> = new Set(nonDisplayableKinds)
const displayableKinds: ReadonlySet<ValueKind> = new Set(valueKinds.filter((kind) => !nonDisplayableKindSet.has(kind)))

type JsonValue = string | number | boolean | null

type CondGuard<T extends JsonValue> = { matches: (value: JsonValue) => value is T }
const condLiterals = {
  string: { matches: (value: JsonValue): value is string => typeof value === "string" },
  number: { matches: (value: JsonValue): value is number => typeof value === "number" },
  boolean: { matches: (value: JsonValue): value is boolean => typeof value === "boolean" },
  nullableString: { matches: (value: JsonValue): value is string | null => value === null || typeof value === "string" },
}
/** The literal type a `visible.eq` comparison accepts for a given kind. Single source: {@link condLiterals}. */
type CondLiteral<K extends ValueKind> =
  K extends keyof typeof condLiterals
    ? (typeof condLiterals)[K] extends CondGuard<infer T> ? T : never
    : never

function literalMatches(value: JsonValue, kind: ValueKind): boolean {
  const guard = condLiterals[kind as keyof typeof condLiterals]
  return guard !== undefined && guard.matches(value)
}

export { valueKinds, leaf, k, displayableKinds, literalMatches }
export type {
  ValueKind,
  KindFor,
  FieldsKindOf,
  KindOfSchema,
  Infer,
  BaseSchema,
  LeafSchema,
  ArraySchema,
  ObjectSchema,
  DisplayKind,
  CondLiteral,
  JsonValue,
  Equal,
  Assert,
  UnionToIntersection,
}
