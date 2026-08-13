import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Parser } from "acorn"
import type { ImportDeclaration, Program } from "estree"
import { describe, expect, it } from "vitest"
import { ENTRY_CLI_SOURCE, ENTRY_SERVER_SOURCE } from "../src/plugin"
import * as packageRuntime from "../src/runtime"

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), "../src")

function parse(source: string): Program {
  return Parser.parse(source, { ecmaVersion: "latest", sourceType: "module" }) as unknown as Program
}

function namedImportedIdentifier(specifier: ImportDeclaration["specifiers"][number]): string | undefined {
  if (specifier.type !== "ImportSpecifier" || specifier.imported.type !== "Identifier") return undefined
  return specifier.imported.name
}

function namedImportsFrom(source: string, moduleSpecifier: string): string[] {
  return parse(source)
    .body.filter(
      (node): node is ImportDeclaration => node.type === "ImportDeclaration" && node.source.value === moduleSpecifier
    )
    .flatMap((node) => node.specifiers.map(namedImportedIdentifier).filter((name) => name !== undefined))
}

const MODULE_SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*"([^"]+)"/g

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(MODULE_SPECIFIER)].map((match) => match[1]!)
}

function moduleFile(specifier: string, fromFile: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined
  const base = resolve(dirname(fromFile), specifier)
  for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
    try {
      readFileSync(candidate, "utf8")
      return candidate
    } catch {
      continue
    }
  }
  return undefined
}

function reachableBareSpecifiers(entryFile: string): Set<string> {
  const bare = new Set<string>()
  const seen = new Set<string>()
  const queue = [entryFile]

  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    seen.add(file)

    for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
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
  it("never reaches vite", () => {
    expect(reachableBareSpecifiers(resolve(srcDir, "runtime.ts"))).not.toContain("vite")
  })

  it("still proves the check works by finding vite from the package index", () => {
    expect(reachableBareSpecifiers(resolve(srcDir, "index.ts"))).toContain("vite")
  })
})
