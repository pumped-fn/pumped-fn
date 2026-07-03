import { createScope, preset, type Lite } from "@pumped-fn/lite"
import { observable } from "@pumped-fn/lite-extension-observable"
import { actor, clock, type Actor } from "../src"

export interface ParkingOptions {
  at: string
  as: Actor
  observe?: boolean
  presets?: Lite.Preset<any, any>[]
  tags?: Lite.Tagged<any>[]
}

export interface Parking {
  scope: Lite.Scope
  sink: ReturnType<typeof observable.memory> | undefined
  exec: Lite.ExecutionContext
}

/**
 * Replaces the hand-written scope+context setup repeated across matrix tests:
 * ```typescript
 * const obsSink = observable.memory()
 * const scope = createScope({
 *   extensions: [observable.extension()],
 *   presets: [preset(store, backing), preset(clock, () => "2026-07-01T08:00:00.000Z")],
 *   tags: [actor({ id: "operator-1", role: "operator" }), observable.runtime({ sinks: [obsSink] })],
 * })
 * const ctx = scope.createContext()
 * ```
 * `observe` opts into the observable extension and its memory sink; when
 * omitted (or false), no observable wiring is installed and `sink` is
 * `undefined`. `presets` (e.g. `preset(store, backing)` to share a backing
 * store across scopes) and `tags` are appended through verbatim -- callers
 * name every extra preset/tag explicitly, nothing is silently merged or
 * filtered.
 */
export function parking({ at, as, observe = false, presets = [], tags = [] }: ParkingOptions): Parking {
  const sink = observe ? observable.memory() : undefined

  const scope = createScope({
    extensions: observe ? [observable.extension()] : [],
    presets: [preset(clock, () => at), ...presets],
    tags: [actor(as), ...(sink ? [observable.runtime({ sinks: [sink] })] : []), ...tags],
  })

  return { scope, sink, exec: scope.createContext() }
}
