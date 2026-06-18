import { describe, test, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, isAbsolute, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const configSource = readFileSync(join(root, "vitest.config.ts"), "utf8")
const allowedNodeExclude = "**/*.browser.test.tsx"
const allowedStubGlobals = new Map([
  ["capstone/fat/tests/auth-provider.test.ts", new Set(["fetch"])],
  ["capstone/fat/tests/bff-client.test.ts", new Set(["fetch"])],
  ["capstone/thin/tests/bff-client.test.ts", new Set(["fetch"])],
])
const allowedSourceAmbientEffects = new Map([
  ["capstone/fat/src/app.ts:bffHttp", new Set(["fetch"])],
  ["capstone/fat/src/auth.ts:authHttp", new Set(["fetch"])],
  ["capstone/fat/src/main.tsx:mountMain", new Set(["document"])],
  ["capstone/thin/src/bff.ts:bffHttp", new Set(["fetch"])],
  ["capstone/thin/src/main.tsx:mountMain", new Set(["document"])],
  ["patterns/F13-main-bootstrap/main.tsx:mountMain", new Set(["document"])],
])

type GuardedCall = {
  file: string
  line: number
  call: "mock" | "spyOn" | "stubGlobal"
  global: string | undefined
}

type AmbientEffect = {
  file: string
  declaration: string
  line: number
  effect: string
}

type ReactExecutionBoundaryViolation = {
  file: string
  declaration: string
  line: number
  violation: "useScope" | "createContext" | "close" | "scopeArgument"
}

function testFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir).sort()) {
    if (entry === "node_modules" || entry === "coverage" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...testFiles(full))
    } else if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) {
      out.push(full)
    }
  }
  return out
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir).sort()) {
    if (entry === "node_modules" || entry === "coverage" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
    } else if (
      (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
      !entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx") &&
      !entry.startsWith("before.")
    ) {
      out.push(full)
    }
  }
  return out
}

function declaresJsdom(source: string): boolean {
  const head = source.slice(0, source.search(/^import /m) >>> 0)
  return /@vitest-environment\s+jsdom/.test(head)
}

function packagePath(file: string): string {
  if (!isAbsolute(file)) return file.split(sep).join("/")
  return relative(root, file).split(sep).join("/")
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
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const calls: GuardedCall[] = []
  const { viNames, guardedFns } = collectViBindings(sourceFile)

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      viNames.has(node.expression.expression.text)
    ) {
      const call = guardedCallName(node.expression.name.text)
      if (call) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.expression.getStart(sourceFile))
        calls.push({
          file: packagePath(file),
          line: position.line + 1,
          call,
          global: stringLiteral(node.arguments[0]),
        })
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const call = guardedFns.get(node.expression.text)
      if (call) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.expression.getStart(sourceFile))
        calls.push({
          file: packagePath(file),
          line: position.line + 1,
          call,
          global: stringLiteral(node.arguments[0]),
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return calls
}

function viCalls(file: string): GuardedCall[] {
  return viCallsFromSource(file, readFileSync(file, "utf8"))
}

function guardedCalls(): GuardedCall[] {
  return testFiles(root).flatMap(viCalls)
}

function ambientEffectName(node: ts.Node): string | undefined {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    if (
      node.expression.text === "fetch" ||
      node.expression.text === "Date" ||
      node.expression.text === "setTimeout" ||
      node.expression.text === "setInterval" ||
      node.expression.text === "clearTimeout" ||
      node.expression.text === "clearInterval"
    ) {
      return node.expression.text
    }
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const receiver = node.expression.expression
    const property = node.expression.name.text
    if (
      ts.isIdentifier(receiver) &&
      (receiver.text === "globalThis" || receiver.text === "window") &&
      (property === "fetch" ||
        property === "setTimeout" ||
        property === "setInterval" ||
        property === "clearTimeout" ||
        property === "clearInterval")
    ) {
      return property
    }
    if (ts.isIdentifier(receiver) && receiver.text === "Date" && property === "now") return "Date.now"
    if (ts.isIdentifier(receiver) && receiver.text === "Math" && property === "random") return "Math.random"
    if (ts.isIdentifier(receiver) && receiver.text === "crypto" && property === "randomUUID") {
      return "crypto.randomUUID"
    }
  }
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Date") return "Date"
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    if (
      node.expression.text === "document" ||
      node.expression.text === "window" ||
      node.expression.text === "navigator" ||
      node.expression.text === "localStorage" ||
      node.expression.text === "sessionStorage"
    ) {
      return node.expression.text
    }
  }
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression)) {
    if (
      node.expression.text === "WebSocket" ||
      node.expression.text === "EventSource" ||
      node.expression.text === "XMLHttpRequest"
    ) {
      return node.expression.text
    }
  }
  return undefined
}

