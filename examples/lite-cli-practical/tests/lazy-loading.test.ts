import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"

const root = process.cwd()
const routers = ["src/commander-cli.ts", "src/yargs-cli.ts", "src/cac-cli.ts"]

function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8")
}

function runtimeImports(path: string): string[] {
  const file = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true)
  const imports: string[] = []
  for (const statement of file.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.importClause?.isTypeOnly !== true
    ) {
      imports.push(statement.moduleSpecifier.text)
    }
  }
  return imports.sort()
}

function dynamicImports(path: string): string[] {
  const file = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true)
  const imports: string[] = []

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }

  visit(file)
  return imports.sort()
}

describe("lazy loading", () => {
  test("parser modules do not import the Lite graph or command implementations at startup", () => {
    expect(Object.fromEntries(routers.map((path) => [path, runtimeImports(path)]))).toEqual({
      "src/cac-cli.ts": ["./args", "cac"],
      "src/commander-cli.ts": ["./args", "commander"],
      "src/yargs-cli.ts": ["./args", "yargs"],
    })
  })

  test("parser actions import only the selected command implementation", () => {
    expect(Object.fromEntries(routers.map((path) => [path, dynamicImports(path)]))).toEqual({
      "src/cac-cli.ts": ["./commands/audit", "./commands/deploy"],
      "src/commander-cli.ts": ["./commands/audit", "./commands/deploy"],
      "src/yargs-cli.ts": ["./commands/audit", "./commands/deploy"],
    })
  })
})
