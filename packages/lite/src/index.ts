export type { Lite, AtomState } from "./types"
export {
  atomSymbol,
  flowSymbol,
  tagSymbol,
  taggedSymbol,
  controllerDepSymbol,
  presetSymbol,
  controllerSymbol,
  tagExecutorSymbol,
} from "./symbols"
export { tag, tags, isTag, isTagged, isTagExecutor } from "./tag"
export { atom, isAtom, controller, isControllerDep } from "./atom"
export { flow, isFlow } from "./flow"
export { preset, isPreset } from "./preset"
export { createScope } from "./scope"

export const VERSION = "0.0.1"
