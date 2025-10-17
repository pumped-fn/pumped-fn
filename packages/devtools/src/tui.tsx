import { derive, name } from "@pumped-fn/core-next"
import { render } from "ink"
import React, { useState, useEffect } from "react"
import { Box, Text } from "ink"
import { stateAggregatorExecutor } from "./aggregator"
import { GraphView } from "./components/GraphView"
import { FlowTimeline } from "./components/FlowTimeline"
import { Inspector } from "./components/Inspector"
import { type State } from "./types"

const DevtoolsApp: React.FC<{ aggregator: any }> = ({ aggregator }) => {
  const [snapshot, setSnapshot] = useState<State.Snapshot>(aggregator.getSnapshot())

  useEffect(() => {
    const unsubscribe = aggregator.subscribe((newSnapshot: State.Snapshot) => {
      setSnapshot(newSnapshot)
    })
    return unsubscribe
  }, [aggregator])

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="white">🔧 Pumped-FN Devtools</Text>
      <Box marginTop={1}>
        <GraphView executors={snapshot.executors} />
      </Box>
      <Box marginTop={1}>
        <FlowTimeline flows={snapshot.flows} />
      </Box>
      <Box marginTop={1}>
        <Inspector snapshot={snapshot} />
      </Box>
    </Box>
  )
}

export const tuiExecutor = derive([stateAggregatorExecutor], ([aggregator], ctl) => {
  let instance: ReturnType<typeof render> | null = null

  const start = () => {
    if (instance) return
    instance = render(React.createElement(DevtoolsApp, { aggregator }))
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
