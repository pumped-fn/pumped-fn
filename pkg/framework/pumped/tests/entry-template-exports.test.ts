import { Parser } from "acorn"
import type { ImportDeclaration, Program } from "estree"
import { describe, expect, it } from "vitest"
import { ENTRY_CLI_SOURCE, ENTRY_SERVER_SOURCE } from "../src/plugin"
import * as packageIndex from "../src/index"

function namedImportedIdentifier(specifier: ImportDeclaration["specifiers"][number]): string | undefined {
  if (specifier.type !== "ImportSpecifier" || specifier.imported.type !== "Identifier") return undefined
  return specifier.imported.name
}

function namedImportsFrom(source: string, moduleSpecifier: string): string[] {
  const program = Parser.parse(source, { ecmaVersion: "latest", sourceType: "module" }) as unknown as Program

  return program.body
    .filter((node): node is ImportDeclaration => node.type === "ImportDeclaration" && node.source.value === moduleSpecifier)
    .flatMap((node) => node.specifiers.map(namedImportedIdentifier).filter((name) => name !== undefined))
}

describe("generated entry templates reference real package exports", () => {
  const packageExports = new Set(Object.keys(packageIndex))

  it("entry-server imports only exports that exist on the package index", () => {
    const imports = namedImportsFrom(ENTRY_SERVER_SOURCE, "@pumped-fn/pumped")

    expect(imports.length).toBeGreaterThan(0)
    for (const name of imports) expect(packageExports.has(name)).toBe(true)
  })

  it("entry-cli imports only exports that exist on the package index", () => {
    const imports = namedImportsFrom(ENTRY_CLI_SOURCE, "@pumped-fn/pumped")

    expect(imports.length).toBeGreaterThan(0)
    for (const name of imports) expect(packageExports.has(name)).toBe(true)
  })
})
