import { describe, it, expect } from "vitest"
import { createScope, preset } from "@pumped-fn/core-next"
import { tuiExecutor } from "../src/tui"
import { stateAggregatorExecutor } from "../src/aggregator"

describe("TUI Executor", () => {
  it("should resolve with start/stop methods", async () => {
    const mockAggregator = {
      getSnapshot: () => ({ executors: new Map(), flows: new Map(), updates: [] }),
      subscribe: () => () => {}
    }

    const scope = createScope({
      presets: [preset(stateAggregatorExecutor, mockAggregator)]
    })

    const tui = await scope.resolve(tuiExecutor)

    expect(tui.start).toBeDefined()
    expect(tui.stop).toBeDefined()

    await scope.dispose()
  })
})
