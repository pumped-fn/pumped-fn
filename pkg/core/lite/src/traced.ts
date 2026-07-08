import { tracedDepSymbol, type Lite } from "./types"

/**
 * @deprecated Use an adapter atom plus `ctx.exec({ fn })`. `traced()` is only a
 * loop that emits `ctx.exec({ fn })` per record member, so foreign integration is
 * clearer as: wrap the foreign client in an atom (the substitution seam), then call
 * `ctx.exec({ fn: () => client.method(args), name: "client.method", tags })` at each
 * use site. Removal is planned for the next major.
 */
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
