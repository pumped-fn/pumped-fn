import { describe, expect, test } from "vitest"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { relative, resolve } from "node:path"

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

    expect(source).toContain("https://diashort.apps.quickable.co/d/")
    expect(implemented).toContain("BFF package")
    expect(source).toContain("Fat frontend + BFF")
    expect(source).toContain("Thin frontend + fat BFF")
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

  test("B4/R6: BFF README names both seams and treats HTTP as a boundary", () => {
    const source = readSiblingPackage("lite-golden-bff", "README.md")

    expect(source).toContain("capstoneClient")
    expect(source).toContain("authProvider")
    expect(source).toContain("authenticate")
    expect(source).toContain("validate")
    expect(source).toContain("src/http.ts")
    expect(source).toContain("HTTP boundary")
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
  })
})
