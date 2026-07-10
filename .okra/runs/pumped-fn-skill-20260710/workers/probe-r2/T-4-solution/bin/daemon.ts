import { createInterface } from "node:readline"
import { createApp } from "../src/wire.ts"
import { lowBatterySweep, reportPosition, type FleetOps } from "../src/telemetry.ts"

const fleetOps: FleetOps = {
  async dispatchPickup(_scooterId: string) {
    return { accepted: true }
  },
}

let tick = 0
const app = createApp({ fleetOps, now: () => tick++ })
const input = createInterface({ input: process.stdin, crlfDelay: Infinity })

function rejection(error: unknown) {
  return JSON.stringify({
    error: String(error),
    cause: String((error as Error & { cause?: unknown }).cause),
  })
}

for await (const line of input) {
  const session = app.scope.createContext()
  try {
    await session.exec({ flow: reportPosition, rawInput: JSON.parse(line) })
    await session.close({ ok: true })
  } catch (error) {
    await session.close({ ok: false, error })
    console.error(rejection(error))
  }
}

const session = app.scope.createContext()
try {
  await session.exec({ flow: lowBatterySweep })
  await session.close({ ok: true })
} catch (error) {
  await session.close({ ok: false, error })
  console.error(rejection(error))
}
console.log(JSON.stringify(app.trail()))
await app.scope.dispose()
