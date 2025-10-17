import { derive, name } from "@pumped-fn/core-next"
import { render } from "ink"
import React from "react"
import { stateAggregatorExecutor } from "./aggregator"

const DevtoolsApp: React.FC<{ snapshot: any }> = ({ snapshot }) => {
  return React.createElement("div", {}, "Pumped-FN Devtools")
}

export const tuiExecutor = derive([stateAggregatorExecutor], ([aggregator], ctl) => {
  let instance: ReturnType<typeof render> | null = null

  const start = () => {
    if (instance) return

    const snapshot = aggregator.getSnapshot()
    instance = render(React.createElement(DevtoolsApp, { snapshot }))
  }

  const stop = () => {
    if (instance) {
      instance.unmount()
      instance = null
    }
  }

  ctl.cleanup(() => stop())

  return {
    start,
    stop
  }
}, name("tui"))
