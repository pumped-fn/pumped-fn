import type { BaseSchema, KindOfSchema, ValueKind } from "./schema"
import type { SlotSpec } from "./spec"
import { kindOf } from "./tokens"

/** The authoring shape of a catalog: prop schemas (not yet reduced to kinds), slot specs, event payloads, capabilities. */
type CatalogInput = Record<string, {
  props: Record<string, BaseSchema>
  slots: Record<string, SlotSpec>
  events: Record<string, Record<string, ValueKind>>
  capabilities: string[]
}>

/** The verified catalog: each prop schema reduced to its {@link ValueKind}. */
type TypedCatalog<C extends CatalogInput> = {
  [N in keyof C]: {
    props: { [P in keyof C[N]["props"]]: KindOfSchema<C[N]["props"][P]> }
    slots: C[N]["slots"]
    events: C[N]["events"]
    capabilities: string[]
  }
}

function defineCatalog<const C extends CatalogInput>(catalog: C): TypedCatalog<C> {
  return Object.fromEntries(Object.entries(catalog).map(([name, entry]) => [name, {
    props: Object.fromEntries(Object.entries(entry.props).map(([prop, schema]) => [prop, kindOf(schema)])),
    slots: entry.slots,
    events: entry.events,
    capabilities: entry.capabilities,
  }])) as TypedCatalog<C>
}

export { defineCatalog }
export type { CatalogInput, TypedCatalog }
