import { serviceValueSymbol, type Lite } from "./types"

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
