import { describe, expect, test } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"

const root = process.cwd()
const fetchAllowlist = new Set(["src/auth.ts:authHttp", "src/client.ts:capstoneHttp"])
const lifecycleAllowlist = new Set(["src/main.ts:mountBff:createContext", "src/main.ts:mountBff:close"])
const allowedStubGlobals = new Map([
  [
    "tests/auth-provider.test.ts:IO4: authHttp POST /authenticate with correct path returns parsed Session on ok",
    new Set(["fetch"]),
  ],
  ["tests/auth-provider.test.ts:IO5: authHttp non-ok POST response throws 'invalid credentials'", new Set(["fetch"])],
  [
    "tests/auth-provider.test.ts:IO6: authHttp GET /session validates a Bearer token and returns parsed Session on ok",
    new Set(["fetch"]),
  ],
  ["tests/auth-provider.test.ts:IO7: authHttp non-ok GET response throws 'invalid session'", new Set(["fetch"])],
  ["tests/client.test.ts:IO2: capstoneHttp builds the backend URL and parses the body", new Set(["fetch"])],
  ["tests/client.test.ts:IO3: capstoneHttp non-ok response throws with the status", new Set(["fetch"])],
])

type GuardedCall = {
  file: string
  testName: string
  call: "mock" | "spyOn" | "stubGlobal"
  global: string | undefined
}

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8")
}

function sourceFiles(dir: string): string[] {
  const files: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(resolve(root, current), { withFileTypes: true })) {
      const path = `${current}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path)
    }
  }
  walk(dir)
  return files.sort()
}

function isFetchCall(node: ts.CallExpression): boolean {
  const expression = node.expression
  if (ts.isIdentifier(expression)) return expression.text === "fetch"
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "fetch" &&
    ts.isIdentifier(expression.expression) &&
    (expression.expression.text === "globalThis" || expression.expression.text === "window")
  )
}

function containsFetch(node: ts.Node): boolean {
  if (ts.isCallExpression(node) && isFetchCall(node)) return true
  return ts.forEachChild(node, containsFetch) === true
}

function declarationName(statement: ts.Statement): string {
  if (ts.isFunctionDeclaration(statement) && statement.name) return statement.name.text
  if (ts.isVariableStatement(statement)) {
    const [declaration] = statement.declarationList.declarations
    if (declaration && ts.isIdentifier(declaration.name)) return declaration.name.text
  }
  return "<top-level>"
}

function fetchDeclarationsFromSource(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  return sourceFile.statements
    .filter(containsFetch)
    .map((statement) => `${file}:${declarationName(statement)}`)
}

function forbiddenFetchDeclarationsFromSource(file: string, source: string): string[] {
  return fetchDeclarationsFromSource(file, source).filter((id) => !fetchAllowlist.has(id))
}

function forbiddenFetchDeclarations(): string[] {
  return sourceFiles("src")
    .flatMap((file) => forbiddenFetchDeclarationsFromSource(file, read(file)))
    .sort()
}

function hasScopeParameter(node: ts.Node): boolean {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  ) {
    return node.parameters.some((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === "scope")
  }
  return ts.forEachChild(node, hasScopeParameter) === true
}

function scopeParameterDeclarationsFromSource(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  return sourceFile.statements
    .filter(hasScopeParameter)
    .map((statement) => `${file}:${declarationName(statement)}`)
}

function scopeParameterDeclarations(): string[] {
  return sourceFiles("src")
    .flatMap((file) => scopeParameterDeclarationsFromSource(file, read(file)))
    .sort()
}

function lifecycleCallName(node: ts.CallExpression): "createContext" | "close" | undefined {
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined
  if (node.expression.name.text === "createContext") return "createContext"
  return node.expression.name.text === "close" ? "close" : undefined
}

function lifecycleCallsFromSource(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const calls: string[] = []

  for (const statement of sourceFile.statements) {
    const name = declarationName(statement)
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const call = lifecycleCallName(node)
        if (call) calls.push(`${file}:${name}:${call}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(statement)
  }

  return calls
}

function scopeArgumentCallsFromSource(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const calls: string[] = []

  for (const statement of sourceFile.statements) {
    const name = declarationName(statement)
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        node.arguments.some((argument) => ts.isIdentifier(argument) && argument.text === "scope")
      ) {
        calls.push(`${file}:${name}:scopeArgument`)
      }
      ts.forEachChild(node, visit)
    }
    visit(statement)
  }

  return calls
}

