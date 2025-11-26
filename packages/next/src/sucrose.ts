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

/**
 * Separates arrow function into parameters and body strings.
 * @param fn - Arrow function to parse
 * @returns Tuple of [parameters, body] as strings
 * @throws Error if fn is not an arrow function
 */
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

/**
 * Analyzes factory function to detect usage patterns.
 * @param fn - Factory function to analyze
 * @param dependencyShape - Expected dependency structure
 * @returns Inference object with detected patterns
 */
export function analyze(
  fn: Function,
  dependencyShape: Sucrose.DependencyShape
): Sucrose.Inference {
  const content = fn.toString()
  const [params, body] = separateFunction(fn)

  const isAsync = content.trimStart().startsWith("async")

  const ctlParam = dependencyShape === "none" ? params : params.split(",").pop()?.trim() || ""

  const usesCleanup = new RegExp(`${ctlParam}\\.cleanup`).test(body)
  const usesRelease = new RegExp(`${ctlParam}\\.release`).test(body)
  const usesReload = new RegExp(`${ctlParam}\\.reload`).test(body)
  const usesScope = new RegExp(`${ctlParam}\\.scope`).test(body)

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
    async: isAsync,
    usesCleanup,
    usesRelease,
    usesReload,
    usesScope,
    dependencyShape,
    dependencyAccess,
  }
}

/**
 * Generates optimized compiled function via `new Function()` for JIT execution.
 * @param fn - Factory function to compile
 * @param dependencyShape - Expected dependency structure
 * @param executorName - Name for sourceURL debugging comment
 * @returns Compiled function with unified (deps, ctl) signature
 */
export function generate(
  fn: Function,
  dependencyShape: Sucrose.DependencyShape,
  executorName: string
): (deps: unknown, ctl: unknown) => unknown {
  const content = fn.toString()
  const [params, body] = separateFunction(fn)
  const isAsync = content.trimStart().startsWith("async")

  let bindings = ""

  if (dependencyShape === "none") {
    bindings = ""
  } else {
    const paramParts = params.split(",")
    paramParts.pop()
    const depsParam = paramParts.join(",").trim()
    bindings = `const ${depsParam} = deps;`
  }

  const hasReturn = body.includes("return ")
  const bodyWithReturn = hasReturn ? body : `return ${body}`

  const fnBody = `
"use strict";
${bindings}
${bodyWithReturn}
//# sourceURL=pumped-fn://${executorName}.js
`

  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  const FunctionConstructor = isAsync ? AsyncFunction : Function

  return new FunctionConstructor("deps", "ctl", fnBody) as (deps: unknown, ctl: unknown) => unknown
}

/**
 * Captures call site information from stack trace for debugging.
 * @returns Stack trace line representing the call location
 */
export function captureCallSite(): string {
  const err = new Error()
  const stack = err.stack || ""

  const lines = stack.split("\n")
  const relevantLines = lines.slice(2).filter((line) => !line.includes("sucrose.ts"))

  return relevantLines[0]?.trim() || "unknown"
}
