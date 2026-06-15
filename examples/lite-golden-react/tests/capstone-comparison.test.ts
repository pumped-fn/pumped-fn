import { describe, expect, test } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = process.cwd()

describe("inside-out", () => {
  test("B4: capstone comparison documents the three logic-boundary anchors", () => {
    const source = readFileSync(resolve(root, "capstone/README.md"), "utf8")

    expect(source).toContain("https://diashort.apps.quickable.co/d/")
    expect(source).toContain("Fattest frontend")
    expect(source).toContain("Fat frontend + BFF")
    expect(source).toContain("Thin frontend + fat BFF")
    expect(source).toContain("fat frontend: 9 node-logic tests")
    expect(source).toContain("thin frontend: 5 node-logic tests")
  })

  test("B4: lite PATTERNS points readers to the tiered frontend comparison", () => {
    const source = readFileSync(resolve(root, "../../packages/lite/PATTERNS.md"), "utf8")

    expect(source).toContain("examples/lite-golden-react/capstone")
  })
})
