import { createScope, preset } from "@pumped-fn/pumped/app"
import { describe, expect, it } from "vitest"
import east from "../src/apps/east"
import { directory, greet, region } from "../src/domain/greet"

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
})
