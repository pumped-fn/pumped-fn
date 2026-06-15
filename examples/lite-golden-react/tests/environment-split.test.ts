import { describe, test, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

function testFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "coverage" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...testFiles(full))
    } else if (entry.includes(".test.")) {
      out.push(full)
    }
  }
  return out
}

function declaresJsdom(source: string): boolean {
  const head = source.slice(0, source.search(/^import /m) >>> 0)
  return /@vitest-environment\s+jsdom/.test(head)
}

describe("inside-out", () => {
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
})
