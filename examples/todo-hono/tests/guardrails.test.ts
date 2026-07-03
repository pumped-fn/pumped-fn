import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("example guardrails", () => {
  it("keeps framework values explicit through deps and composition roots", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
    const files = [
      "src/app.ts",
      "src/domain.ts",
      "tests/domain.test.ts",
      "tests/http.test.ts",
    ].map((path) => [path, readFileSync(resolve(root, path), "utf8")] as const)
    const forbidden = [
      ["exported scope", /\bexport\s+const\s+scope\b/],
      ["scope parameter helper", /\b(?:middleware|get|exec|handler)\s*\(\s*scope\b/],
      ["context parameter helper", /\b(?:get|exec|tags)\s*\(\s*(?:parent|context)\b/],
      ["ambient tag read", new RegExp(`\\.data\\.${["seek", "Tag"].join("")}\\s*\\(`)],
      ["ambient data read", /\.data\.(?:get|seek)\s*\(/],
    ] as const

    for (const [path, source] of files) {
      for (const [name, pattern] of forbidden) {
        expect(source, `${path} contains ${name}`).not.toMatch(pattern)
      }
    }
  })
})
