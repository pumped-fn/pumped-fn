import React from "react"
import { Box, Text } from "ink"
import { type State } from "../types"

export const FlowTimeline: React.FC<{ flows: State.Snapshot["flows"] }> = ({ flows }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
      <Text bold color="yellow">Flow Executions ({flows.size})</Text>
      {Array.from(flows.values()).map(flow => (
        <Box key={flow.id} marginLeft={1}>
          <Text color="blue">▶</Text>
          <Text> {flow.name || flow.id}</Text>
          <Text dimColor> depth:{flow.depth}</Text>
          {flow.endedAt && <Text color="green"> ✓</Text>}
        </Box>
      ))}
    </Box>
  )
}
