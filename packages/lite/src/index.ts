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
  typedSymbol,
} from "./symbols"
export { tag, tags, isTag, isTagged, isTagExecutor } from "./tag"
export { atom, isAtom, controller, isControllerDep } from "./atom"
export { flow, isFlow, typed } from "./flow"
export { preset, isPreset } from "./preset"
export { service } from "./service"
export { createScope } from "./scope"
export { ParseError } from "./errors"

export const VERSION = "0.0.1"
