import { createStoreAdapter } from '@json-render/core/store-utils'
import type { StateModel, StateStore } from '@json-render/core'
import type { ScopedValueAccess } from '@pumped-fn/lite-react'

type ScopedValueStateSource<State extends object> = Pick<ScopedValueAccess<State>, 'getSnapshot' | 'set' | 'subscribe'>

interface ScopedValueStateStoreOptions<State extends object = StateModel> {
  value: ScopedValueStateSource<State>
}

interface ScopedValueStateStoreSliceOptions<State extends object> {
  value: ScopedValueStateSource<State>
  selector(state: State): StateModel
  updater(nextState: StateModel, value: ScopedValueStateSource<State>): void
}

function scopedValueStateStore<State extends object>(
  options: ScopedValueStateStoreOptions<State>
): StateStore
function scopedValueStateStore<State extends object>(
  options: ScopedValueStateStoreSliceOptions<State>
): StateStore
function scopedValueStateStore<State extends object>(
  options: ScopedValueStateStoreOptions<State> | ScopedValueStateStoreSliceOptions<State>
): StateStore {
  const source = options.value
  const selector: (state: State) => StateModel = 'selector' in options
    ? options.selector
    : (state) => state as unknown as StateModel
  const updater: (next: StateModel, value: ScopedValueStateSource<State>) => void = 'updater' in options
    ? options.updater
    : (next, value) => value.set(next as unknown as State)

  return createStoreAdapter({
    getSnapshot: () => selector(source.getSnapshot()),
    setSnapshot: (next) => updater(next, source),
    subscribe(listener) {
      let prev = selector(source.getSnapshot())
      return source.subscribe(() => {
        const current = selector(source.getSnapshot())
        if (current !== prev) {
          prev = current
          listener()
          prev = selector(source.getSnapshot())
        }
      })
    },
  })
}

export { scopedValueStateStore }
export type { ScopedValueStateSource, ScopedValueStateStoreOptions, ScopedValueStateStoreSliceOptions }
