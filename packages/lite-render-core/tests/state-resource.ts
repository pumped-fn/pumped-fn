import { resource, type Lite } from "@pumped-fn/lite"

/** A minimal @pumped-fn/lite-only mutable state holder for fixtures, standing in for a lite-react scopedValue. */
export function stateResource<S>(initial: () => S): Lite.Resource<{ get(): S; update(fn: (prev: S) => S): void }> {
  return resource<{ get(): S; update(fn: (prev: S) => S): void }>({
    factory: () => {
      let state = initial()
      return {
        get: () => state,
        update: (fn) => {
          state = fn(state)
        },
      }
    },
  })
}
