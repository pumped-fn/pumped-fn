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

  export type CompilationSkipReason =
    | "free-variables"
    | "unsupported-syntax"
    | "compilation-error"

  export interface Metadata {
    fn: (deps: unknown, ctl: unknown) => unknown
    inference: Inference
    controllerFactory: ControllerFactory
    callSite: string
    name: string | undefined
    original: Function
    skipReason?: CompilationSkipReason
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
  const [params, body] = separateFunction(fn)

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
    usesCleanup,
    usesRelease,
    usesReload,
    usesScope,
    dependencyShape,
    dependencyAccess,
  }
}

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

function detectFreeVariable(body: string, depsParam: string | undefined, ctlParam: string): string | undefined {
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
      return id
    }
  }

  return undefined
}

function splitFirstParam(params: string): [string, string] {
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

    if (char === "[" || char === "{" || char === "<" || char === "(") {
      depth++
    } else if (char === "]" || char === "}" || char === ">" || char === ")") {
      depth--
    } else if (char === "," && depth === 0) {
      return [params.slice(0, i).trim(), params.slice(i + 1).trim()]
    }
  }

  return [params.trim(), ""]
}

export type GenerateResult =
  | { compiled: (deps: unknown, ctl: unknown) => unknown; skipReason: undefined }
  | { compiled: undefined; skipReason: Sucrose.CompilationSkipReason }

export function generate(
  fn: Function,
  dependencyShape: Sucrose.DependencyShape,
  executorName: string
): GenerateResult {
  const content = fn.toString()

  let params: string
  let body: string
  try {
    [params, body] = separateFunction(fn)
  } catch {
    return {
      compiled: undefined,
      skipReason: "unsupported-syntax"
    }
  }

  const isAsync = content.trimStart().startsWith("async")

  let depsParam: string | undefined
  let ctlParam: string

  if (dependencyShape === "none") {
    depsParam = undefined
    ctlParam = params.trim()
  } else {
    const [dp, rest] = splitFirstParam(params)
    depsParam = dp
    ctlParam = rest
  }

  const freeVar = detectFreeVariable(body, depsParam, ctlParam)
  if (freeVar) {
    return {
      compiled: undefined,
      skipReason: "free-variables"
    }
  }

  let bindings = ""

  if (dependencyShape !== "none" && depsParam) {
    if (depsParam === "deps" || depsParam.startsWith("deps:")) {
      bindings = ""
    } else {
      bindings = `const ${depsParam} = deps;`
    }
  }

  const ctlName = ctlParam.split(":")[0].trim()
  if (ctlName && ctlName !== "ctl" && !ctlName.startsWith("{") && !ctlName.startsWith("[")) {
    bindings += `\nconst ${ctlName} = ctl;`
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

  return {
    compiled: new FunctionConstructor("deps", "ctl", fnBody) as (deps: unknown, ctl: unknown) => unknown,
    skipReason: undefined
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
  const result = generate(fn, dependencyShape, executorName || "anonymous")
  const callSite = captureCallSite()
  const controllerFactory = createControllerFactory(inference)

  let normalizedFn: (deps: unknown, ctl: unknown) => unknown

  if (result.compiled) {
    normalizedFn = result.compiled
  } else {
    normalizedFn = dependencyShape === "none"
      ? (_deps: unknown, ctl: unknown) => (fn as (ctl: unknown) => unknown)(ctl)
      : (fn as (deps: unknown, ctl: unknown) => unknown)
  }

  const metadata: Sucrose.Metadata = {
    fn: normalizedFn,
    inference,
    controllerFactory,
    callSite,
    name: executorName,
    original: fn,
    skipReason: result.skipReason,
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
    const ctl: Partial<Core.Controller> = {}

    if (usesCleanup) {
      ctl.cleanup = registerCleanup
    }
    if (usesRelease) {
      ctl.release = () => scope.release(executor)
    }
    if (usesReload) {
      ctl.reload = () => scope.resolve(executor, true).map(() => undefined)
    }
    if (usesScope) {
      ctl.scope = scope
    }

    return ctl as Core.Controller
  }
}
