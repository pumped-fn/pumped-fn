import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript-api"
import { describe, expect, it } from "vitest"
import { ENTRY_CLI_SOURCE, ENTRY_SERVER_SOURCE } from "../src/plugin"
import * as packageRuntime from "../src/runtime"

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src")

function parse(source: string, fileName = "module.ts"): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function namedImportsFrom(source: string, moduleSpecifier: string): string[] {
  return parse(source).statements.flatMap((node) => {
    if (
      !ts.isImportDeclaration(node) ||
      !ts.isStringLiteralLike(node.moduleSpecifier) ||
      node.moduleSpecifier.text !== moduleSpecifier
    ) {
      return []
    }
    const bindings = node.importClause?.namedBindings
    if (bindings === undefined || !ts.isNamedImports(bindings)) return []
    return bindings.elements.map((specifier) => specifier.propertyName?.text ?? specifier.name.text)
  })
}

function moduleSpecifiers(source: string, fileName: string): string[] {
  const specifiers: string[] = []
  const append = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments
      if (argument !== undefined && ts.isStringLiteralLike(argument)) specifiers.push(argument.text)
    }
    ts.forEachChild(node, append)
  }
  append(parse(source, fileName))
  return specifiers
}

function moduleFile(specifier: string, fromFile: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined
  const base = resolve(dirname(fromFile), specifier)
  return [`${base}.ts`, `${base}/index.ts`].find(existsSync)
}

function reachableBareSpecifiers(entryFile: string, sources: ReadonlyMap<string, string> = new Map()): Set<string> {
  const bare = new Set<string>()
  const seen = new Set<string>()
  const queue = [entryFile]

  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)

    for (const specifier of moduleSpecifiers(sources.get(file) ?? readFileSync(file, "utf8"), file)) {
      const local = moduleFile(specifier, file)
      if (local === undefined) bare.add(specifier)
      else queue.push(local)
    }
  }

  return bare
}

describe("generated entry templates reference real package exports", () => {
  const runtimeExports = new Set(Object.keys(packageRuntime))

  it("entry-server imports only exports that exist on the runtime entry", () => {
    const imports = namedImportsFrom(ENTRY_SERVER_SOURCE, "@pumped-fn/pumped/runtime")

    expect(imports.length).toBeGreaterThan(0)
    for (const name of imports) expect(runtimeExports.has(name)).toBe(true)
  })

  it("entry-cli imports only exports that exist on the runtime entry", () => {
    const imports = namedImportsFrom(ENTRY_CLI_SOURCE, "@pumped-fn/pumped/runtime")

    expect(imports.length).toBeGreaterThan(0)
    for (const name of imports) expect(runtimeExports.has(name)).toBe(true)
  })

  it("neither generated entry imports the vite-carrying package index", () => {
    expect(namedImportsFrom(ENTRY_SERVER_SOURCE, "@pumped-fn/pumped")).toEqual([])
    expect(namedImportsFrom(ENTRY_CLI_SOURCE, "@pumped-fn/pumped")).toEqual([])
  })
})

describe("the runtime entry keeps build-time dependencies out of production", () => {
  it("reads static imports, re-exports, bare imports, and dynamic imports", () => {
    expect(
      moduleSpecifiers(
        `
import "bare"
import value from './default'
export { value } from "./named"
export * from './all'
void import("./dynamic")
`,
        "fixture.ts"
      )
    ).toEqual(["bare", "./default", "./named", "./all", "./dynamic"])
  })

  it("never reaches vite", () => {
    expect(reachableBareSpecifiers(resolve(srcDir, "runtime.ts"))).not.toContain("vite")
  })

  it("detects vite through a single-quoted re-export", () => {
    const entryFile = resolve(srcDir, "runtime.ts")
    const sources = new Map([
      [entryFile, `${readFileSync(entryFile, "utf8")}\nexport { pumped } from './plugin'\n`],
    ])

    expect(reachableBareSpecifiers(entryFile, sources)).toContain("vite")
  })

  it("still proves the check works by finding vite from the package index", () => {
    expect(reachableBareSpecifiers(resolve(srcDir, "index.ts"))).toContain("vite")
  })
})