function declarationName(statement: ts.Statement): string {
  if (ts.isFunctionDeclaration(statement) && statement.name) return statement.name.text
  if (ts.isVariableStatement(statement)) {
    const [declaration] = statement.declarationList.declarations
    if (declaration && ts.isIdentifier(declaration.name)) return declaration.name.text
  }
  return "<top-level>"
}

function ambientEffectsFromSource(file: string, source: string): AmbientEffect[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const effects: AmbientEffect[] = []

  function visit(node: ts.Node, declaration: string): void {
    const effect = ambientEffectName(node)
    if (effect) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
      effects.push({ file: packagePath(file), declaration, line: position.line + 1, effect })
    }
    ts.forEachChild(node, (child) => visit(child, declaration))
  }

  for (const statement of sourceFile.statements) visit(statement, declarationName(statement))
  return effects
}

function sourceAmbientViolationsFromSource(file: string, source: string): AmbientEffect[] {
  return ambientEffectsFromSource(file, source).filter(
    ({ file, declaration, effect }) => !allowedSourceAmbientEffects.get(`${file}:${declaration}`)?.has(effect),
  )
}

function sourceAmbientViolations(): AmbientEffect[] {
  return [
    ...sourceFiles(join(root, "capstone")),
    ...sourceFiles(join(root, "patterns", "F13-main-bootstrap")),
  ].flatMap((file) => sourceAmbientViolationsFromSource(file, readFileSync(file, "utf8")))
}

function collectLiteReactScopeBindings(sourceFile: ts.SourceFile): {
  useScopeNames: Set<string>
  liteReactNamespaces: Set<string>
} {
  const useScopeNames = new Set<string>()
  const liteReactNamespaces = new Set<string>()

  for (const statement of sourceFile.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text === "@pumped-fn/lite-react" &&
      statement.importClause?.namedBindings
    ) {
      const bindings = statement.importClause.namedBindings
      if (ts.isNamespaceImport(bindings)) {
        liteReactNamespaces.add(bindings.name.text)
      } else {
        for (const specifier of bindings.elements) {
          if ((specifier.propertyName ?? specifier.name).text === "useScope") {
            useScopeNames.add(specifier.name.text)
          }
        }
      }
    }
  }

  return { useScopeNames, liteReactNamespaces }
}

function reactExecutionBoundaryViolationsFromSource(file: string, source: string): ReactExecutionBoundaryViolation[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const { useScopeNames, liteReactNamespaces } = collectLiteReactScopeBindings(sourceFile)
  const violations: ReactExecutionBoundaryViolation[] = []

  function push(node: ts.Node, declaration: string, violation: ReactExecutionBoundaryViolation["violation"]): void {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    violations.push({ file: packagePath(file), declaration, line: position.line + 1, violation })
  }

  function visit(node: ts.Node, declaration: string): void {
    if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && useScopeNames.has(node.expression.text)) {
        push(node.expression, declaration, "useScope")
      }
      if (ts.isPropertyAccessExpression(node.expression)) {
        if (
          ts.isIdentifier(node.expression.expression) &&
          liteReactNamespaces.has(node.expression.expression.text) &&
          node.expression.name.text === "useScope"
        ) {
          push(node.expression, declaration, "useScope")
        }
        if (node.expression.name.text === "createContext" || node.expression.name.text === "close") {
          push(node.expression, declaration, node.expression.name.text)
        }
      }
      if (node.arguments.some((argument) => ts.isIdentifier(argument) && argument.text === "scope")) {
        push(node.expression, declaration, "scopeArgument")
      }
    }
    ts.forEachChild(node, (child) => visit(child, declaration))
  }

  for (const statement of sourceFile.statements) visit(statement, declarationName(statement))
  return violations
}

