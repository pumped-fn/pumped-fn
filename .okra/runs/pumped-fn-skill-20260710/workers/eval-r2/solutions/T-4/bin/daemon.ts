import { createInterface } from "node:readline"
import { createApp } from "../src/wire.ts"
import { lowBatterySweep, reportPosition, type FleetOps } from "../src/telemetry.ts"

const fleetOps: FleetOps = {
  async dispatchPickup(_scooterId) {
    return { accepted: true }
  },
}

const app = createApp({ fleetOps, now: () => 0 })
const session = app.scope.createContext()
const input = createInterface({ input: process.stdin, crlfDelay: Infinity })

function rejectionMessage(error: unknown) {
  if (error instanceof Error && error.cause instanceof Error) return `${error.message}: ${error.cause.message}`
  return String(error)
}

for await (const line of input) {
  try {
    await session.exec({ flow: reportPosition, rawInput: JSON.parse(line) })
  } catch (error) {
    process.stderr.write(`${rejectionMessage(error)}\n`)
  }
}

try {
  await session.exec({ flow: lowBatterySweep })
  await session.close({ ok: true })
} catch (error) {
  await session.close({ ok: false, error })
  process.stderr.write(`${rejectionMessage(error)}\n`)
}

process.stdout.write(`${JSON.stringify(app.trail())}\n`)
await app.scope.dispose()
