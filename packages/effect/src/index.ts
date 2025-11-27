export type { Lite } from "./types"
export {
  atomSymbol,
  flowSymbol,
  tagSymbol,
  taggedSymbol,
  lazySymbol,
  presetSymbol,
  accessorSymbol,
} from "./symbols"
export { tag, tags, isTag, isTagged } from "./tag"
export { atom, isAtom, lazy, isLazy } from "./atom"
export { flow, isFlow } from "./flow"
export { preset, isPreset } from "./preset"
export { createScope } from "./scope"

export const VERSION = "0.0.1"
