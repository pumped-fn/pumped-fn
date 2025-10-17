import React from "react"
import { Box, Text } from "ink"
import { type State } from "../types"

export const GraphView: React.FC<{ executors: State.Snapshot["executors"] }> = ({ executors }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">Dependency Graph ({executors.size} executors)</Text>
      {Array.from(executors.values()).map(node => (
        <Box key={node.id} marginLeft={1}>
          <Text color="green">●</Text>
          <Text> {node.name || node.id}</Text>
          {node.resolvedAt && <Text dimColor> ({new Date(node.resolvedAt).toISOString()})</Text>}
        </Box>
      ))}
    </Box>
  )
}
