export type { Lite, AtomState } from "./types"
export {
  attributeSymbol,
  attributedSymbol,
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
  ParseError,
  FlowFault,
} from "./types"
export { tag, tags, isTag, isTagged, isTagExecutor, getAllTags } from "./tag"
export { atom, isAtom, controller, isControllerDep } from "./atom"
export { flow, isFlow, typed, isFault } from "./flow"
export { attribute, flag, isAttribute, isAttributed, normalizeAttributes } from "./attribute"
export { preset, isPreset } from "./preset"
export { resource, isResource } from "./resource"
export { createScope, isStreamingExec, setControllerReadHook, shallowEqual } from "./scope"
export { registerInTracker, startArrayTracking, stopArrayTracking, startTracking, stopTracking } from "./tracker"

declare const __PUMPED_LITE_VERSION__: string

/** Current package version. */
export const VERSION: string = typeof __PUMPED_LITE_VERSION__ === "string" ? __PUMPED_LITE_VERSION__ : "0.0.0-source"