function forbiddenLifecycleCallsFromSource(file: string, source: string): string[] {
  return [
    ...lifecycleCallsFromSource(file, source).filter((id) => !lifecycleAllowlist.has(id)),
    ...scopeArgumentCallsFromSource(file, source),
  ]
}

function forbiddenLifecycleCalls(): string[] {
  return sourceFiles("src")
    .flatMap((file) => forbiddenLifecycleCallsFromSource(file, read(file)))
    .sort()
}

function stringLiteral(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  return undefined
}

function guardedCallName(value: string): GuardedCall["call"] | undefined {
  return value === "mock" || value === "spyOn" || value === "stubGlobal" ? value : undefined
}

function bindingText(name: ts.BindingName): string | undefined {
  return ts.isIdentifier(name) ? name.text : undefined
}

function propertyText(name: ts.PropertyName | undefined, fallback: ts.BindingName): string | undefined {
  if (!name) return bindingText(fallback)
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function collectViBindings(sourceFile: ts.SourceFile): {
  viNames: Set<string>
  guardedFns: Map<string, GuardedCall["call"]>
} {
  const viNames = new Set(["vi"])
  const guardedFns = new Map<string, GuardedCall["call"]>()

  function collectImports(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "vitest" &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const specifier of node.importClause.namedBindings.elements) {
        if ((specifier.propertyName ?? specifier.name).text === "vi") viNames.add(specifier.name.text)
      }
    }
    ts.forEachChild(node, collectImports)
  }

  function collectAliases(node: ts.Node): void {
    if (!ts.isVariableDeclaration(node)) {
      ts.forEachChild(node, collectAliases)
      return
    }
    if (
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      viNames.has(node.initializer.text)
    ) {
      viNames.add(node.name.text)
    }
    if (
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isPropertyAccessExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      viNames.has(node.initializer.expression.text)
    ) {
      const call = guardedCallName(node.initializer.name.text)
      if (call) guardedFns.set(node.name.text, call)
    }
    if (
      ts.isObjectBindingPattern(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      viNames.has(node.initializer.text)
    ) {
      for (const element of node.name.elements) {
        const call = guardedCallName(propertyText(element.propertyName, element.name) ?? "")
        const local = bindingText(element.name)
        if (call && local) guardedFns.set(local, call)
      }
    }
    ts.forEachChild(node, collectAliases)
  }

  collectImports(sourceFile)
  collectAliases(sourceFile)
  return { viNames, guardedFns }
}

function viCallsFromSource(file: string, source: string): GuardedCall[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const calls: GuardedCall[] = []
  const { viNames, guardedFns } = collectViBindings(sourceFile)

  function record(node: ts.CallExpression, call: GuardedCall["call"], testName: string): void {
    calls.push({ file, testName, call, global: stringLiteral(node.arguments[0]) })
  }

  function visit(node: ts.Node, testName: string): void {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      (node.expression.text === "test" || node.expression.text === "it")
    ) {
      const nextTestName = stringLiteral(node.arguments[0]) ?? testName
      for (const arg of node.arguments.slice(1)) visit(arg, nextTestName)
      return
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      viNames.has(node.expression.expression.text)
    ) {
      const call = guardedCallName(node.expression.name.text)
      if (call) record(node, call, testName)
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const call = guardedFns.get(node.expression.text)
      if (call) record(node, call, testName)
    }
    ts.forEachChild(node, (child) => visit(child, testName))
  }

  visit(sourceFile, "<top-level>")
  return calls
}

function guardedCalls(): GuardedCall[] {
  return sourceFiles("tests").flatMap((file) => viCallsFromSource(file, read(file)))
}

