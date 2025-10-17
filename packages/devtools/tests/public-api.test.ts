import { describe, it, expect } from "vitest"
import * as devtools from "../src/index"

describe("Public API", () => {
  it("should export createDevtoolsExtension", () => {
    expect(devtools.createDevtoolsExtension).toBeDefined()
  })

  it("should export tuiExecutor", () => {
    expect(devtools.tuiExecutor).toBeDefined()
  })

  it("should export types namespace", () => {
    expect(devtools.Transport).toBeDefined()
    expect(devtools.State).toBeDefined()
  })
})
