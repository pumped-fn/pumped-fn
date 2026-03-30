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
  resourceSymbol,
} from "./symbols"
export { tag, tags, isTag, isTagged, isTagExecutor, getAllTags } from "./tag"
export { atom, isAtom, controller, isControllerDep } from "./atom"
export { flow, isFlow, typed } from "./flow"
export { preset, isPreset } from "./preset"
export { resource, isResource } from "./resource"
export { service } from "./service"
export { createScope, setControllerReadHook } from "./scope"
export { shallowEqual } from "./equality"
export { ParseError } from "./errors"

export const VERSION = "0.0.1"
