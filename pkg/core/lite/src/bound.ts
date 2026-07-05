import { boundDepSymbol, type Lite } from "./types"

type BoundShape<T> = T extends undefined
  ? undefined
  : T extends (ctx: Lite.ExecutionContext<any>, ...args: infer _Args) => infer _R
    ? T
    : T extends (...args: infer _Args) => infer _R
      ? never
      : T extends object
        ? {
            [K in keyof T]: T[K] extends (ctx: Lite.ExecutionContext<any>, ...args: infer _Args) => infer _R
              ? T[K]
              : T[K] extends (...args: infer _Args) => infer _R
                ? never
                : T[K]
          }
        : never

type BoundAccept<T> = [T] extends [BoundShape<T>] ? unknown : never

export function bound<T>(dep: Lite.Atom<T> & BoundAccept<T>): Lite.BoundDep<T>
export function bound<T>(dep: Lite.Resource<T> & BoundAccept<T>): Lite.BoundDep<T>
export function bound<T>(dep: Lite.TagExecutor<T, any> & BoundAccept<T>): Lite.BoundDep<T>
export function bound(dep: unknown): Lite.BoundDep<unknown> {
  return {
    [boundDepSymbol]: true,
    dep: dep as Lite.BoundDep<unknown>["dep"],
  }
}

export function isBoundDep(value: unknown): value is Lite.BoundDep<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[boundDepSymbol] === true
  )
}
