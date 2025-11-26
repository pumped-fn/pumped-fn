import { type Core } from "./types"
import { type Tag } from "./tag"
import { Promised } from "./primitives"

export type ControllerFactory =
  | "none"
  | ((scope: Core.Scope, executor: Core.Executor<unknown>, registerCleanup: (fn: Core.Cleanup) => void) => Core.Controller)


export namespace Sucrose {
  export type DependencyShape = "none" | "single" | "array" | "record"

  export interface Inference {
    usesCleanup: boolean
    usesRelease: boolean
    usesReload: boolean
    usesScope: boolean
    dependencyShape: DependencyShape
    dependencyAccess: (number | string)[]
  }

  export interface Metadata {
    inference: Inference
    controllerFactory: ControllerFactory
    callSite: string
    name: string | undefined
    original: Function
    executor?: Core.Executor<unknown>
  }
}

const NOOP_CLEANUP = () => {}
const RESOLVED_VOID = Promised.create(Promise.resolve())

export const NOOP_CONTROLLER: Core.Controller = Object.freeze({
  cleanup: NOOP_CLEANUP,
  release: () => RESOLVED_VOID,
  reload: () => RESOLVED_VOID,
  scope: null as unknown as Core.Scope,
})

export function separateFunction(fn: Function): [string, string] {
  const content = fn.toString()

  const asyncMatch = content.match(/^async\s*/)
  const withoutAsync = asyncMatch ? content.slice(asyncMatch[0].length) : content

  const arrowIndex = withoutAsync.indexOf("=>")
  if (arrowIndex !== -1) {
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

  const funcMatch = withoutAsync.match(/^function\s*[^(]*\(([^)]*)\)\s*\{([\s\S]*)\}$/)
  if (funcMatch) {
    const params = funcMatch[1].trim()
    const body = funcMatch[2].trim()
    return [params, body]
  }

  const methodMatch = withoutAsync.match(/^[^(]*\(([^)]*)\)\s*\{([\s\S]*)\}$/)
  if (methodMatch) {
    const params = methodMatch[1].trim()
    const body = methodMatch[2].trim()
    return [params, body]
  }

  throw new Error("Unsupported function syntax")
}

export function analyze(
  fn: Function,
  dependencyShape: Sucrose.DependencyShape
): Sucrose.Inference {
  let params: string
  let body: string

  try {
    [params, body] = separateFunction(fn)
  } catch {
    return {
      usesCleanup: true,
      usesRelease: true,
      usesReload: true,
      usesScope: true,
      dependencyShape,
      dependencyAccess: [],
    }
  }

  const ctlParam = dependencyShape === "none" ? params : params.split(",").pop()?.trim() || ""
  const ctlName = ctlParam.split(":")[0].trim()

  const usesCleanup = !!ctlName && new RegExp(`${ctlName}\\.cleanup`).test(body)
  const usesRelease = !!ctlName && new RegExp(`${ctlName}\\.release`).test(body)
  const usesReload = !!ctlName && new RegExp(`${ctlName}\\.reload`).test(body)
  const usesScope = !!ctlName && new RegExp(`${ctlName}\\.scope`).test(body)

  const controllerPassedToFunction = !!ctlName && new RegExp(`\\b${ctlName}\\b`).test(body)
    && !(usesCleanup || usesRelease || usesReload || usesScope)

  const dependencyAccess: (number | string)[] = []

  if (dependencyShape === "array") {
    const arrayMatch = params.match(/^\[([^\]]+)\]/)
    if (arrayMatch) {
      const destructured = arrayMatch[1].split(",").map((s) => s.trim())
      destructured.forEach((varName, index) => {
        if (varName && new RegExp(`\\b${varName}\\b`).test(body)) {
          dependencyAccess.push(index)
        }
      })
    }
  } else if (dependencyShape === "record") {
    const recordMatch = params.match(/^\{([^}]+)\}/)
    if (recordMatch) {
      const destructured = recordMatch[1].split(",").map((s) => s.trim().split(":")[0].trim())
      destructured.forEach((varName) => {
        if (varName && new RegExp(`\\b${varName}\\b`).test(body)) {
          dependencyAccess.push(varName)
        }
      })
    }
  }

  return {
    usesCleanup: usesCleanup || controllerPassedToFunction,
    usesRelease: usesRelease || controllerPassedToFunction,
    usesReload: usesReload || controllerPassedToFunction,
    usesScope: usesScope || controllerPassedToFunction,
    dependencyShape,
    dependencyAccess,
  }
}

export function captureCallSite(): string {
  const err = new Error()
  const stack = err.stack || ""

  const lines = stack.split("\n")
  const relevantLines = lines.slice(2).filter((line) => !line.includes("sucrose.ts"))

  return relevantLines[0]?.trim() || "unknown"
}

const metadataStore = new WeakMap<object, Sucrose.Metadata>()

export function getMetadata(executor: object): Sucrose.Metadata | undefined {
  return metadataStore.get(executor)
}

export function compile(
  fn: Function,
  dependencyShape: Sucrose.DependencyShape,
  executor: Core.Executor<unknown> | undefined,
  tags: Tag.Tagged[] | undefined
): Sucrose.Metadata {
  const nameTagKey = Symbol.for("pumped-fn/name")
  let executorName: string | undefined

  if (tags) {
    const nameTagged = tags.find((t) => t.key === nameTagKey)
    if (nameTagged) {
      executorName = nameTagged.value as string
    }
  }

  const inference = analyze(fn, dependencyShape)
  const callSite = captureCallSite()
  const controllerFactory = createControllerFactory(inference)

  const metadata: Sucrose.Metadata = {
    inference,
    controllerFactory,
    callSite,
    name: executorName,
    original: fn,
    executor,
  }

  if (executor) {
    metadataStore.set(executor, metadata)
  }

  return metadata
}

export function createControllerFactory(inference: Sucrose.Inference): ControllerFactory {
  const { usesCleanup, usesRelease, usesReload, usesScope } = inference

  if (!usesCleanup && !usesRelease && !usesReload && !usesScope) {
    return "none"
  }

  return (scope, executor, registerCleanup) => {
    return {
      cleanup: registerCleanup,
      release: () => scope.release(executor),
      reload: () => scope.resolve(executor, true).map(() => undefined),
      scope,
    }
  }
}

