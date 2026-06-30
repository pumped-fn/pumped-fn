import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("example guardrails", () => {
  it("keeps framework values explicit through deps and composition roots", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
    const files = [
      "src/domain.ts",
      "src/start.ts",
      "src/functions.ts",
      "src/TodoApp.tsx",
      "tests/domain.test.ts",
      "tests/server-functions.test.ts",
    ].map((path) => [path, readFileSync(resolve(root, path), "utf8")] as const)
    const forbidden = [
      ["scope parameter helper", /\b(?:request|call|get|exec|handler)\s*\(\s*scope\b/],
      ["context parameter helper", /\b(?:get|exec)\s*\(\s*context\b/],
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
