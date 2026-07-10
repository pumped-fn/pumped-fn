import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { greet, recipient, salutation } from "../src/app.ts"

describe("greet", () => {
  it("derives the greeting from the preset salutation and tag override", async () => {
    const scope = createScope({
      presets: [preset(salutation, "howdy")],
      tags: [recipient("gardeners")],
    })
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: greet })).resolves.toEqual({ text: "howdy, gardeners" })
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
