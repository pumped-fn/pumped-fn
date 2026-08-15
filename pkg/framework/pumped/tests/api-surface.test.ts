import { describe, expect, it } from "vitest"
import * as index from "../src/index"

describe("the public surface stays compact", () => {
  it("exports exactly the declared values, nothing overlapping Lite or the build internals", () => {
    expect(Object.keys(index).sort()).toEqual([
      "HostStartError",
      "analyze",
      "app",
      "cliHost",
      "cliInvocation",
      "command",
      "cronHost",
      "cronTick",
      "defineConfig",
      "entry",
      "httpError",
      "httpHost",
      "httpRequest",
      "httpResponse",
      "route",
      "schedule",
      "workflow",
      "workflowHost",
      "workflowRun",
    ])
  })
})
