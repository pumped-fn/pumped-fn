import { describe, test, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import ts from "typescript"
import config from "../vitest.config"

const root = process.cwd()
const allowedTestInclude = ["**/*.test.ts", "**/*.test.tsx"]
const allowedStubGlobals = new Map([
  ["capstone/fat/tests/auth-provider.test.ts", new Set(["fetch"])],
  ["capstone/fat/tests/bff-client.test.ts", new Set(["fetch"])],
  ["capstone/thin/tests/bff-client.test.ts", new Set(["fetch"])],
])

type ConfigWithTestInclude = {
  test?: {
    include?: string[]
  }
}

type GuardedCall = {
  file: string
  line: number
  call: "mock" | "spyOn" | "stubGlobal"
  global: string | undefined
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

function declaresJsdom(source: string): boolean {
  const head = source.slice(0, source.search(/^import /m) >>> 0)
  return /@vitest-environment\s+jsdom/.test(head)
}

function packagePath(file: string): string {
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

describe("inside-out", () => {
  test("Vitest only includes the .test.ts/.test.tsx surface — .spec files cannot bypass structural guards", () => {
    expect((config as ConfigWithTestInclude).test?.include).toEqual(allowedTestInclude)
  })

  test("only *.dom.test.tsx may opt into jsdom — logic tests stay in node, can never touch the DOM", () => {
    for (const file of testFiles(root)) {
      if (file.endsWith("environment-split.test.ts")) continue
      const isDom = file.endsWith(".dom.test.tsx")
      const optsIn = declaresJsdom(readFileSync(file, "utf8"))
      if (isDom) {
        expect(optsIn, `${file} must declare the jsdom environment`).toBe(true)
      } else {
        expect(optsIn, `${file} is a logic test and must not opt into jsdom`).toBe(false)
      }
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
})
