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

export function separateFunction(fn: Function): [string, string] {
  const content = fn.toString()

  const asyncMatch = content.match(/^async\s*/)
  const withoutAsync = asyncMatch ? content.slice(asyncMatch[0].length) : content

  const arrowIndex = withoutAsync.indexOf("=>")
  if (arrowIndex === -1) {
    throw new Error("Only arrow functions are supported")
  }

  let params = withoutAsync.slice(0, arrowIndex).trim()

  if (params.startsWith("(") && params.endsWith(")")) {
    params = params.slice(1, -1).trim()
  }

  let body = withoutAsync.slice(arrowIndex + 2).trim()

  if (body.startsWith("{") && body.endsWith("}")) {
    body = body.slice(1, -1).trim()
  }

  return [params, body]
}
