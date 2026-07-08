import { serviceValueSymbol, type Lite } from "./types"

/**
 * @deprecated Use flows, or `ctx.exec({ fn })`. `serviceValue()` is only a loop that
 * emits `ctx.exec({ fn })` per member, and a record closed over a runtime value is
 * expressed as flows that dep that value (an atom/tag) and act on it directly — see the
 * invoice-triage example, which replaced a serviceValue store with plain flows over the
 * database atom. Removal is planned for the next major.
 */
export function serviceValue<T extends Lite.ServiceMethods>(record: T): Lite.ServiceValue<T> {
  Object.defineProperty(record, serviceValueSymbol, {
    value: true,
    enumerable: false,
  })
  return record as Lite.ServiceValue<T>
}

export function isServiceValue(value: unknown): value is Lite.ServiceValue<Lite.ServiceMethods> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[serviceValueSymbol] === true
  )
}
