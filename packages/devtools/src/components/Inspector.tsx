import React from "react"
import { Box, Text } from "ink"
import { type State } from "../types"

export const Inspector: React.FC<{ snapshot: State.Snapshot }> = ({ snapshot }) => {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" padding={1}>
      <Text bold color="magenta">Inspector</Text>
      <Text>Total executors: {snapshot.executors.size}</Text>
      <Text>Active flows: {snapshot.flows.size}</Text>
      <Text>Updates: {snapshot.updates.length}</Text>
    </Box>
  )
}
