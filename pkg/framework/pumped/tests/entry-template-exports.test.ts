import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import * as lite from "@pumped-fn/lite"
import ts from "typescript-api"
import { describe, expect, it } from "vitest"
import { entryCliSource, entryServerSource } from "../src/plugin"
import * as packageIndex from "../src/index"

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

function moduleSpecifiers(source: string, fileName: string, includeDynamic: boolean): string[] {
  const specifiers: string[] = []
  const append = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    } else if (includeDynamic && ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
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

function reachableBareSpecifiers(
  entryFile: string,
  includeDynamic: boolean,
  sources: ReadonlyMap<string, string> = new Map()
): Set<string> {
  const bare = new Set<string>()
  const seen = new Set<string>()
  const queue = [entryFile]

  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)

    for (const specifier of moduleSpecifiers(sources.get(file) ?? readFileSync(file, "utf8"), file, includeDynamic)) {
      const local = moduleFile(specifier, file)
      if (local === undefined) bare.add(specifier)
      else queue.push(local)
    }
  }

  return bare
}

describe("generated entry templates reference real package exports", () => {
  const indexExports = new Set(Object.keys(packageIndex))
  const liteExports = new Set(Object.keys(lite))

  it("entry-server imports only exports that exist on the package index and on Lite, per host census", () => {
    for (const hosts of [["http", "cron", "workflow"], ["http"], ["cron"], []] as const) {
      const source = entryServerSource([...hosts])

      for (const name of namedImportsFrom(source, "@pumped-fn/pumped")) expect(indexExports.has(name)).toBe(true)
      const fromLite = namedImportsFrom(source, "@pumped-fn/lite")
      expect(fromLite.length).toBeGreaterThan(0)
      for (const name of fromLite) expect(liteExports.has(name)).toBe(true)
    }
  })

  it("entry-server omits hosts the census does not need", () => {
    const source = entryServerSource(["http"])

    expect(source).toContain("httpHost")
    expect(source).not.toContain("cronHost")
    expect(source).not.toContain("workflowHost")
  })

  it("entry-cli imports only exports that exist on the package index and on Lite", () => {
    const source = entryCliSource()

    const fromPumped = namedImportsFrom(source, "@pumped-fn/pumped")
    expect(fromPumped.length).toBeGreaterThan(0)
    for (const name of fromPumped) expect(indexExports.has(name)).toBe(true)
    for (const name of namedImportsFrom(source, "@pumped-fn/lite")) expect(liteExports.has(name)).toBe(true)
  })
})

describe("the package index keeps transports and the toolchain out of eager evaluation", () => {
  it("reads static imports and re-exports, optionally including dynamic imports", () => {
    const source = `
import "bare"
import value from './default'
export { value } from "./named"
export * from './all'
void import("./dynamic")
`
    expect(moduleSpecifiers(source, "fixture.ts", true)).toEqual(["bare", "./default", "./named", "./all", "./dynamic"])
    expect(moduleSpecifiers(source, "fixture.ts", false)).toEqual(["bare", "./default", "./named", "./all"])
  })

  it("never statically reaches vite, hono, cac, or the scheduler from the index", () => {
    const bare = reachableBareSpecifiers(resolve(srcDir, "index.ts"), false)

    expect(bare).toContain("@pumped-fn/lite")
    for (const heavy of ["vite", "hono", "@hono/node-server", "cac", "@pumped-fn/lite-extension-scheduler", "croner"]) {
      expect(bare).not.toContain(heavy)
    }
  })

  it("reaches the transports only through dynamic imports inside hosts", () => {
    const withDynamic = reachableBareSpecifiers(resolve(srcDir, "index.ts"), true)

    expect(withDynamic).toContain("hono")
    expect(withDynamic).toContain("@hono/node-server")
    expect(withDynamic).toContain("@pumped-fn/lite-extension-scheduler")
    expect(withDynamic).not.toContain("vite")
  })

  it("detects vite through a single-quoted re-export", () => {
    const entryFile = resolve(srcDir, "index.ts")
    const sources = new Map([
      [entryFile, `${readFileSync(entryFile, "utf8")}\nexport { pumped } from './plugin'\n`],
    ])

    expect(reachableBareSpecifiers(entryFile, false, sources)).toContain("vite")
  })

  it("still proves the check works by finding vite from the bin", () => {
    expect(reachableBareSpecifiers(resolve(srcDir, "cli.ts"), false)).toContain("vite")
  })
})
