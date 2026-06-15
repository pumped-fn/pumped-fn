import { describe, expect, test } from "vitest"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { relative, resolve } from "node:path"
import ts from "typescript"

const root = process.cwd()

function read(path: string): string {
  return readFileSync(resolve(root, path), "utf8")
}

function readSiblingPackage(...path: string[]): string {
  return readFileSync(resolve(root, "..", ...path), "utf8")
}

function section(source: string, heading: string): string {
  const start = source.indexOf(`## ${heading}`)
  expect(start).toBeGreaterThanOrEqual(0)
  const rest = source.slice(start)
  const next = rest.slice(1).search(/^## /m)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

function tableRows(source: string, heading: string): string[][] {
  return section(source, heading)
    .split("\n")
    .filter((line) => line.startsWith("|") && !line.includes("---"))
    .slice(1)
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
}

function nodeTestFiles(dir: string): string[] {
  const files: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(resolve(root, current), { withFileTypes: true })) {
      const path = `${current}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      if (
        entry.isFile() &&
        (entry.name.endsWith(".test.ts") || (entry.name.endsWith(".test.tsx") && !entry.name.endsWith(".dom.test.tsx")))
      ) {
        files.push(relative(root, resolve(root, path)))
      }
    }
  }
  walk(dir)
  return files.sort()
}

function testCount(path: string): number {
  return (read(path).match(/\btest\(/g) ?? []).length
}

type GraphNode = {
  file: string
  name: string
  clientDeps: string[]
  authDeps: string[]
  returnsObjectCapability: boolean
}

const authWriterAllowlist = new Set(["capstone/thin/src/signIn.ts:signIn"])

function sourceFiles(dir: string): string[] {
  const files: string[] = []
  const walk = (current: string): void => {
    for (const entry of readdirSync(resolve(root, current), { withFileTypes: true })) {
      const path = `${current}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        files.push(relative(root, resolve(root, path)))
      }
    }
  }
  walk(dir)
  return files.sort()
}

function propertyName(name: ts.PropertyName | undefined): string | undefined {
  if (!name) return undefined
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  return undefined
}

function objectProperty(object: ts.ObjectLiteralExpression, key: string): ts.Expression | undefined {
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && propertyName(property.name) === key) return property.initializer
  }
  return undefined
}

function authCapabilityName(name: string): boolean {
  return /^(authed|authenticated|session).*Client$/.test(name)
}

function rawClientName(name: string): boolean {
  return /\w*Client$/.test(name) && !authCapabilityName(name)
}

function rawClientBindings(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>()

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const specifier of node.importClause.namedBindings.elements) {
        const imported = (specifier.propertyName ?? specifier.name).text
        if (rawClientName(imported)) names.add(specifier.name.text)
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && rawClientName(node.name.text)) {
      names.add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return names
}

function returnsObjectCapability(factory: ts.ArrowFunction): boolean {
  const objects: ts.ObjectLiteralExpression[] = []
  if (ts.isObjectLiteralExpression(factory.body)) objects.push(factory.body)

  function visit(node: ts.Node): void {
    if (ts.isReturnStatement(node) && node.expression && ts.isObjectLiteralExpression(node.expression)) {
      objects.push(node.expression)
    }
    ts.forEachChild(node, visit)
  }
  visit(factory.body)

  return objects.some((object) =>
    object.properties.some((property) => {
      if (ts.isMethodDeclaration(property)) return true
      return (
        ts.isPropertyAssignment(property) &&
        (ts.isArrowFunction(property.initializer) || ts.isFunctionExpression(property.initializer))
      )
    }),
  )
}

