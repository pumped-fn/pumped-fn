import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("example guardrails", () => {
  it("keeps framework values explicit through deps and composition roots", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
    const files = [
      "src/domain.ts",
      "src/routeTree.gen.ts",
      "src/router.tsx",
      "src/start.ts",
      "src/todo.functions.ts",
      "src/routes/__root.tsx",
      "src/routes/index.tsx",
      "tests/dev-mode.test.ts",
      "tests/domain.test.ts",
      "tests/server-functions.test.ts",
    ].map((path) => [path, readFileSync(resolve(root, path), "utf8")] as const)
    const forbidden = [
      ["exported scope", /\bexport\s+const\s+scope\b/],
      ["scope parameter helper", /\b(?:request|call|get|exec|handler)\s*\(\s*scope\b/],
      ["context parameter helper", /\b(?:get|exec|tags)\s*\(\s*(?:parent|context)\b/],
      ["ambient tag read", new RegExp(`\\.data\\.${["seek", "Tag"].join("")}\\s*\\(`)],
      ["ambient data read", /\.data\.(?:get|seek)\s*\(/],
    ] as const

    for (const [path, source] of files) {
      for (const [name, pattern] of forbidden) {
        expect(source, `${path} contains ${name}`).not.toMatch(pattern)
      }
    }
    expect(readFileSync(resolve(root, "src/routes/index.tsx"), "utf8")).toContain(
      'createFileRoute("/")'
    )
    expect(readFileSync(resolve(root, "src/start.ts"), "utf8")).toContain("requestMiddleware")
    expect(readFileSync(resolve(root, "src/start.ts"), "utf8")).toContain("middleware: [request]")
  })
})
