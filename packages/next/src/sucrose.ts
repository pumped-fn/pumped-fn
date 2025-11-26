import { type Core } from "./types"
import { type Tag } from "./tag"

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
    compiled: ((deps: unknown, ctl: unknown) => unknown) | undefined
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
 * Strips string literals from code to avoid false positives in identifier detection.
 */
function stripStrings(code: string): string {
  let result = ""
  let i = 0
  while (i < code.length) {
    const char = code[i]
    if (char === '"' || char === "'" || char === "`") {
      const quote = char
      i++
      while (i < code.length) {
        if (code[i] === "\\") {
          i += 2
        } else if (code[i] === quote) {
          i++
          break
        } else {
          i++
        }
      }
    } else {
      result += char
      i++
    }
  }
  return result
}

/**
 * Checks if function body likely references closure variables (free variables).
 * Returns true if compilation should be skipped.
 */
function hasFreeVariables(body: string, depsParam: string | undefined, ctlParam: string): boolean {
  const strippedBody = stripStrings(body)

  const knownGlobals = new Set([
    "undefined", "null", "true", "false", "NaN", "Infinity",
    "Object", "Array", "String", "Number", "Boolean", "Symbol", "BigInt",
    "Function", "Date", "RegExp", "Error", "Map", "Set", "WeakMap", "WeakSet",
    "Promise", "JSON", "Math", "console", "setTimeout", "setInterval", "clearTimeout", "clearInterval",
    "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURI", "decodeURI",
    "encodeURIComponent", "decodeURIComponent", "eval", "globalThis", "window", "global",
    "process", "Buffer", "require", "module", "exports", "__dirname", "__filename",
    "this", "new", "return", "throw", "if", "else", "for", "while", "do", "switch",
    "case", "break", "continue", "try", "catch", "finally", "const", "let", "var",
    "typeof", "instanceof", "in", "of", "async", "await", "yield", "class", "extends",
    "import", "export", "default", "from", "as", "static", "get", "set",
  ])

  const identifierPattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g
  let match

  const localVars = new Set<string>()
  if (depsParam) {
    if (depsParam.startsWith("[")) {
      const arrayMatch = depsParam.match(/^\[([^\]]+)\]/)
      if (arrayMatch) {
        arrayMatch[1].split(",").forEach(v => localVars.add(v.trim()))
      }
    } else if (depsParam.startsWith("{")) {
      const recordMatch = depsParam.match(/^\{([^}]+)\}/)
      if (recordMatch) {
        recordMatch[1].split(",").forEach(v => localVars.add(v.trim().split(":")[0].trim()))
      }
    } else {
      localVars.add(depsParam.split(":")[0].trim())
    }
  }
  if (ctlParam) {
    localVars.add(ctlParam.split(":")[0].trim())
  }
  localVars.add("deps")
  localVars.add("ctl")

  const declPattern = /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g
  let declMatch
  while ((declMatch = declPattern.exec(strippedBody)) !== null) {
    localVars.add(declMatch[1])
  }

  const propertyAccessPositions = new Set<number>()
  const dotAccessPattern = /\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g
  let dotMatch
  while ((dotMatch = dotAccessPattern.exec(strippedBody)) !== null) {
    propertyAccessPositions.add(dotMatch.index + 1)
  }

  while ((match = identifierPattern.exec(strippedBody)) !== null) {
    const id = match[1]
    if (propertyAccessPositions.has(match.index)) {
      continue
    }
    if (!knownGlobals.has(id) && !localVars.has(id)) {
      return true
    }
  }

  return false
}

/**
 * Generates optimized compiled function via `new Function()` for JIT execution.
 * @param fn - Factory function to compile
 * @param dependencyShape - Expected dependency structure
 * @param executorName - Name for sourceURL debugging comment
 * @returns Compiled function with unified (deps, ctl) signature, or undefined if compilation not safe
 */
function splitFirstParam(params: string): [string, boolean] {
  let depth = 0
  let inString = false
  let stringChar = ""

  for (let i = 0; i < params.length; i++) {
    const char = params[i]

    if (inString) {
      if (char === stringChar && params[i - 1] !== "\\") {
        inString = false
      }
      continue
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = true
      stringChar = char
      continue
    }

    if (char === "[" || char === "{") {
      depth++
    } else if (char === "]" || char === "}") {
      depth--
    } else if (char === "," && depth === 0) {
      return [params.slice(0, i).trim(), true]
    }
  }

  return [params.trim(), false]
}

export function generate(
  fn: Function,
  dependencyShape: Sucrose.DependencyShape,
  executorName: string
): ((deps: unknown, ctl: unknown) => unknown) | undefined {
  const content = fn.toString()
  const [params, body] = separateFunction(fn)
  const isAsync = content.trimStart().startsWith("async")

  let depsParam: string | undefined
  let ctlParam: string

  if (dependencyShape === "none") {
    depsParam = undefined
    ctlParam = params.trim()
  } else {
    const [dp, hasCtl] = splitFirstParam(params)
    depsParam = dp
    ctlParam = hasCtl ? params.slice(params.indexOf(",") + 1).trim() : ""
  }

  if (hasFreeVariables(body, depsParam, ctlParam)) {
    return undefined
  }

  let bindings = ""

  if (dependencyShape !== "none" && depsParam) {
    if (depsParam === "deps" || depsParam.startsWith("deps:")) {
      bindings = ""
    } else {
      bindings = `const ${depsParam} = deps;`
    }
  }

  const hasReturn = body.includes("return ") || body.includes("return;") || body.includes("return\n")
  const startsWithStatement = body.trimStart().startsWith("throw ") || body.trimStart().match(/^(const|let|var|if|for|while|switch|try)\s/)
  const isMultiStatement = body.includes(";") || body.includes("\n")

  const bodyWithReturn = (hasReturn || isMultiStatement || startsWithStatement) ? body : `return ${body}`

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

const metadataStore = new WeakMap<object, Sucrose.Metadata>()

/**
 * Retrieves stored metadata for an executor.
 * @param executor - Executor object to retrieve metadata for
 * @returns Metadata if found, undefined otherwise
 */
export function getMetadata(executor: object): Sucrose.Metadata | undefined {
  return metadataStore.get(executor)
}

/**
 * Compiles a factory function with static analysis and stores metadata.
 * @param fn - Factory function to compile
 * @param dependencyShape - Expected dependency structure
 * @param executor - Optional executor to associate metadata with
 * @param tags - Optional array of tags for extracting metadata (e.g., name tag)
 * @returns Compiled metadata including inference, compiled function, and debugging info
 */
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
  const compiled = generate(fn, dependencyShape, executorName || "anonymous")
  const callSite = captureCallSite()

  const metadata: Sucrose.Metadata = {
    inference,
    compiled,
    original: fn,
    callSite,
    name: executorName,
  }

  if (executor) {
    metadataStore.set(executor, metadata)
  }

  return metadata
}