function graphNodesFromSource(file: string, source: string): GraphNode[] {
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const nodes: GraphNode[] = []
  const rawClients = rawClientBindings(sourceFile)

  function visit(node: ts.Node): void {
    if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) {
      ts.forEachChild(node, visit)
      return
    }
    if (
      !node.initializer ||
      !ts.isCallExpression(node.initializer) ||
      !ts.isIdentifier(node.initializer.expression) ||
      (node.initializer.expression.text !== "atom" && node.initializer.expression.text !== "flow")
    ) {
      ts.forEachChild(node, visit)
      return
    }
    const [config] = node.initializer.arguments
    if (!config || !ts.isObjectLiteralExpression(config)) return
    const deps = objectProperty(config, "deps")
    const factory = objectProperty(config, "factory")
    if (!deps || !ts.isObjectLiteralExpression(deps) || !factory || !ts.isArrowFunction(factory)) return

    const clientDeps: string[] = []
    const authDeps: string[] = []
    for (const property of deps.properties) {
      if (ts.isShorthandPropertyAssignment(property) && rawClients.has(property.name.text)) {
        clientDeps.push(property.name.text)
        continue
      }
      if (ts.isPropertyAssignment(property)) {
        const key = propertyName(property.name)
        if (!key) continue
        const value = property.initializer.getText(sourceFile)
        if (ts.isIdentifier(property.initializer) && rawClients.has(property.initializer.text)) clientDeps.push(key)
        if (/\bcontroller\(\s*(session|sessionToken)\b/.test(value)) authDeps.push(key)
      }
    }

    nodes.push({
      file,
      name: node.name.text,
      clientDeps,
      authDeps,
      returnsObjectCapability: returnsObjectCapability(factory),
    })
  }

  visit(sourceFile)
  return nodes
}

function authCapabilityBoundary(node: GraphNode): boolean {
  return authCapabilityName(node.name) && node.returnsObjectCapability
}

function graphNodeId(node: GraphNode): string {
  return `${node.file}:${node.name}`
}

function invalidAuthClientComposition(node: GraphNode): boolean {
  if (authCapabilityBoundary(node)) return false
  if (authWriterAllowlist.has(graphNodeId(node))) return false
  return node.clientDeps.length > 0 && node.authDeps.length > 0
}

function invalidAuthClientCompositionsFromSource(file: string, source: string): string[] {
  return graphNodesFromSource(file, source)
    .filter(invalidAuthClientComposition)
    .map(graphNodeId)
}

function invalidAuthClientCompositions(): string[] {
  return [...sourceFiles("capstone/fat/src"), ...sourceFiles("capstone/thin/src")]
    .flatMap((file) => invalidAuthClientCompositionsFromSource(file, read(file)))
    .sort()
}

function expectedNodeInventory(): string[][] {
  return [
    ...nodeTestFiles("capstone/fat/tests").map((file) => ["fat frontend", file, String(testCount(file))]),
    ...nodeTestFiles("capstone/thin/tests").map((file) => ["thin frontend", file, String(testCount(file))]),
  ]
}

function workspaceCommand(packageName: string, script: "test" | "typecheck"): string {
  return `pnpm -F ${packageName} ${script}`
}

