export namespace Sucrose {
  export type DependencyShape = "none" | "single" | "array" | "record"

  export interface Inference {
    async: boolean
    usesCleanup: boolean
    usesRelease: boolean
    usesReload: boolean
    usesScope: boolean
    dependencyShape: DependencyShape
    dependencyAccess: (number | string)[]
  }

  export interface Metadata {
    inference: Inference
    compiled: (deps: unknown, ctl: unknown) => unknown
    original: Function
    callSite: string
    name: string | undefined
  }
}