describe("inside-out", () => {
  test("IO1: raw fetch is isolated to transport atoms, not capability atoms", () => {
    const forbiddenAuthProvider = [
      'import { atom } from "@pumped-fn/lite"',
      "export const authProvider = atom({",
      "  factory: () => ({",
      "    authenticate: () => fetch('/authenticate'),",
      "  }),",
      "})",
    ].join("\n")
    const forbiddenCapstoneClient = [
      'import { atom } from "@pumped-fn/lite"',
      "export const capstoneClient = atom({",
      "  factory: () => ({",
      "    listServices: () => globalThis.fetch('/services'),",
      "  }),",
      "})",
    ].join("\n")
    const allowedTransport = [
      'import { atom } from "@pumped-fn/lite"',
      "export const authHttp = atom({",
      "  factory: () => ({",
      "    post: () => fetch('/authenticate'),",
      "  }),",
      "})",
    ].join("\n")
    const forbiddenHelper = [
      "function request() {",
      "  return fetch('/authenticate')",
      "}",
      'export const authProvider = atom({ factory: () => ({ authenticate: request }) })',
    ].join("\n")

    expect(forbiddenFetchDeclarationsFromSource("canary.ts", forbiddenAuthProvider)).toEqual([
      "canary.ts:authProvider",
    ])
    expect(forbiddenFetchDeclarationsFromSource("canary.ts", forbiddenCapstoneClient)).toEqual([
      "canary.ts:capstoneClient",
    ])
    expect(forbiddenFetchDeclarationsFromSource("canary.ts", forbiddenHelper)).toEqual(["canary.ts:request"])
    expect(forbiddenFetchDeclarationsFromSource("src/auth.ts", allowedTransport)).toEqual([])
    expect(forbiddenFetchDeclarations()).toEqual([])
  })

  test("IO2: tests fake fetch only inside transport-owned tests", () => {
    const forbiddenMock = [
      'import { vi } from "vitest"',
      'test("feature test", () => {',
      '  vi.mock("./auth")',
      "})",
    ].join("\n")
    const forbiddenStub = [
      'import { vi as vitestVi } from "vitest"',
      'test("provider test", () => {',
      "  const v = vitestVi",
      "  const { stubGlobal: stub } = v",
      '  stub("fetch")',
      "})",
    ].join("\n")
    const calls = guardedCalls()
    const stubGlobalSites = [
      ...new Set(calls.filter(({ call }) => call === "stubGlobal").map(({ file, testName }) => `${file}:${testName}`)),
    ].sort()
    const violations = calls.filter(({ file, testName, call, global }) => {
      if (call === "mock" || call === "spyOn") return true
      return !allowedStubGlobals.get(`${file}:${testName}`)?.has(global ?? "")
    })

    expect(viCallsFromSource("tests/canary.test.ts", forbiddenMock).map(({ call, global }) => [call, global])).toEqual([
      ["mock", "./auth"],
    ])
    expect(viCallsFromSource("tests/canary.test.ts", forbiddenStub).map(({ call, global }) => [call, global])).toEqual([
      ["stubGlobal", "fetch"],
    ])
    expect(stubGlobalSites).toEqual([...allowedStubGlobals.keys()].sort())
    expect(violations).toEqual([])
  })

  test("IO3: BFF routes are flows, not functions that receive scope or reimplement lifecycle", () => {
    const forbiddenScopeArg = [
      "export async function handleBffRequest(scope: Lite.Scope, request: unknown) {",
      "  return request",
      "}",
    ].join("\n")
    const forbiddenLifecycle = [
      "export function execRequest(scope: Lite.Scope, run: (ctx: Lite.ExecutionContext) => Promise<unknown>) {",
      "  const ctx = scope.createContext()",
      "  return run(ctx).finally(() => ctx.close({ ok: true }))",
      "}",
    ].join("\n")
    const forbiddenScopeArgumentCall = [
      "export function route(request: unknown) {",
      "  const scope = createScope()",
      "  return handleBffRequest(scope, request)",
      "}",
    ].join("\n")
    const allowedMain = [
      "export function mountBff() {",
      "  const scope = createScope()",
      "  const ctx = scope.createContext()",
      "  return { dispose: () => ctx.close({ ok: true }) }",
      "}",
    ].join("\n")

    expect(scopeParameterDeclarationsFromSource("src/http.ts", forbiddenScopeArg)).toEqual([
      "src/http.ts:handleBffRequest",
    ])
    expect(scopeParameterDeclarationsFromSource("src/http.ts", forbiddenLifecycle)).toEqual([
      "src/http.ts:execRequest",
    ])
    expect(forbiddenLifecycleCallsFromSource("src/http.ts", forbiddenLifecycle)).toEqual([
      "src/http.ts:execRequest:createContext",
      "src/http.ts:execRequest:close",
    ])
    expect(forbiddenLifecycleCallsFromSource("src/http.ts", forbiddenScopeArgumentCall)).toEqual([
      "src/http.ts:route:scopeArgument",
    ])
    expect(forbiddenLifecycleCallsFromSource("src/main.ts", allowedMain)).toEqual([])
    expect(scopeParameterDeclarations()).toEqual([])
    expect(forbiddenLifecycleCalls()).toEqual([])
  })
})
