import { tracedDepSymbol, type Lite } from "./types"

export function traced<T>(dep: Lite.Atom<T> & Lite.TracedAccept<T>): Lite.TracedDep<T> {
  return {
    [tracedDepSymbol]: true,
    atom: dep,
  }
}

export function isTracedDep(value: unknown): value is Lite.TracedDep<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[tracedDepSymbol] === true
  )
}