describe("inside-out", () => {
  test("B4: capstone comparison documents implemented slices and backlog honestly", () => {
    const source = read("capstone/README.md")
    const implemented = section(source, "Implemented Slices")
    const backlog = section(source, "Backlog")
    const rules = section(source, "Boundary Rules")

    expect(source).toContain("https://diashort.apps.quickable.co/d/")
    expect(implemented).toContain("BFF package")
    expect(source).toContain("Fat frontend + BFF")
    expect(source).toContain("Thin frontend + fat BFF")
    expect(implemented).toContain("authedBffClient")
    expect(rules).toContain("Feature atoms depend on auth-capable ports")
    expect(rules).toContain("do not combine raw HTTP")
    expect(rules).toContain("manually pass credentials")
    expect(rules).toContain("Ambient browser/runtime APIs")
    expect(rules).toContain("feature graph nodes and observers do not call them inline")
    expect(implemented).not.toContain("Fattest frontend")
    expect(backlog).toContain("Fattest frontend")
    expect(backlog).toContain("raw backend")
    expect(backlog).toContain("F02-F12 frontend catalog")
    expect(existsSync(resolve(root, "capstone/fat"))).toBe(true)
    expect(existsSync(resolve(root, "capstone/thin"))).toBe(true)
    expect(existsSync(resolve(root, "capstone/raw"))).toBe(false)
    expect(existsSync(resolve(root, "capstone/fattest"))).toBe(false)
  })

  test("B4: capstone node-test inventory is derived from current test files", () => {
    const source = read("capstone/README.md")

    expect(tableRows(source, "Current Node Test Inventory")).toEqual(expectedNodeInventory())
  })

  test("B4: capstone docs do not pin prose counts outside the derived inventory", () => {
    const comparison = read("capstone/README.md")
    const docs = [
      comparison.replace(section(comparison, "Current Node Test Inventory"), ""),
      read("capstone/fat/README.md"),
      read("capstone/thin/README.md"),
    ].join("\n")

    expect(docs).not.toMatch(/\b\d+\s+(?:node-logic|logic)\s+tests\b/)
    expect(docs).not.toContain("logic tests total")
  })

  test("B4: capstone slice docs name the auth-capable client seam", () => {
    const fat = read("capstone/fat/README.md")
    const thin = read("capstone/thin/README.md")

    expect(fat).toContain("authedBffClient")
    expect(fat).toContain("auth-capable port")
    expect(fat).toContain("Dashboard feature tests preset `authedBffClient`")
    expect(fat).toContain("no other declaration")
    expect(thin).toContain("authedBffClient")
    expect(thin).toContain("auth-capable port")
    expect(thin).toContain("only thin declaration")
    expect(thin).not.toContain('preset(bffClient, fake), preset(sessionToken, "tok")')
  })

  test("B4: feature graph nodes use auth-capable clients instead of passing auth state to raw clients", () => {
    const forbidden = [
      'import { atom, controller } from "@pumped-fn/lite"',
      'import { bffClient } from "./bff"',
      "export const dashboard = atom({",
      "  deps: { client: bffClient, tokenControl: controller(sessionToken, { resolve: true, watch: true }) },",
      "  factory: async (_ctx, { client, tokenControl }) => {",
      "    const token = tokenControl.get()",
      "    if (token === null) return null",
      "    return client.dashboard(token)",
      "  },",
      "})",
    ].join("\n")
    const aliasBypass = [
      'import { atom, controller } from "@pumped-fn/lite"',
      'import { bffClient as bff } from "./bff"',
      "export const dashboard = atom({",
      "  deps: { client: bff, tokenControl: controller(sessionToken, { resolve: true, watch: true }) },",
      "  factory: async (_ctx, { client, tokenControl }) => {",
      "    const token = tokenControl.get()",
      "    const authToken = token",
      "    return client.dashboard(authToken)",
      "  },",
      "})",
    ].join("\n")
    const destructuredBypass = [
      'import { atom, controller } from "@pumped-fn/lite"',
      'import { bffClient } from "./app"',
      "export const dashboard = atom({",
      "  deps: { client: bffClient, sessionControl: controller(session, { resolve: true, watch: true }) },",
      "  factory: async (_ctx, { client, sessionControl }) => {",
      "    const { token } = sessionControl.get()!",
      "    return client.dashboard(token)",
      "  },",
      "})",
    ].join("\n")
    const allowedBoundary = [
      'import { atom, controller } from "@pumped-fn/lite"',
      'import { bffClient } from "./bff"',
      "export const authedBffClient = atom({",
      "  deps: { client: bffClient, tokenControl: controller(sessionToken, { resolve: true, watch: true }) },",
      "  factory: async (_ctx, { client, tokenControl }) => {",
      "    const token = tokenControl.get()",
      "    if (token === null) return null",
      "    return { dashboard: () => client.dashboard(token) }",
      "  },",
      "})",
      "export const dashboard = atom({",
      "  deps: { client: authedBffClient },",
      "  factory: async (_ctx, { client }) => client?.dashboard() ?? null,",
      "})",
    ].join("\n")
    const allowedAuthWriter = [
      'import { flow, controller } from "@pumped-fn/lite"',
      'import { bffClient } from "./bff"',
      "export const signIn = flow({",
      "  deps: { client: bffClient, tokenControl: controller(sessionToken, { resolve: true }) },",
      "  factory: async (_ctx, { client, tokenControl }) => {",
      '    const { token } = await client.login("a@b.com", "pass")',
      "    tokenControl.set(token)",
      "  },",
      "})",
    ].join("\n")

    expect(invalidAuthClientCompositionsFromSource("canary.ts", forbidden)).toEqual(["canary.ts:dashboard"])
    expect(invalidAuthClientCompositionsFromSource("canary.ts", aliasBypass)).toEqual(["canary.ts:dashboard"])
    expect(invalidAuthClientCompositionsFromSource("canary.ts", destructuredBypass)).toEqual(["canary.ts:dashboard"])
    expect(invalidAuthClientCompositionsFromSource("canary.ts", allowedBoundary)).toEqual([])
    expect(invalidAuthClientCompositionsFromSource("capstone/thin/src/signIn.ts", allowedAuthWriter)).toEqual([])
    expect(invalidAuthClientCompositions()).toEqual([])
  })

  test("B4/R6: BFF README names both seams and treats HTTP as a boundary", () => {
    const source = readSiblingPackage("lite-golden-bff", "README.md")

    expect(source).toContain("capstoneClient")
    expect(source).toContain("authProvider")
    expect(source).toContain("authenticate")
    expect(source).toContain("validate")
    expect(source).toContain("src/http.ts")
    expect(source).toContain("HTTP boundary")
    expect(source).toContain("src/main.ts")
    expect(source).toContain("lite composition root")
    expect(source).toContain("creates one scope")
    expect(source).toMatch(/delegates\s+requests to `handleBffRequest`/)
    expect(source).toContain("disposes that scope")
    expect(source).toContain("createScope")
    expect(source).toContain("not an in-process import path for frontend code")
    expect(source).not.toContain("single adapter")
  })

  test("F13: pattern README follows the frontend rubric", () => {
    const source = read("patterns/F13-main-bootstrap/README.md")
    const headings = source.match(/^## .+$/gm)?.map((line) => line.slice(3))

    expect(headings).toEqual(["The smell", "Harm", "Transformation", "Lens coverage", "Why 100%"])
    expect(source).toContain("main.tsx")
    expect(source).toContain("composition-root adapter")
    expect(source).toContain("returned `scope`")
  })

  test("B4: lite PATTERNS points readers to the tiered frontend comparison", () => {
    const source = read("../../packages/lite/PATTERNS.md")
    const backend = "@pumped-fn/lite-golden"
    const react = `${backend}-react`
    const bff = `${backend}-bff`

    expect(source).toContain("examples/lite-golden-react/capstone")
    expect(source).toContain("Backend golden")
    expect(source).toContain("React golden")
    expect(source).toContain("BFF golden")
    expect(source).toContain(workspaceCommand(backend, "test"))
    expect(source).toContain(workspaceCommand(backend, "typecheck"))
    expect(source).toContain(workspaceCommand(react, "test"))
    expect(source).toContain(workspaceCommand(react, "typecheck"))
    expect(source).toContain(workspaceCommand(bff, "test"))
    expect(source).toContain(workspaceCommand(bff, "typecheck"))
    expect(source).toMatch(/Fattest frontend\s+dashboard capstone and F02-F12 React catalog are backlog/)
    expect(source).toContain("guards ambient APIs by owning declaration")
    expect(source).toMatch(/BFF `main\.ts` is the lite\s+composition root/)
  })
})