function reactObserverSourceFiles(): string[] {
  return [
    ...sourceFiles(join(root, "capstone")),
    ...sourceFiles(join(root, "patterns", "F13-main-bootstrap")),
  ].filter((file) => file.endsWith(".tsx"))
}

function reactExecutionBoundaryViolations(): ReactExecutionBoundaryViolation[] {
  return reactObserverSourceFiles().flatMap((file) =>
    reactExecutionBoundaryViolationsFromSource(file, readFileSync(file, "utf8")),
  )
}

describe("inside-out", () => {
  test("Vitest splits node graph tests from browser observer tests", () => {
    expect(configSource).toContain('name: "node"')
    expect(configSource).toContain('include: ["**/*.test.ts", "**/*.test.tsx"]')
    expect(configSource).toContain(`exclude: [...configDefaults.exclude, "${allowedNodeExclude}"]`)
    expect(configSource).toContain('name: "browser"')
    expect(configSource).toContain('include: ["**/*.browser.test.tsx"]')
    expect(configSource).toContain("enabled: true")
    expect(configSource).toContain("headless: true")
    expect(configSource).toContain('instances: [{ browser: "chromium" }]')
  })

  test("only *.browser.test.tsx may render observers, and no test may opt into jsdom", () => {
    for (const file of testFiles(root)) {
      if (file.endsWith("environment-split.test.ts")) continue
      const isTsx = file.endsWith(".test.tsx")
      const isBrowser = file.endsWith(".browser.test.tsx")
      const source = readFileSync(file, "utf8")
      expect(declaresJsdom(source), `${file} must not opt into jsdom`).toBe(false)
      if (isTsx) expect(isBrowser, `${file} must use the browser observer suffix`).toBe(true)
    }
  })

  test("tests do not mock graph dependencies or stub globals outside adapter-owned fetch tests", () => {
    const calls = guardedCalls()
    const stubGlobalFiles = [
      ...new Set(calls.filter(({ call }) => call === "stubGlobal").map(({ file }) => file)),
    ].sort()
    const violations = calls.filter(({ call, file, global }) => {
      if (call === "mock" || call === "spyOn") return true
      return !allowedStubGlobals.get(file)?.has(global ?? "")
    })

    expect(stubGlobalFiles).toEqual([...allowedStubGlobals.keys()].sort())
    expect(violations).toEqual([])
  })

  test("the vi guard catches aliases and destructured guarded calls", () => {
    const calls = viCallsFromSource(
      join(root, "tests/alias-canary.test.ts"),
      [
        'import { vi as vitestVi } from "vitest"',
        'const v = vitestVi',
        'const { mock, spyOn, stubGlobal: stub } = v',
        'const m = v.mock',
        'v.mock("module-a")',
        'mock("module-b")',
        'm("module-c")',
        'spyOn(Date, "now")',
        'stub("fetch")',
      ].join("\n"),
    )

    expect(calls.map(({ call, global }) => [call, global])).toEqual([
      ["mock", "module-a"],
      ["mock", "module-b"],
      ["mock", "module-c"],
      ["spyOn", undefined],
      ["stubGlobal", "fetch"],
    ])
  })

  test("source ambient APIs stay inside adapter and composition-root boundaries", () => {
    const leakingFeature = [
      'import { atom } from "@pumped-fn/lite"',
      "export const dashboard = atom({",
      "  factory: async () => fetch('/dashboard'),",
      "})",
      "export function Dashboard() {",
      "  return document.body.textContent",
      "}",
    ].join("\n")
    const sameFileFeatureLeak = [
      'import { atom } from "@pumped-fn/lite"',
      "export const dashboard = atom({",
      "  factory: async () => fetch('/dashboard'),",
      "})",
    ].join("\n")
    const allowedTransport = [
      'import { atom, tag, tags } from "@pumped-fn/lite"',
      "const baseUrl = tag<string>({ label: 'baseUrl', default: 'http://localhost' })",
      "export const bffHttp = atom({",
      "  deps: { baseUrl: tags.required(baseUrl) },",
      "  factory: (_ctx, { baseUrl }) => ({ get: () => fetch(baseUrl) }),",
      "})",
    ].join("\n")

    expect(
      sourceAmbientViolationsFromSource("capstone/thin/src/dashboard.ts", leakingFeature).map(
        ({ declaration, effect }) => `${declaration}:${effect}`,
      ),
    ).toEqual(["dashboard:fetch", "Dashboard:document"])
    expect(
      sourceAmbientViolationsFromSource("capstone/fat/src/app.ts", sameFileFeatureLeak).map(
        ({ declaration, effect }) => `${declaration}:${effect}`,
      ),
    ).toEqual(["dashboard:fetch"])
    expect(sourceAmbientViolationsFromSource("capstone/thin/src/bff.ts", allowedTransport)).toEqual([])
    expect(sourceAmbientViolations()).toEqual([])
  })

  test("React observers use the provided execution context instead of manually owning contexts", () => {
    const manualObserver = [
      'import { useScope } from "@pumped-fn/lite-react"',
      "export function App() {",
      "  const scope = useScope()",
      "  const run = async () => {",
      "    const ctx = scope.createContext()",
      "    await ctx.close({ ok: true })",
      "  }",
      "  return null",
      "}",
    ].join("\n")
    const aliasedObserver = [
      'import { useScope as useLiteScope } from "@pumped-fn/lite-react"',
      "export function App() {",
      "  useLiteScope()",
      "  return null",
      "}",
    ].join("\n")
    const namespaceObserver = [
      'import * as LiteReact from "@pumped-fn/lite-react"',
      "export function App() {",
      "  LiteReact.useScope()",
      "  return null",
      "}",
    ].join("\n")
    const scopeArgumentObserver = [
      "export function App() {",
      "  const scope = {}",
      "  run(scope)",
      "  return null",
      "}",
    ].join("\n")
    const providerRoot = [
      'import { createScope } from "@pumped-fn/lite"',
      'import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"',
      "export function mountMain() {",
      "  const scope = createScope()",
      "  return (",
      "    <ScopeProvider scope={scope}>",
      "      <ExecutionContextProvider>",
      "        <div />",
      "      </ExecutionContextProvider>",
      "    </ScopeProvider>",
      "  )",
      "}",
    ].join("\n")

    expect(
      reactExecutionBoundaryViolationsFromSource(join(root, "capstone/fat/src/LoginForm.tsx"), manualObserver).map(
        ({ declaration, violation }) => `${declaration}:${violation}`,
      ),
    ).toEqual(["App:useScope", "App:createContext", "App:close"])
    expect(
      reactExecutionBoundaryViolationsFromSource(join(root, "capstone/thin/src/LoginScreen.tsx"), aliasedObserver).map(
        ({ declaration, violation }) => `${declaration}:${violation}`,
      ),
    ).toEqual(["App:useScope"])
    expect(
      reactExecutionBoundaryViolationsFromSource(join(root, "patterns/F13-main-bootstrap/view.tsx"), namespaceObserver).map(
        ({ declaration, violation }) => `${declaration}:${violation}`,
      ),
    ).toEqual(["App:useScope"])
    expect(
      reactExecutionBoundaryViolationsFromSource(join(root, "patterns/F13-main-bootstrap/view.tsx"), scopeArgumentObserver).map(
        ({ declaration, violation }) => `${declaration}:${violation}`,
      ),
    ).toEqual(["App:scopeArgument"])
    expect(reactExecutionBoundaryViolationsFromSource(join(root, "capstone/fat/src/main.tsx"), providerRoot)).toEqual([])
    expect(reactExecutionBoundaryViolations()).toEqual([])
  })
})
