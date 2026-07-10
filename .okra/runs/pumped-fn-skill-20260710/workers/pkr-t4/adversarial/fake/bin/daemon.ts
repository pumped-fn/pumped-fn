import { createInterface } from "node:readline"
import type { FleetOps } from "../src/telemetry.ts"
import { lowBatterySweep, reportPosition } from "../src/telemetry.ts"
import { createApp } from "../src/wire.ts"

const cannedOps: FleetOps = {
  dispatchPickup: (scooterId) => Promise.resolve({ accepted: scooterId.length > 0 }),
}

const daemonClock = () => Date.now()

const offendingField = (error: unknown): string => {
  let current: unknown = error
  while (current instanceof Error) {
    const issues = (current as { issues?: { path?: (string | number)[] }[] }).issues
    const path = issues?.[0]?.path
    if (path && path.length > 0) return path.join(".")
    current = current.cause
  }
  return "input"
}

const app = createApp({ fleetOps: cannedOps, now: daemonClock })
const session = app.scope.createContext()

for await (const line of createInterface({ input: process.stdin })) {
  if (line.trim() === "") continue
  try {
    await session.exec({ flow: reportPosition, rawInput: JSON.parse(line) })
  } catch (error) {
    console.error(JSON.stringify({ rejected: true, field: offendingField(error) }))
  }
}

const sweep = await session.exec({ flow: lowBatterySweep })
await session.close()
await app.scope.dispose()
console.log(JSON.stringify({ sweep, trail: app.trail() }, null, 2))
