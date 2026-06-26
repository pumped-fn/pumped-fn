import type {
  ArraySchema,
  BaseSchema,
  Equal,
  Infer,
  KindFor,
  LeafSchema,
  ObjectSchema,
  UnionToIntersection,
  ValueKind,
} from "./schema"
import type { ItemContext, StateToken } from "./spec"

function objectFields(schema: BaseSchema): Record<string, BaseSchema> {
  return (schema as ObjectSchema<Record<string, BaseSchema>>).fields
}

/** Runtime kind classification of a schema node, mirroring the type-level `KindOfSchema`. */
function kindOf(schema: BaseSchema): ValueKind {
  if (schema.node === "leaf") return (schema as LeafSchema<unknown>).kind
  if (schema.node === "object") return "object"
  return "array"
}

function fieldsKindOf(schema: BaseSchema): Record<string, ValueKind> {
  return Object.fromEntries(Object.entries(objectFields(schema)).map(([field, child]) => [field, kindOf(child)]))
}

function itemContextOf(item: BaseSchema): ItemContext {
  return item.node === "object" ? { fields: fieldsKindOf(item) } : { fields: {} }
}

function collectTokens(schema: BaseSchema, prefix: string, tokens: Record<string, StateToken>): void {
  if (schema.node === "object") {
    for (const [field, child] of Object.entries(objectFields(schema))) {
      collectTokens(child, `${prefix}/${field}`, tokens)
    }
    return
  }
  if (schema.node === "array") {
    tokens[prefix] = { path: prefix, kind: "array", item: itemContextOf((schema as ArraySchema<BaseSchema>).item) }
    return
  }
  tokens[prefix] = { path: prefix, kind: (schema as LeafSchema<unknown>).kind }
}

/** Independent type-level structural recursion mirroring {@link collectTokens}: recurse objects, emit one key per array and per leaf. */
type CollectTokens<S extends BaseSchema, P extends string> =
  S extends ObjectSchema<infer F>
    ? UnionToIntersection<{ [K in keyof F & string]: CollectTokens<F[K], `${P}/${K}`> }[keyof F & string]>
    : { [Q in P]: StateToken }

function buildStateTokens<S extends BaseSchema>(schema: S): CollectTokens<S, ""> {
  const tokens: Record<string, StateToken> = {}
  collectTokens(schema, "", tokens)
  return tokens as unknown as CollectTokens<S, "">
}

type PathEntry<S extends BaseSchema, P extends string> =
  S extends LeafSchema<infer T> ? { key: P; value: T } :
    S extends ArraySchema<infer I> ? { key: P; value: Infer<I>[] } :
      S extends ObjectSchema<infer F> ? { [K in keyof F & string]: PathEntry<F[K], `${P}/${K}`> }[keyof F & string] :
        never

/** The schema-derived state path set: whole-array and leaf paths only, indexed-element paths excluded. */
type PathMap<S extends BaseSchema> = { [E in PathEntry<S, ""> as E["key"]]: E["value"] }

/** A schema-bound `statePath` factory: only schema-derived path strings type-check. */
function statePath<S extends BaseSchema>() {
  return <P extends keyof PathMap<S> & string>(path: P): P => path
}

/**
 * Agreement predicate: the schema-derived runtime token key set equals the schema-derived path set.
 * Cross-checks two independent type traversals (`CollectTokens` against `PathEntry`/`PathMap`).
 */
type StateTokenKeysMirrorPathSet<S extends BaseSchema> = Equal<keyof CollectTokens<S, "">, keyof PathMap<S> & string>

type ObjectKindStatePaths<S extends BaseSchema> = {
  [P in keyof PathMap<S> & string]: KindFor<PathMap<S>[P]> extends "object" ? P : never
}[keyof PathMap<S> & string]

/** Agreement predicate: no schema-derived state path classifies to the `object` kind (objects are recursed, never emitted). */
type NoObjectKindStatePath<S extends BaseSchema> = Equal<ObjectKindStatePaths<S>, never>

export { objectFields, kindOf, fieldsKindOf, itemContextOf, collectTokens, buildStateTokens, statePath }
export type {
  CollectTokens,
  PathEntry,
  PathMap,
  StateTokenKeysMirrorPathSet,
  NoObjectKindStatePath,
}
