import { createScope, preset } from "@pumped-fn/lite"
import { analyze } from "@pumped-fn/pumped"
import { describe, expect, it } from "vitest"
import east from "../src/apps/east"
import { directory, greet, region } from "../src/domain/greet"
import greeting from "../src/entries/greet"

describe("pumped tour", () => {
  it("composes the east app over the default app", () => {
    expect(region.get(east.tags ?? [])).toBe("east")
    expect(region.collect(east.tags ?? [])).toEqual(["east", "default"])
  })

  it("tests the shared flow through the scope seam", async () => {
    const scope = createScope({
      tags: [region("test")],
      presets: [preset(directory, { displayName: (name: string) => name.toUpperCase() })],
    })

    await expect(scope.run({ flow: greet, input: { name: "Ada" } })).resolves.toEqual({
      message: "Hello, ADA from test",
    })
    await scope.dispose()
  })

  it("shows the declared graph without running a factory, and proves both hosts mount the one entry", () => {
    const report = analyze({
      app: east,
      entries: [{ name: "greet", file: "src/entries/greet.ts", entry: greeting }],
    })

    expect(report.idOf(greet)).toBe("flow:greet")
    expect(report.idOf(directory)).toBe("atom:directory")
    expect(report.edges).toContainEqual({
      from: "flow:greet",
      to: "atom:directory",
      kind: "depends-on",
      key: "directory",
    })
    expect(report.unknowns).toContainEqual({ from: "flow:greet", reason: "factory-body" })
    expect(report.failures).toEqual([])
  })
})
