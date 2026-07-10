import { createInterface } from "node:readline"
import { createScope } from "@pumped-fn/lite"
import type { FleetOps } from "../src/telemetry.ts"
import { fleetOps, lowBatterySweep, reportPosition } from "../src/telemetry.ts"
import { createApp } from "../src/wire.ts"

const cannedOps: FleetOps = {
  dispatchPickup: (scooterId) => Promise.resolve({ accepted: scooterId.length > 0 }),
}

void createApp

const scope = createScope({ tags: [fleetOps(cannedOps)] })
const session = scope.createContext()

for await (const line of createInterface({ input: process.stdin })) {
  if (line.trim() === "") continue
  try {
    await session.exec({ flow: reportPosition, rawInput: JSON.parse(line) })
  } catch {
    console.error(JSON.stringify({ rejected: true }))
  }
}

const sweep = await session.exec({ flow: lowBatterySweep })
await session.close()
await scope.dispose()
console.log(JSON.stringify({ sweep, trail: [] }, null, 2))
