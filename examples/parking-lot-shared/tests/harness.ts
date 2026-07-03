import { createScope, preset, type Lite } from "@pumped-fn/lite"
import { observable } from "@pumped-fn/lite-extension-observable"
import { actor, clock, createMemoryStore, store, type Actor } from "../src"

export function parking(at: string, as: Actor, ...presets: Lite.Preset<any, any>[]) {
  const sink = observable.memory()

  const scope = createScope({
    extensions: [observable.extension()],
    presets: [preset(store, createMemoryStore()), preset(clock, () => at), ...presets],
    tags: [actor(as), observable.runtime({ sinks: [sink] })],
  })

  return { scope, ctx: scope.createContext(), sink }
}
